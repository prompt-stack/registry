#!/usr/bin/env node
/**
 * Social Media MCP
 * Post to Twitter, LinkedIn, Facebook, and Instagram from one unified interface
 *
 * Usage:
 *   - As MCP: Run without args, speaks JSON-RPC
 *   - As API: import { twitterPost, linkedinPost, ... } from './index'
 *   - As CLI: node index.ts <platform> <command> [options]
 *
 * CLI Examples:
 *   node index.ts twitter post --text "Hello world!"
 *   node index.ts linkedin post --text "Professional update"
 *   node index.ts facebook post --text "Hello" --page "Engineer Marketing"
 *   node index.ts instagram post --image ./photo.jpg --caption "Check this out"
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TwitterApi } from "twitter-api-v2";
import axios from "axios";
import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from multiple locations
const envPaths = [
  join(__dirname, "..", ".env"),
  join(__dirname, "..", "..", ".env"),
  join(homedir(), ".prompt-stack", "secrets", "social-media.env"),
];
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

// Config file paths (from original social-media-publisher)
const SOCIAL_MEDIA_BASE = "/Users/hoff/Desktop/My Drive/tools/social-media-publisher/platforms";
const META_CONFIG_PATH = join(SOCIAL_MEDIA_BASE, "meta", "pages-config.json");
const INSTAGRAM_CONFIG_PATH = join(SOCIAL_MEDIA_BASE, "meta", "instagram", "instagram-config.json");

// =============================================================================
// TWITTER
// =============================================================================

function getTwitterClient(): TwitterApi {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  });
  return client;
}

export async function twitterPost(
  text: string,
  options: { images?: string[]; dryRun?: boolean } = {}
): Promise<string> {
  if (text.length > 280) {
    throw new Error(`Tweet exceeds 280 characters (${text.length} chars)`);
  }

  if (options.dryRun) {
    return `**DRY RUN - Twitter Post**\n\nText: ${text}\n(${text.length} characters)${options.images ? `\nImages: ${options.images.length}` : ""}`;
  }

  const client = getTwitterClient();

  let mediaIds: string[] = [];
  if (options.images && options.images.length > 0) {
    // Upload images
    for (const imagePath of options.images.slice(0, 4)) {
      const mediaId = await client.v1.uploadMedia(imagePath);
      mediaIds.push(mediaId);
    }
  }

  const tweetData: any = { text };
  if (mediaIds.length > 0) {
    tweetData.media = { media_ids: mediaIds };
  }

  const response = await client.v2.tweet(tweetData);
  const tweetId = response.data.id;
  const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;

  return `**Tweet Posted**\n\n**Text:** ${text}\n**URL:** ${tweetUrl}`;
}

export async function twitterThread(
  tweets: string[],
  options: { dryRun?: boolean } = {}
): Promise<string> {
  // Validate all tweets
  for (let i = 0; i < tweets.length; i++) {
    if (tweets[i].length > 280) {
      throw new Error(`Tweet ${i + 1} exceeds 280 characters (${tweets[i].length} chars)`);
    }
  }

  if (options.dryRun) {
    let preview = `**DRY RUN - Twitter Thread (${tweets.length} tweets)**\n\n`;
    tweets.forEach((t, i) => {
      preview += `**${i + 1}.** ${t}\n(${t.length} chars)\n\n`;
    });
    return preview;
  }

  const client = getTwitterClient();
  const postedTweets: { id: string; url: string }[] = [];

  let replyToId: string | undefined;

  for (let i = 0; i < tweets.length; i++) {
    const tweetData: any = { text: tweets[i] };
    if (replyToId) {
      tweetData.reply = { in_reply_to_tweet_id: replyToId };
    }

    const response = await client.v2.tweet(tweetData);
    const tweetId = response.data.id;
    postedTweets.push({
      id: tweetId,
      url: `https://twitter.com/i/web/status/${tweetId}`,
    });
    replyToId = tweetId;

    // Rate limit protection
    if (i < tweets.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  let result = `**Thread Posted (${tweets.length} tweets)**\n\n`;
  postedTweets.forEach((t, i) => {
    result += `**${i + 1}.** ${t.url}\n`;
  });
  return result;
}

// =============================================================================
// LINKEDIN
// =============================================================================

export async function linkedinPost(
  text: string,
  options: { dryRun?: boolean } = {}
): Promise<string> {
  if (text.length > 3000) {
    throw new Error(`LinkedIn post exceeds 3000 characters (${text.length} chars)`);
  }

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  }

  if (options.dryRun) {
    return `**DRY RUN - LinkedIn Post**\n\nText: ${text}\n(${text.length} characters)`;
  }

  // Get user ID via OpenID Connect
  const userResponse = await axios.get("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userId = userResponse.data.sub;

  // Post
  const postData = {
    author: `urn:li:person:${userId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const response = await axios.post("https://api.linkedin.com/v2/ugcPosts", postData, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  const postId = response.data.id;

  return `**LinkedIn Post Published**\n\n**Text:** ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}\n**Post ID:** ${postId}\n**View:** https://www.linkedin.com/feed/`;
}

// =============================================================================
// FACEBOOK
// =============================================================================

interface FacebookPage {
  name: string;
  page_id: string;
  access_token: string;
  active: boolean;
}

function loadFacebookPages(): FacebookPage[] {
  if (!existsSync(META_CONFIG_PATH)) {
    throw new Error(`Facebook config not found at ${META_CONFIG_PATH}`);
  }
  const config = JSON.parse(readFileSync(META_CONFIG_PATH, "utf8"));
  return config.pages || [];
}

export async function facebookListPages(): Promise<string> {
  const pages = loadFacebookPages();
  const activePages = pages.filter((p) => p.active);

  let result = `**Facebook Pages (${activePages.length} active)**\n\n`;
  activePages.forEach((p) => {
    result += `- **${p.name}** (ID: ${p.page_id})\n`;
  });
  return result;
}

export async function facebookPost(
  text: string,
  options: { page?: string; pageId?: string; dryRun?: boolean } = {}
): Promise<string> {
  const pages = loadFacebookPages();

  // Find the page
  let page: FacebookPage | undefined;
  if (options.pageId) {
    page = pages.find((p) => p.page_id === options.pageId);
  } else if (options.page) {
    page = pages.find((p) => p.name.toLowerCase() === options.page!.toLowerCase());
  } else {
    page = pages.find((p) => p.active); // First active page
  }

  if (!page) {
    const available = pages
      .filter((p) => p.active)
      .map((p) => p.name)
      .join(", ");
    throw new Error(`Page not found. Available: ${available}`);
  }

  if (options.dryRun) {
    return `**DRY RUN - Facebook Post**\n\n**Page:** ${page.name}\n**Text:** ${text}`;
  }

  const response = await axios.post(`https://graph.facebook.com/v24.0/${page.page_id}/feed`, {
    message: text,
    access_token: page.access_token,
  });

  const postId = response.data.id;

  return `**Facebook Post Published**\n\n**Page:** ${page.name}\n**Text:** ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}\n**Post ID:** ${postId}\n**View:** https://www.facebook.com/${postId}`;
}

// =============================================================================
// INSTAGRAM
// =============================================================================

interface InstagramAccount {
  facebook_page_name: string;
  instagram_username: string;
  instagram_account_id: string;
  access_token: string;
  active: boolean;
}

function loadInstagramAccounts(): InstagramAccount[] {
  if (!existsSync(INSTAGRAM_CONFIG_PATH)) {
    throw new Error(`Instagram config not found at ${INSTAGRAM_CONFIG_PATH}`);
  }
  const config = JSON.parse(readFileSync(INSTAGRAM_CONFIG_PATH, "utf8"));
  return config.accounts || [];
}

export async function instagramListAccounts(): Promise<string> {
  const accounts = loadInstagramAccounts();
  const activeAccounts = accounts.filter((a) => a.active);

  let result = `**Instagram Accounts (${activeAccounts.length} active)**\n\n`;
  activeAccounts.forEach((a) => {
    result += `- **@${a.instagram_username}** (${a.facebook_page_name})\n`;
  });
  return result;
}

export async function instagramPost(
  imageUrl: string,
  caption: string,
  options: { account?: string; dryRun?: boolean } = {}
): Promise<string> {
  const accounts = loadInstagramAccounts();

  // Find the account
  let account: InstagramAccount | undefined;
  if (options.account) {
    const username = options.account.replace("@", "");
    account = accounts.find((a) => a.instagram_username === username);
  } else {
    account = accounts.find((a) => a.active); // First active account
  }

  if (!account) {
    const available = accounts
      .filter((a) => a.active)
      .map((a) => `@${a.instagram_username}`)
      .join(", ");
    throw new Error(`Account not found. Available: ${available}`);
  }

  // Validate image URL is HTTPS
  if (!imageUrl.startsWith("https://")) {
    throw new Error("Instagram requires a publicly accessible HTTPS image URL");
  }

  if (options.dryRun) {
    return `**DRY RUN - Instagram Post**\n\n**Account:** @${account.instagram_username}\n**Image:** ${imageUrl}\n**Caption:** ${caption}`;
  }

  // Step 1: Create media container
  const containerResponse = await axios.post(
    `https://graph.facebook.com/v24.0/${account.instagram_account_id}/media`,
    {
      image_url: imageUrl,
      caption: caption,
      access_token: account.access_token,
    }
  );
  const creationId = containerResponse.data.id;

  // Step 2: Publish
  const publishResponse = await axios.post(
    `https://graph.facebook.com/v24.0/${account.instagram_account_id}/media_publish`,
    {
      creation_id: creationId,
      access_token: account.access_token,
    }
  );

  const mediaId = publishResponse.data.id;

  return `**Instagram Post Published**\n\n**Account:** @${account.instagram_username}\n**Caption:** ${caption.slice(0, 100)}${caption.length > 100 ? "..." : ""}\n**Media ID:** ${mediaId}`;
}

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new Server({ name: "social-media", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "twitter_post",
      description: "Post a tweet to Twitter (max 280 chars). Can include up to 4 images.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Tweet text (max 280 characters)" },
          images: {
            type: "array",
            items: { type: "string" },
            description: "Optional array of image file paths (max 4)",
          },
          dryRun: { type: "boolean", description: "Preview without posting" },
        },
        required: ["text"],
      },
    },
    {
      name: "twitter_thread",
      description: "Post a multi-tweet thread to Twitter",
      inputSchema: {
        type: "object",
        properties: {
          tweets: {
            type: "array",
            items: { type: "string" },
            description: "Array of tweet texts (each max 280 chars)",
          },
          dryRun: { type: "boolean", description: "Preview without posting" },
        },
        required: ["tweets"],
      },
    },
    {
      name: "linkedin_post",
      description: "Post an update to LinkedIn (max 3000 chars)",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Post text (max 3000 characters)" },
          dryRun: { type: "boolean", description: "Preview without posting" },
        },
        required: ["text"],
      },
    },
    {
      name: "facebook_post",
      description: "Post to a Facebook Page. Use facebook_list_pages to see available pages.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Post text" },
          page: { type: "string", description: "Page name (e.g., 'Engineer Marketing')" },
          pageId: { type: "string", description: "Page ID (alternative to page name)" },
          dryRun: { type: "boolean", description: "Preview without posting" },
        },
        required: ["text"],
      },
    },
    {
      name: "facebook_list_pages",
      description: "List all available Facebook Pages",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "instagram_post",
      description:
        "Post an image to Instagram. Requires a publicly accessible HTTPS image URL. Use instagram_list_accounts to see available accounts.",
      inputSchema: {
        type: "object",
        properties: {
          imageUrl: { type: "string", description: "Public HTTPS URL of the image" },
          caption: { type: "string", description: "Post caption" },
          account: { type: "string", description: "Instagram username (e.g., '@engineermarketing')" },
          dryRun: { type: "boolean", description: "Preview without posting" },
        },
        required: ["imageUrl", "caption"],
      },
    },
    {
      name: "instagram_list_accounts",
      description: "List all available Instagram accounts",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "twitter_post":
        result = await twitterPost(args?.text as string, {
          images: args?.images as string[],
          dryRun: args?.dryRun as boolean,
        });
        break;
      case "twitter_thread":
        result = await twitterThread(args?.tweets as string[], {
          dryRun: args?.dryRun as boolean,
        });
        break;
      case "linkedin_post":
        result = await linkedinPost(args?.text as string, {
          dryRun: args?.dryRun as boolean,
        });
        break;
      case "facebook_post":
        result = await facebookPost(args?.text as string, {
          page: args?.page as string,
          pageId: args?.pageId as string,
          dryRun: args?.dryRun as boolean,
        });
        break;
      case "facebook_list_pages":
        result = await facebookListPages();
        break;
      case "instagram_post":
        result = await instagramPost(args?.imageUrl as string, args?.caption as string, {
          account: args?.account as string,
          dryRun: args?.dryRun as boolean,
        });
        break;
      case "instagram_list_accounts":
        result = await instagramListAccounts();
        break;
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
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

// CLI mode
if (cliArgs.length > 0 && ["twitter", "linkedin", "facebook", "instagram", "help"].includes(cliArgs[0])) {
  const platform = cliArgs[0];
  const command = cliArgs[1];

  function parseCliArgs(args: string[]): Record<string, any> {
    const opts: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith("--")) {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith("--")) {
          opts[key] = next;
          i++;
        } else {
          opts[key] = true;
        }
      }
    }
    return opts;
  }

  const opts = parseCliArgs(cliArgs.slice(2));

  (async () => {
    try {
      let result: string;

      if (platform === "help") {
        console.log(`
Social Media CLI

Usage: social-media <platform> <command> [options]

Platforms:
  twitter post --text "..."              Post a tweet
  twitter thread --tweets "..." "..."    Post a thread
  linkedin post --text "..."             Post to LinkedIn
  facebook list                          List available pages
  facebook post --text "..." [--page ""] Post to Facebook page
  instagram list                         List available accounts
  instagram post --image <url> --caption "..." [--account @...]

Options:
  --dry-run    Preview without posting
`);
        process.exit(0);
      }

      switch (platform) {
        case "twitter":
          if (command === "post") {
            result = await twitterPost(opts.text, { dryRun: opts["dry-run"] });
          } else if (command === "thread") {
            const tweets = cliArgs.slice(3).filter((a) => !a.startsWith("--"));
            result = await twitterThread(tweets, { dryRun: opts["dry-run"] });
          } else {
            throw new Error("Unknown twitter command. Use: post, thread");
          }
          break;
        case "linkedin":
          if (command === "post") {
            result = await linkedinPost(opts.text, { dryRun: opts["dry-run"] });
          } else {
            throw new Error("Unknown linkedin command. Use: post");
          }
          break;
        case "facebook":
          if (command === "list") {
            result = await facebookListPages();
          } else if (command === "post") {
            result = await facebookPost(opts.text, { page: opts.page, dryRun: opts["dry-run"] });
          } else {
            throw new Error("Unknown facebook command. Use: list, post");
          }
          break;
        case "instagram":
          if (command === "list") {
            result = await instagramListAccounts();
          } else if (command === "post") {
            result = await instagramPost(opts.image, opts.caption, {
              account: opts.account,
              dryRun: opts["dry-run"],
            });
          } else {
            throw new Error("Unknown instagram command. Use: list, post");
          }
          break;
        default:
          throw new Error("Unknown platform");
      }

      console.log(result);
    } catch (error: any) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  })();
}
// MCP mode
else if (cliArgs.length === 0 || cliArgs[0] === "--mcp") {
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
