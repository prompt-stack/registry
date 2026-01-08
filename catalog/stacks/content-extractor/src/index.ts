#!/usr/bin/env node
/**
 * Content Extractor MCP
 * Extract content from YouTube, Reddit, TikTok, and web articles
 *
 * Usage:
 *   - As MCP: Run without args, speaks JSON-RPC
 *   - As API: import { extractYouTube, extractReddit, ... } from './index'
 *   - As CLI: node index.ts <url> [output]
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { YoutubeTranscript } from "youtube-transcript";
import { writeFileSync, existsSync, statSync, mkdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { homedir } from "os";
import * as cheerio from "cheerio";
import { decode } from "html-entities";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const execAsync = promisify(exec);
const DEFAULT_OUTPUT_DIR = join(homedir(), ".rudi", "output");

// =============================================================================
// UTILITIES
// =============================================================================

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

function resolveOutputPath(output: string | undefined, prefix: string, name: string): string {
  const filename = `${prefix}-${slugify(name)}-${new Date().toISOString().split("T")[0]}.md`;
  if (!output) return join(DEFAULT_OUTPUT_DIR, filename);
  if (existsSync(output) && statSync(output).isDirectory()) return join(output, filename);
  if (output.endsWith("/") || !output.includes(".")) return join(output, filename);
  return output;
}

function ensureOutputDir() {
  if (!existsSync(DEFAULT_OUTPUT_DIR)) mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
}

// =============================================================================
// YOUTUBE EXTRACTOR
// =============================================================================

export interface YouTubeResult {
  title: string;
  author: string;
  videoId: string;
  url: string;
  duration: string;
  viewCount: number;
  hasTranscript: boolean;
  transcript: string;
  wordCount: number;
  extractionMethod?: string;
  error?: string;
}

function extractVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  throw new Error("Invalid YouTube URL or video ID");
}

async function getYouTubeTranscriptViaSupaData(videoId: string, url: string) {
  const apiKey = process.env.SUPA_DATA_API;
  if (!apiKey) return { success: false, error: "Supadata API key not configured" };

  try {
    const apiUrl = new URL("https://api.supadata.ai/v1/youtube/transcript");
    apiUrl.searchParams.append("url", url);
    apiUrl.searchParams.append("text", "true");

    const response = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    });

    if (!response.ok) throw new Error(`Supadata API returned ${response.status}`);
    const data = await response.json();
    if (!data.content) throw new Error("Supadata returned empty transcript");

    return { success: true, method: "supadata-api", transcript: data.content.trim() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function getYouTubeTranscriptViaAPI(videoId: string) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcript || transcript.length === 0) throw new Error("No captions available");

    const fullText = transcript.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    if (!fullText) throw new Error("Transcript segments contained no text");

    return { success: true, method: "youtube-transcript-api", transcript: fullText };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function getYouTubeTranscriptViaHTML(videoId: string) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    const html = await response.text();

    const captionsRegex = /"captions":\{"playerCaptionsTracklistRenderer":\{"captionTracks":\[(.*?)\]/;
    const match = html.match(captionsRegex);
    if (!match) throw new Error("No captions found in page HTML");

    const captionTracks = JSON.parse(`[${match[1]}]`);
    const englishTrack = captionTracks.find((t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en-"));
    if (!englishTrack) throw new Error("No English captions available");

    const captionResponse = await fetch(englishTrack.baseUrl);
    const captionXML = await captionResponse.text();

    const texts: string[] = [];
    let textMatch;
    const textRegex = /<text[^>]*>(.*?)<\/text>/g;
    while ((textMatch = textRegex.exec(captionXML)) !== null) {
      texts.push(textMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, ""));
    }

    return { success: true, method: "html-scraping", transcript: texts.join(" ").replace(/\s+/g, " ").trim() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function getYouTubeMetadata(videoId: string) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    const html = await response.text();

    const titleMatch = html.match(/<meta name="title" content="([^"]+)">/);
    const authorMatch = html.match(/"author":"([^"]+)"/);
    const viewsMatch = html.match(/"viewCount":"(\d+)"/);
    const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);

    return {
      title: titleMatch?.[1] || "Unknown Title",
      author: authorMatch?.[1] || "Unknown Channel",
      viewCount: viewsMatch ? parseInt(viewsMatch[1]) : 0,
      duration: lengthMatch ? parseInt(lengthMatch[1]) : 0,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
    };
  } catch {
    return { title: "Unknown Title", author: "Unknown Channel", viewCount: 0, duration: 0, url: `https://www.youtube.com/watch?v=${videoId}`, videoId };
  }
}

export async function extractYouTube(url: string): Promise<YouTubeResult> {
  const videoId = extractVideoId(url);
  const metadata = await getYouTubeMetadata(videoId);

  const methods = [
    () => getYouTubeTranscriptViaSupaData(videoId, url),
    () => getYouTubeTranscriptViaAPI(videoId),
    () => getYouTubeTranscriptViaHTML(videoId),
  ];

  for (const method of methods) {
    const result = await method();
    if (result.success && result.transcript) {
      const wordCount = result.transcript.split(/\s+/).filter((w) => w.length > 0).length;
      return {
        ...metadata,
        duration: metadata.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : "Unknown",
        hasTranscript: true,
        transcript: result.transcript,
        wordCount,
        extractionMethod: result.method,
      };
    }
  }

  return {
    ...metadata,
    duration: metadata.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : "Unknown",
    hasTranscript: false,
    transcript: "",
    wordCount: 0,
    error: "No transcript available - all extraction methods failed",
  };
}

function formatYouTubeResult(result: YouTubeResult): string {
  let text = `**YouTube Video Extracted**\n\n`;
  text += `**Title:** ${result.title}\n`;
  text += `**Channel:** ${result.author}\n`;
  text += `**Duration:** ${result.duration}\n`;
  text += `**Views:** ${result.viewCount?.toLocaleString() || "N/A"}\n`;
  text += `**URL:** ${result.url}\n`;
  if (result.hasTranscript) {
    text += `**Extraction Method:** ${result.extractionMethod}\n\n`;
    text += `---\n\n## Transcript (${result.wordCount} words)\n\n${result.transcript}`;
  } else {
    text += `\n---\n\n*No transcript available: ${result.error}*`;
  }
  return text;
}

// =============================================================================
// REDDIT EXTRACTOR
// =============================================================================

const REDDIT_USER_AGENT = "ContentExtractorMCP/1.0";

export interface RedditResult {
  title: string;
  author: string;
  subreddit: string;
  url: string;
  content: string;
  metadata: {
    score: number;
    upvoteRatio: number;
    numComments: number;
    created: string;
    permalink: string;
  };
}

async function resolveRedditShortLink(url: string): Promise<string> {
  if (!/\/r\/[^\/]+\/s\//.test(url)) return url;
  const response = await fetch(url, { headers: { "User-Agent": REDDIT_USER_AGENT }, redirect: "manual" });
  if (response.status === 301 || response.status === 302) {
    const location = response.headers.get("location");
    if (location) return location.split("?")[0];
  }
  throw new Error("Failed to resolve short link");
}

function formatRedditComment(comment: any, depth = 0): string {
  if (!comment.data || comment.kind !== "t1") return "";
  const indent = "  ".repeat(depth);
  const { author, score, body, total_awards_received } = comment.data;
  let formatted = `${indent}u/${author} | ${score} points`;
  if (total_awards_received) formatted += ` | ${total_awards_received} awards`;
  formatted += `\n${indent}${body.replace(/\n/g, "\n" + indent)}\n`;
  if (comment.data.replies?.data?.children) {
    for (const reply of comment.data.replies.data.children) {
      if (reply.kind === "t1") formatted += "\n" + formatRedditComment(reply, depth + 1);
    }
  }
  return formatted;
}

export async function extractReddit(url: string, maxComments = 20): Promise<RedditResult> {
  const resolvedUrl = await resolveRedditShortLink(url);
  const jsonUrl = resolvedUrl.replace(/\/$/, "") + ".json";

  const response = await fetch(jsonUrl, {
    headers: { "User-Agent": REDDIT_USER_AGENT, Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const data = await response.json();
  const postData = data[0].data.children[0].data;
  const commentsData = data[1].data.children;

  let content = `# ${postData.title}\n\n`;
  content += `**Posted by** u/${postData.author} in r/${postData.subreddit}\n`;
  content += `**Score:** ${postData.score} points (${Math.round(postData.upvote_ratio * 100)}% upvoted)\n`;
  content += `**Comments:** ${postData.num_comments}\n\n---\n\n`;
  if (postData.selftext) content += `${postData.selftext}\n\n`;
  content += `## Comments\n\n`;

  const topComments = commentsData.filter((c: any) => c.kind === "t1").slice(0, maxComments);
  for (const comment of topComments) {
    content += formatRedditComment(comment) + "\n---\n\n";
  }

  return {
    title: postData.title,
    author: `u/${postData.author}`,
    subreddit: postData.subreddit,
    url: resolvedUrl,
    content,
    metadata: {
      score: postData.score,
      upvoteRatio: postData.upvote_ratio,
      numComments: postData.num_comments,
      created: new Date(postData.created_utc * 1000).toISOString(),
      permalink: `https://reddit.com${postData.permalink}`,
    },
  };
}

function formatRedditResult(result: RedditResult): string {
  return `**Reddit Post Extracted**\n\n**Title:** ${result.title}\n**Author:** ${result.author}\n**Subreddit:** r/${result.subreddit}\n**Score:** ${result.metadata.score}\n\n---\n\n${result.content}`;
}

// =============================================================================
// TIKTOK EXTRACTOR
// =============================================================================

const TIKTOK_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  referer: "https://www.tiktok.com/",
};

export interface TikTokResult {
  url: string;
  hasTranscript: boolean;
  transcript: string;
  wordCount: number;
  metadata: {
    user: string;
    videoId: string;
    description: string;
    language?: string;
  };
}

function stripVtt(vtt: string): string {
  return vtt
    .split(/\r?\n/)
    .filter((l) => l && l !== "WEBVTT" && !/^\d\d:\d\d/.test(l) && !/-->/.test(l))
    .join("\n");
}

export async function extractTikTok(url: string, preferLang = "eng"): Promise<TikTokResult> {
  const response = await fetch(url, { headers: TIKTOK_HEADERS, redirect: "follow" });
  const fullUrl = response.url;
  const html = await response.text();

  const $ = cheerio.load(html);
  const script = $("#__UNIVERSAL_DATA_FOR_REHYDRATION__");

  if (!script.length) throw new Error("Could not find TikTok data");

  const data = JSON.parse(decode(script.html() || "{}"));
  const videoDetail = data.__DEFAULT_SCOPE__?.["webapp.video-detail"];

  if (!videoDetail?.itemInfo?.itemStruct) throw new Error("Could not parse TikTok video data");

  const item = videoDetail.itemInfo.itemStruct;
  const user = item.author?.uniqueId || "unknown";
  const videoId = item.id;
  const description = item.desc || "";
  const subtitles = item.video?.subtitleInfos || [];

  if (!subtitles.length) {
    return { url: fullUrl, hasTranscript: false, transcript: "", wordCount: 0, metadata: { user, videoId, description } };
  }

  const track = subtitles.find((s: any) => s.LanguageCodeName?.startsWith(preferLang)) || subtitles[0];
  const vttResponse = await fetch(track.Url, { headers: TIKTOK_HEADERS });
  const vtt = await vttResponse.text();
  const transcript = stripVtt(vtt);
  const wordCount = transcript.split(/\s+/).filter((w) => w.length > 0).length;

  return { url: fullUrl, hasTranscript: true, transcript, wordCount, metadata: { user, videoId, description, language: track.LanguageCodeName } };
}

function formatTikTokResult(result: TikTokResult): string {
  let text = `**TikTok Video Extracted**\n\n`;
  text += `**Creator:** @${result.metadata.user}\n`;
  text += `**URL:** ${result.url}\n`;
  if (result.metadata.description) text += `**Description:** ${result.metadata.description}\n`;
  if (result.hasTranscript) {
    text += `\n---\n\n## Transcript (${result.wordCount} words)\n\n${result.transcript}`;
  } else {
    text += `\n---\n\n*No captions available*`;
  }
  return text;
}

// =============================================================================
// ARTICLE EXTRACTOR
// =============================================================================

const ARTICLE_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export interface ArticleResult {
  url: string;
  title: string;
  author: string;
  siteName: string;
  domain: string;
  excerpt: string;
  content: string;
  wordCount: number;
}

function htmlToMarkdown(html: string): string {
  const turndownService = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  turndownService.addRule("removeMedia", { filter: ["img", "video", "iframe"], replacement: () => "" });
  return turndownService.turndown(html);
}

export async function extractArticle(url: string): Promise<ArticleResult> {
  const response = await fetch(url, {
    headers: { "User-Agent": ARTICLE_USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  let html = await response.text();
  const finalUrl = response.url;

  // Uncomment hidden content for Sports Reference sites
  if (url.includes("-reference.com")) {
    html = html.replace(/<!--([\s\S]*?)-->/g, "$1");
  }

  const dom = new JSDOM(html, { url: finalUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) throw new Error("Could not parse article");

  const markdown = htmlToMarkdown(article.content);
  const cleanText = markdown.replace(/\n{3,}/g, "\n\n").trim();
  const wordCount = cleanText.split(/\s+/).filter((w) => w.length > 0).length;
  const domain = new URL(finalUrl).hostname.replace("www.", "");

  return {
    url: finalUrl,
    title: article.title || "Untitled",
    author: article.byline || "Unknown",
    siteName: article.siteName || domain,
    domain,
    excerpt: article.excerpt || cleanText.substring(0, 200) + "...",
    content: cleanText,
    wordCount,
  };
}

function formatArticleResult(result: ArticleResult): string {
  return `**Article Extracted**\n\n**Title:** ${result.title}\n**Author:** ${result.author}\n**Source:** ${result.siteName}\n**URL:** ${result.url}\n**Words:** ${result.wordCount}\n\n---\n\n${result.content}`;
}

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new Server({ name: "content-extractor", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "extract_youtube",
      description: "Extract transcript from a YouTube video. Uses Supadata API (fastest) with fallbacks to youtube-transcript npm, HTML scraping, and yt-dlp. Returns video info and full transcript.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "YouTube video URL or video ID" },
          output: { type: "string", description: "Optional file path to save markdown output" },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_reddit",
      description: "Extract a Reddit post and its comments. Returns structured content with title, author, scores, and threaded comments.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Reddit thread URL (full URL or short link)" },
          max_comments: { type: "number", description: "Maximum top-level comments to include (default: 20)" },
          output: { type: "string", description: "Optional file path to save markdown output" },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_tiktok",
      description: "Extract transcript/captions from a TikTok video. Returns video info and transcript if captions are available.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "TikTok video URL (full URL or short link)" },
          lang: { type: "string", description: "Preferred language code (default: eng)" },
          output: { type: "string", description: "Optional file path to save markdown output" },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_article",
      description: "Extract clean content from a web article. Uses Readability for parsing and converts to markdown.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the article to extract" },
          output: { type: "string", description: "Optional file path to save markdown output" },
        },
        required: ["url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;
    let outputPath: string | undefined;

    switch (name) {
      case "extract_youtube": {
        const data = await extractYouTube(args?.url as string);
        result = formatYouTubeResult(data);
        if (args?.output) outputPath = resolveOutputPath(args.output as string, "youtube", data.title);
        break;
      }
      case "extract_reddit": {
        const data = await extractReddit(args?.url as string, args?.max_comments as number);
        result = formatRedditResult(data);
        if (args?.output) outputPath = resolveOutputPath(args.output as string, "reddit", data.title);
        break;
      }
      case "extract_tiktok": {
        const data = await extractTikTok(args?.url as string, args?.lang as string);
        result = formatTikTokResult(data);
        if (args?.output) outputPath = resolveOutputPath(args.output as string, "tiktok", data.metadata.user);
        break;
      }
      case "extract_article": {
        const data = await extractArticle(args?.url as string);
        result = formatArticleResult(data);
        if (args?.output) outputPath = resolveOutputPath(args.output as string, "article", data.title);
        break;
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }

    if (outputPath) {
      ensureOutputDir();
      writeFileSync(outputPath, result, "utf-8");
      return { content: [{ type: "text", text: `Saved to ${outputPath}` }] };
    }

    return { content: [{ type: "text", text: result }] };
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// =============================================================================
// ENTRY POINT
// =============================================================================

const cliArgs = process.argv.slice(2);

function detectPlatform(url: string): string | null {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.startsWith("http://") || url.startsWith("https://")) return "article";
  return null;
}

// CLI mode
if (cliArgs.length > 0 && cliArgs[0] !== "--mcp") {
  const url = cliArgs[0];
  const output = cliArgs[1];
  const platform = detectPlatform(url);

  if (!platform) {
    console.error("Could not detect platform from URL");
    process.exit(1);
  }

  (async () => {
    try {
      let result: string;
      let outputPath: string | undefined;

      switch (platform) {
        case "youtube": {
          const data = await extractYouTube(url);
          result = formatYouTubeResult(data);
          if (output) outputPath = resolveOutputPath(output, "youtube", data.title);
          break;
        }
        case "reddit": {
          const data = await extractReddit(url);
          result = formatRedditResult(data);
          if (output) outputPath = resolveOutputPath(output, "reddit", data.title);
          break;
        }
        case "tiktok": {
          const data = await extractTikTok(url);
          result = formatTikTokResult(data);
          if (output) outputPath = resolveOutputPath(output, "tiktok", data.metadata.user);
          break;
        }
        case "article": {
          const data = await extractArticle(url);
          result = formatArticleResult(data);
          if (output) outputPath = resolveOutputPath(output, "article", data.title);
          break;
        }
        default:
          throw new Error("Unknown platform");
      }

      if (outputPath) {
        ensureOutputDir();
        writeFileSync(outputPath, result, "utf-8");
        console.log(`Saved to ${outputPath}`);
      } else {
        console.log(result);
      }
    } catch (error: any) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  })();
}
// MCP mode
else {
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
