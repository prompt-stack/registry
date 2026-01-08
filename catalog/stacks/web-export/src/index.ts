#!/usr/bin/env node
/**
 * Web Export MCP
 * Convert HTML to high-resolution PNG and PDF with artboard support
 *
 * Usage:
 *   - As MCP: Run without args, speaks JSON-RPC
 *   - As API: import { htmlToPng, htmlToPdf, ... } from './index'
 *   - As CLI: node index.ts <command> [args]
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { chromium, Browser, Page } from "playwright";
import { PDFDocument } from "pdf-lib";
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from "fs";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join, basename, resolve } from "path";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const DEFAULT_OUTPUT_DIR = join(homedir(), ".rudi", "output");

function ensureOutputDir(dir: string = DEFAULT_OUTPUT_DIR) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function expandPath(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function generateFilename(prefix: string, ext: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${timestamp}.${ext}`;
}

// Artboard size presets
const ARTBOARD_SIZES = {
  "letter": { width: 8.5, height: 11, name: "US Letter (8.5x11)" },
  "letter-landscape": { width: 11, height: 8.5, name: "US Letter Landscape (11x8.5)" },
  "16:9": { width: 16, height: 9, name: "16:9 Presentation" },
  "a4": { width: 8.27, height: 11.69, name: "A4" },
  "a4-landscape": { width: 11.69, height: 8.27, name: "A4 Landscape" },
} as const;

type ArtboardSize = keyof typeof ARTBOARD_SIZES;

// =============================================================================
// HTML TO PNG
// =============================================================================

export interface PngResult {
  localPath: string;
  width: number;
  height: number;
  pages: number;
}

export async function htmlToPng(
  htmlPath: string,
  options: {
    output?: string;
    artboardSize?: ArtboardSize;
    dpi?: number;
    scale?: number;
    paginated?: boolean;
  } = {}
): Promise<PngResult> {
  const expandedPath = expandPath(htmlPath);
  if (!existsSync(expandedPath)) {
    throw new Error(`HTML file not found: ${expandedPath}`);
  }

  const size = ARTBOARD_SIZES[options.artboardSize || "letter"];
  const dpi = options.dpi || 300;
  const scale = options.scale || 2;
  const viewportWidth = Math.round(size.width * dpi);
  const viewportHeight = Math.round(size.height * dpi);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();

  const fileUrl = `file://${resolve(expandedPath)}`;
  await page.goto(fileUrl);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000); // Wait for fonts

  ensureOutputDir();
  const outputDir = options.output ? expandPath(options.output) : DEFAULT_OUTPUT_DIR;
  const outputPath = existsSync(outputDir) && statSync(outputDir).isDirectory()
    ? outputDir
    : dirname(outputDir);
  ensureOutputDir(outputPath);

  const baseName = basename(expandedPath, ".html");
  const results: string[] = [];

  // Check for multiple artboards
  const artboards = await page.$$(".artboard");

  if (artboards.length > 1 || options.paginated) {
    // Paginated - capture each artboard
    for (let i = 0; i < artboards.length; i++) {
      const artboard = artboards[i];
      await artboard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      const pngPath = join(outputPath, `${baseName}-page-${String(i + 1).padStart(2, "0")}.png`);
      await artboard.screenshot({ path: pngPath });
      results.push(pngPath);
    }
  } else {
    // Single page
    const pngPath = options.output && !statSync(options.output).isDirectory()
      ? expandPath(options.output)
      : join(outputPath, `${baseName}.png`);
    await page.screenshot({ path: pngPath, fullPage: true });
    results.push(pngPath);
  }

  await browser.close();

  return {
    localPath: results.length === 1 ? results[0] : outputPath,
    width: viewportWidth * scale,
    height: viewportHeight * scale,
    pages: results.length,
  };
}

// =============================================================================
// HTML TO PDF
// =============================================================================

export interface PdfResult {
  localPath: string;
  pages: number;
  format: string;
}

export async function htmlToPdf(
  htmlPath: string,
  options: {
    output?: string;
    artboardSize?: ArtboardSize;
    paginated?: boolean;
    combinedOnly?: boolean;
  } = {}
): Promise<PdfResult> {
  const expandedPath = expandPath(htmlPath);
  if (!existsSync(expandedPath)) {
    throw new Error(`HTML file not found: ${expandedPath}`);
  }

  const size = ARTBOARD_SIZES[options.artboardSize || "letter"];

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const fileUrl = `file://${resolve(expandedPath)}`;
  await page.goto(fileUrl);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  ensureOutputDir();
  const outputDir = options.output ? expandPath(options.output) : DEFAULT_OUTPUT_DIR;
  const outputPath = existsSync(outputDir) && statSync(outputDir).isDirectory()
    ? outputDir
    : dirname(outputDir);
  ensureOutputDir(outputPath);

  const baseName = basename(expandedPath, ".html");

  // Check for multiple artboards
  const artboards = await page.$$(".artboard");
  const pageCount = artboards.length || 1;

  // Prepare page for clean PDF export
  await page.evaluate(() => {
    const container = document.querySelector(".artboards-container") as HTMLElement;
    if (container) {
      container.style.padding = "0";
      container.style.gap = "0";
      container.style.background = "white";
    }
    const boards = document.querySelectorAll(".artboard") as NodeListOf<HTMLElement>;
    boards.forEach((board) => {
      board.style.marginBottom = "0";
      board.style.boxShadow = "none";
    });
    document.body.style.margin = "0";
    document.body.style.padding = "0";
  });

  const pdfPath = options.output && !existsSync(options.output)
    ? expandPath(options.output)
    : join(outputPath, pageCount > 1 ? `${baseName}-all-pages.pdf` : `${baseName}.pdf`);

  await page.pdf({
    path: pdfPath,
    width: `${size.width}in`,
    height: `${size.height}in`,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
  });

  await browser.close();

  return {
    localPath: pdfPath,
    pages: pageCount,
    format: size.name,
  };
}

// =============================================================================
// HTML TO PNG + PDF (Combined)
// =============================================================================

export interface ExportResult {
  pngPaths: string[];
  pdfPath: string;
  pages: number;
}

export async function htmlToPngPdf(
  htmlPath: string,
  options: {
    output?: string;
    artboardSize?: ArtboardSize;
    dpi?: number;
    scale?: number;
  } = {}
): Promise<ExportResult> {
  const expandedPath = expandPath(htmlPath);
  if (!existsSync(expandedPath)) {
    throw new Error(`HTML file not found: ${expandedPath}`);
  }

  const size = ARTBOARD_SIZES[options.artboardSize || "letter"];
  const dpi = options.dpi || 300;
  const scale = options.scale || 2;
  const viewportWidth = Math.round(size.width * dpi);
  const viewportHeight = Math.round(size.height * dpi);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();

  const fileUrl = `file://${resolve(expandedPath)}`;
  await page.goto(fileUrl);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  ensureOutputDir();
  const outputDir = options.output ? expandPath(options.output) : DEFAULT_OUTPUT_DIR;
  const outputPath = existsSync(outputDir) && statSync(outputDir).isDirectory()
    ? outputDir
    : dirname(outputDir) || DEFAULT_OUTPUT_DIR;
  ensureOutputDir(outputPath);

  const baseName = basename(expandedPath, ".html");
  const pngPaths: string[] = [];

  // Check for multiple artboards
  const artboards = await page.$$(".artboard");
  const pageCount = artboards.length || 1;

  // Capture PNGs
  if (artboards.length > 1) {
    for (let i = 0; i < artboards.length; i++) {
      const artboard = artboards[i];
      await artboard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      const pngPath = join(outputPath, `${baseName}-page-${String(i + 1).padStart(2, "0")}.png`);
      await artboard.screenshot({ path: pngPath });
      pngPaths.push(pngPath);
    }
  } else {
    const pngPath = join(outputPath, `${baseName}.png`);
    await page.screenshot({ path: pngPath, fullPage: true });
    pngPaths.push(pngPath);
  }

  // Prepare for PDF
  await page.evaluate(() => {
    const container = document.querySelector(".artboards-container") as HTMLElement;
    if (container) {
      container.style.padding = "0";
      container.style.gap = "0";
      container.style.background = "white";
    }
    const boards = document.querySelectorAll(".artboard") as NodeListOf<HTMLElement>;
    boards.forEach((board) => {
      board.style.marginBottom = "0";
      board.style.boxShadow = "none";
    });
    document.body.style.margin = "0";
    document.body.style.padding = "0";
  });

  const pdfPath = join(outputPath, pageCount > 1 ? `${baseName}-all-pages.pdf` : `${baseName}.pdf`);

  await page.pdf({
    path: pdfPath,
    width: `${size.width}in`,
    height: `${size.height}in`,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
  });

  await browser.close();

  return {
    pngPaths,
    pdfPath,
    pages: pageCount,
  };
}

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new Server({ name: "web-export", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "html_to_png",
      description: "Convert HTML to high-resolution PNG. Supports artboard-based layouts with multiple pages.",
      inputSchema: {
        type: "object",
        properties: {
          html_path: { type: "string", description: "Path to the HTML file" },
          output: { type: "string", description: "Output path or directory" },
          artboard_size: {
            type: "string",
            enum: ["letter", "letter-landscape", "16:9", "a4", "a4-landscape"],
            description: "Artboard size preset (default: letter = 8.5x11)",
          },
          dpi: { type: "number", description: "Base DPI (default: 300)" },
          scale: { type: "number", description: "Scale factor (default: 2 for retina)" },
          paginated: { type: "boolean", description: "Force paginated mode for multi-artboard documents" },
        },
        required: ["html_path"],
      },
    },
    {
      name: "html_to_pdf",
      description: "Convert HTML to PDF with proper print settings. Supports paginated documents with multiple artboards.",
      inputSchema: {
        type: "object",
        properties: {
          html_path: { type: "string", description: "Path to the HTML file" },
          output: { type: "string", description: "Output path or directory" },
          artboard_size: {
            type: "string",
            enum: ["letter", "letter-landscape", "16:9", "a4", "a4-landscape"],
            description: "Artboard size preset (default: letter = 8.5x11)",
          },
          paginated: { type: "boolean", description: "Force paginated mode" },
        },
        required: ["html_path"],
      },
    },
    {
      name: "html_to_png_pdf",
      description: "Convert HTML to both PNG and PDF in one operation. Ideal for complete document export.",
      inputSchema: {
        type: "object",
        properties: {
          html_path: { type: "string", description: "Path to the HTML file" },
          output: { type: "string", description: "Output directory" },
          artboard_size: {
            type: "string",
            enum: ["letter", "letter-landscape", "16:9", "a4", "a4-landscape"],
            description: "Artboard size preset (default: letter = 8.5x11)",
          },
          dpi: { type: "number", description: "Base DPI for PNG (default: 300)" },
          scale: { type: "number", description: "Scale factor for PNG (default: 2)" },
        },
        required: ["html_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "html_to_png": {
        const result = await htmlToPng(args?.html_path as string, {
          output: args?.output as string,
          artboardSize: args?.artboard_size as ArtboardSize,
          dpi: args?.dpi as number,
          scale: args?.scale as number,
          paginated: args?.paginated as boolean,
        });
        return {
          content: [{
            type: "text",
            text: `PNG exported: ${result.localPath}\nPages: ${result.pages}\nResolution: ${result.width}x${result.height}`,
          }],
        };
      }

      case "html_to_pdf": {
        const result = await htmlToPdf(args?.html_path as string, {
          output: args?.output as string,
          artboardSize: args?.artboard_size as ArtboardSize,
          paginated: args?.paginated as boolean,
        });
        return {
          content: [{
            type: "text",
            text: `PDF exported: ${result.localPath}\nPages: ${result.pages}\nFormat: ${result.format}`,
          }],
        };
      }

      case "html_to_png_pdf": {
        const result = await htmlToPngPdf(args?.html_path as string, {
          output: args?.output as string,
          artboardSize: args?.artboard_size as ArtboardSize,
          dpi: args?.dpi as number,
          scale: args?.scale as number,
        });
        return {
          content: [{
            type: "text",
            text: `Exported ${result.pages} page(s):\nPNG: ${result.pngPaths.join(", ")}\nPDF: ${result.pdfPath}`,
          }],
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// =============================================================================
// CLI MODE
// =============================================================================

const cliArgs = process.argv.slice(2);

if (cliArgs.length > 0 && cliArgs[0] !== "--mcp") {
  const command = cliArgs[0];

  (async () => {
    try {
      switch (command) {
        case "png": {
          const htmlPath = cliArgs[1];
          if (!htmlPath) throw new Error("Usage: png <html_path> [output]");
          const result = await htmlToPng(htmlPath, { output: cliArgs[2] });
          console.log(`PNG: ${result.localPath} (${result.pages} pages)`);
          break;
        }
        case "pdf": {
          const htmlPath = cliArgs[1];
          if (!htmlPath) throw new Error("Usage: pdf <html_path> [output]");
          const result = await htmlToPdf(htmlPath, { output: cliArgs[2] });
          console.log(`PDF: ${result.localPath} (${result.pages} pages)`);
          break;
        }
        case "export": {
          const htmlPath = cliArgs[1];
          if (!htmlPath) throw new Error("Usage: export <html_path> [output_dir]");
          const result = await htmlToPngPdf(htmlPath, { output: cliArgs[2] });
          console.log(`PNG: ${result.pngPaths.join(", ")}`);
          console.log(`PDF: ${result.pdfPath}`);
          break;
        }
        default:
          console.log("Commands: png, pdf, export");
      }
    } catch (error: any) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  })();
} else {
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
