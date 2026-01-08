#!/usr/bin/env python3
"""
Web Export MCP
Convert HTML to high-resolution PNG and PDF with artboard support

Usage:
  - As MCP: Run without args, speaks JSON-RPC
  - As CLI: python server.py <command> [args]
"""

import asyncio
import sys
import os
from pathlib import Path
from typing import Optional
from datetime import datetime

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from playwright.async_api import async_playwright

# Artboard size presets (width, height in inches)
ARTBOARD_SIZES = {
    "letter": (8.5, 11, "US Letter (8.5x11)"),
    "letter-landscape": (11, 8.5, "US Letter Landscape (11x8.5)"),
    "16:9": (16, 9, "16:9 Presentation"),
    "a4": (8.27, 11.69, "A4"),
    "a4-landscape": (11.69, 8.27, "A4 Landscape"),
}

DEFAULT_OUTPUT_DIR = Path.home() / ".prompt-stack" / "output"


def ensure_output_dir(path: Path = DEFAULT_OUTPUT_DIR):
    path.mkdir(parents=True, exist_ok=True)


def generate_filename(prefix: str, ext: str) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    return f"{prefix}-{timestamp}.{ext}"


def expand_path(p: str) -> Path:
    if p.startswith("~/"):
        return Path.home() / p[2:]
    return Path(p)


# =============================================================================
# URL TO PNG - Screenshot any URL
# =============================================================================

async def url_to_png(
    url: str,
    output: Optional[str] = None,
    width: int = 1280,
    height: int = 800,
    full_page: bool = False,
    scale: int = 2,
) -> dict:
    """Screenshot any URL."""

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={"width": width, "height": height},
            device_scale_factor=scale,
        )
        page = await context.new_page()

        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)  # Wait for lazy-loaded content

        # Generate filename from URL
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.replace("www.", "").replace(".", "-")

        ensure_output_dir()
        if output:
            output_path = expand_path(output)
            if output_path.suffix == ".png":
                png_path = output_path
            elif output_path.is_dir() or not output_path.suffix:
                ensure_output_dir(output_path)
                png_path = output_path / generate_filename(domain, "png")
            else:
                png_path = output_path
        else:
            png_path = DEFAULT_OUTPUT_DIR / generate_filename(domain, "png")

        await page.screenshot(path=str(png_path), full_page=full_page)

        await browser.close()

    return {
        "path": str(png_path),
        "url": url,
        "width": width * scale,
        "height": height * scale if not full_page else "full page",
    }


# =============================================================================
# HTML TO PNG
# =============================================================================

async def html_to_png(
    html_path: str,
    output: Optional[str] = None,
    artboard_size: str = "letter",
    dpi: int = 300,
    scale: int = 2,
    paginated: bool = False,
) -> dict:
    """Convert HTML to high-resolution PNG(s)."""

    html_file = expand_path(html_path)
    if not html_file.exists():
        raise FileNotFoundError(f"HTML file not found: {html_file}")

    size = ARTBOARD_SIZES.get(artboard_size, ARTBOARD_SIZES["letter"])
    viewport_width = int(size[0] * dpi)
    viewport_height = int(size[1] * dpi)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={"width": viewport_width, "height": viewport_height},
            device_scale_factor=scale,
        )
        page = await context.new_page()

        file_url = f"file://{html_file.resolve()}"
        await page.goto(file_url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)  # Wait for fonts

        # Determine output directory
        ensure_output_dir()
        if output:
            output_path = expand_path(output)
            if output_path.suffix:  # It's a file
                output_dir = output_path.parent
            else:
                output_dir = output_path
        else:
            output_dir = DEFAULT_OUTPUT_DIR
        ensure_output_dir(output_dir)

        base_name = html_file.stem
        results = []

        # Check for multiple artboards
        artboards = await page.query_selector_all(".artboard")

        if len(artboards) > 1 or paginated:
            # Paginated - capture each artboard
            for i, artboard in enumerate(artboards):
                await artboard.scroll_into_view_if_needed()
                await page.wait_for_timeout(200)

                png_path = output_dir / f"{base_name}-page-{i+1:02d}.png"
                await artboard.screenshot(path=str(png_path))
                results.append(str(png_path))
        else:
            # Single page
            if output and expand_path(output).suffix == ".png":
                png_path = expand_path(output)
            else:
                png_path = output_dir / f"{base_name}.png"
            await page.screenshot(path=str(png_path), full_page=True)
            results.append(str(png_path))

        await browser.close()

    return {
        "paths": results,
        "pages": len(results),
        "width": viewport_width * scale,
        "height": viewport_height * scale,
    }


# =============================================================================
# HTML TO PDF
# =============================================================================

async def html_to_pdf(
    html_path: str,
    output: Optional[str] = None,
    artboard_size: str = "letter",
    paginated: bool = False,
) -> dict:
    """Convert HTML to PDF with proper print settings."""

    html_file = expand_path(html_path)
    if not html_file.exists():
        raise FileNotFoundError(f"HTML file not found: {html_file}")

    size = ARTBOARD_SIZES.get(artboard_size, ARTBOARD_SIZES["letter"])

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        file_url = f"file://{html_file.resolve()}"
        await page.goto(file_url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Determine output path
        ensure_output_dir()
        if output:
            output_path = expand_path(output)
            if output_path.suffix == ".pdf":
                pdf_path = output_path
            else:
                ensure_output_dir(output_path)
                pdf_path = output_path / f"{html_file.stem}.pdf"
        else:
            pdf_path = DEFAULT_OUTPUT_DIR / f"{html_file.stem}.pdf"

        # Check for multiple artboards
        artboards = await page.query_selector_all(".artboard")
        page_count = len(artboards) if artboards else 1

        if page_count > 1:
            pdf_path = pdf_path.parent / f"{html_file.stem}-all-pages.pdf"

        # Prepare page for clean PDF export
        await page.evaluate("""
            () => {
                const container = document.querySelector('.artboards-container');
                if (container) {
                    container.style.padding = '0';
                    container.style.gap = '0';
                    container.style.background = 'white';
                }
                const boards = document.querySelectorAll('.artboard');
                boards.forEach(board => {
                    board.style.marginBottom = '0';
                    board.style.boxShadow = 'none';
                });
                document.body.style.margin = '0';
                document.body.style.padding = '0';
            }
        """)

        await page.pdf(
            path=str(pdf_path),
            width=f"{size[0]}in",
            height=f"{size[1]}in",
            print_background=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            prefer_css_page_size=True,
        )

        await browser.close()

    return {
        "path": str(pdf_path),
        "pages": page_count,
        "format": size[2],
    }


# =============================================================================
# HTML TO PNG + PDF (Combined)
# =============================================================================

async def html_to_png_pdf(
    html_path: str,
    output: Optional[str] = None,
    artboard_size: str = "letter",
    dpi: int = 300,
    scale: int = 2,
) -> dict:
    """Convert HTML to both PNG and PDF in one operation."""

    html_file = expand_path(html_path)
    if not html_file.exists():
        raise FileNotFoundError(f"HTML file not found: {html_file}")

    size = ARTBOARD_SIZES.get(artboard_size, ARTBOARD_SIZES["letter"])
    viewport_width = int(size[0] * dpi)
    viewport_height = int(size[1] * dpi)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={"width": viewport_width, "height": viewport_height},
            device_scale_factor=scale,
        )
        page = await context.new_page()

        file_url = f"file://{html_file.resolve()}"
        await page.goto(file_url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Determine output directory
        ensure_output_dir()
        if output:
            output_dir = expand_path(output)
            if output_dir.suffix:
                output_dir = output_dir.parent
        else:
            output_dir = DEFAULT_OUTPUT_DIR
        ensure_output_dir(output_dir)

        base_name = html_file.stem
        png_paths = []

        # Check for multiple artboards
        artboards = await page.query_selector_all(".artboard")
        page_count = len(artboards) if artboards else 1

        # Capture PNGs
        if len(artboards) > 1:
            for i, artboard in enumerate(artboards):
                await artboard.scroll_into_view_if_needed()
                await page.wait_for_timeout(200)

                png_path = output_dir / f"{base_name}-page-{i+1:02d}.png"
                await artboard.screenshot(path=str(png_path))
                png_paths.append(str(png_path))
        else:
            png_path = output_dir / f"{base_name}.png"
            await page.screenshot(path=str(png_path), full_page=True)
            png_paths.append(str(png_path))

        # Prepare for PDF
        await page.evaluate("""
            () => {
                const container = document.querySelector('.artboards-container');
                if (container) {
                    container.style.padding = '0';
                    container.style.gap = '0';
                    container.style.background = 'white';
                }
                const boards = document.querySelectorAll('.artboard');
                boards.forEach(board => {
                    board.style.marginBottom = '0';
                    board.style.boxShadow = 'none';
                });
                document.body.style.margin = '0';
                document.body.style.padding = '0';
            }
        """)

        pdf_name = f"{base_name}-all-pages.pdf" if page_count > 1 else f"{base_name}.pdf"
        pdf_path = output_dir / pdf_name

        await page.pdf(
            path=str(pdf_path),
            width=f"{size[0]}in",
            height=f"{size[1]}in",
            print_background=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            prefer_css_page_size=True,
        )

        await browser.close()

    return {
        "png_paths": png_paths,
        "pdf_path": str(pdf_path),
        "pages": page_count,
    }


# =============================================================================
# MCP SERVER
# =============================================================================

server = Server("web-export")


@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="html_to_png",
            description="Convert HTML to high-resolution PNG. Supports artboard-based layouts with multiple pages. Uses Playwright for accurate rendering.",
            inputSchema={
                "type": "object",
                "properties": {
                    "html_path": {"type": "string", "description": "Path to the HTML file"},
                    "output": {"type": "string", "description": "Output path or directory"},
                    "artboard_size": {
                        "type": "string",
                        "enum": ["letter", "letter-landscape", "16:9", "a4", "a4-landscape"],
                        "description": "Artboard size preset (default: letter = 8.5x11)",
                    },
                    "dpi": {"type": "number", "description": "Base DPI (default: 300)"},
                    "scale": {"type": "number", "description": "Scale factor (default: 2 for retina)"},
                    "paginated": {"type": "boolean", "description": "Force paginated mode"},
                },
                "required": ["html_path"],
            },
        ),
        Tool(
            name="html_to_pdf",
            description="Convert HTML to PDF with proper print settings. Supports paginated documents with multiple artboards.",
            inputSchema={
                "type": "object",
                "properties": {
                    "html_path": {"type": "string", "description": "Path to the HTML file"},
                    "output": {"type": "string", "description": "Output path or directory"},
                    "artboard_size": {
                        "type": "string",
                        "enum": ["letter", "letter-landscape", "16:9", "a4", "a4-landscape"],
                        "description": "Artboard size preset (default: letter = 8.5x11)",
                    },
                    "paginated": {"type": "boolean", "description": "Force paginated mode"},
                },
                "required": ["html_path"],
            },
        ),
        Tool(
            name="html_to_png_pdf",
            description="Convert HTML to both PNG and PDF in one operation. Ideal for complete document export.",
            inputSchema={
                "type": "object",
                "properties": {
                    "html_path": {"type": "string", "description": "Path to the HTML file"},
                    "output": {"type": "string", "description": "Output directory"},
                    "artboard_size": {
                        "type": "string",
                        "enum": ["letter", "letter-landscape", "16:9", "a4", "a4-landscape"],
                        "description": "Artboard size preset (default: letter = 8.5x11)",
                    },
                    "dpi": {"type": "number", "description": "Base DPI for PNG (default: 300)"},
                    "scale": {"type": "number", "description": "Scale factor for PNG (default: 2)"},
                },
                "required": ["html_path"],
            },
        ),
        Tool(
            name="url_to_png",
            description="Screenshot any URL. Captures a webpage as a high-resolution PNG image. Useful for competitor research, documentation, archiving, and bug reports.",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to screenshot"},
                    "output": {"type": "string", "description": "Output path or directory"},
                    "width": {"type": "number", "description": "Viewport width (default: 1280)"},
                    "height": {"type": "number", "description": "Viewport height (default: 800)"},
                    "full_page": {"type": "boolean", "description": "Capture full scrollable page (default: false)"},
                    "scale": {"type": "number", "description": "Scale factor for retina (default: 2)"},
                },
                "required": ["url"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    try:
        if name == "html_to_png":
            result = await html_to_png(
                html_path=arguments["html_path"],
                output=arguments.get("output"),
                artboard_size=arguments.get("artboard_size", "letter"),
                dpi=arguments.get("dpi", 300),
                scale=arguments.get("scale", 2),
                paginated=arguments.get("paginated", False),
            )
            paths = result["paths"]
            return [TextContent(
                type="text",
                text=f"PNG exported: {', '.join(paths)}\nPages: {result['pages']}\nResolution: {result['width']}x{result['height']}",
            )]

        elif name == "html_to_pdf":
            result = await html_to_pdf(
                html_path=arguments["html_path"],
                output=arguments.get("output"),
                artboard_size=arguments.get("artboard_size", "letter"),
                paginated=arguments.get("paginated", False),
            )
            return [TextContent(
                type="text",
                text=f"PDF exported: {result['path']}\nPages: {result['pages']}\nFormat: {result['format']}",
            )]

        elif name == "html_to_png_pdf":
            result = await html_to_png_pdf(
                html_path=arguments["html_path"],
                output=arguments.get("output"),
                artboard_size=arguments.get("artboard_size", "letter"),
                dpi=arguments.get("dpi", 300),
                scale=arguments.get("scale", 2),
            )
            return [TextContent(
                type="text",
                text=f"Exported {result['pages']} page(s):\nPNG: {', '.join(result['png_paths'])}\nPDF: {result['pdf_path']}",
            )]

        elif name == "url_to_png":
            result = await url_to_png(
                url=arguments["url"],
                output=arguments.get("output"),
                width=arguments.get("width", 1280),
                height=arguments.get("height", 800),
                full_page=arguments.get("full_page", False),
                scale=arguments.get("scale", 2),
            )
            return [TextContent(
                type="text",
                text=f"Screenshot saved: {result['path']}\nURL: {result['url']}\nResolution: {result['width']}x{result['height']}",
            )]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


# =============================================================================
# CLI MODE
# =============================================================================

async def cli_main():
    if len(sys.argv) < 2:
        print("Usage: python server.py <command> [args]")
        print("Commands: url, png, pdf, export")
        return

    command = sys.argv[1]

    if command == "url":
        if len(sys.argv) < 3:
            print("Usage: python server.py url <url> [output] [--full]")
            return
        full_page = "--full" in sys.argv
        output = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else None
        result = await url_to_png(sys.argv[2], output=output, full_page=full_page)
        print(f"Screenshot: {result['path']}")
        print(f"URL: {result['url']}")
        print(f"Resolution: {result['width']}x{result['height']}")

    elif command == "png":
        if len(sys.argv) < 3:
            print("Usage: python server.py png <html_path> [output]")
            return
        result = await html_to_png(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        print(f"PNG: {', '.join(result['paths'])} ({result['pages']} pages)")

    elif command == "pdf":
        if len(sys.argv) < 3:
            print("Usage: python server.py pdf <html_path> [output]")
            return
        result = await html_to_pdf(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        print(f"PDF: {result['path']} ({result['pages']} pages)")

    elif command == "export":
        if len(sys.argv) < 3:
            print("Usage: python server.py export <html_path> [output_dir]")
            return
        result = await html_to_png_pdf(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        print(f"PNG: {', '.join(result['png_paths'])}")
        print(f"PDF: {result['pdf_path']}")

    else:
        print("Commands: png, pdf, export")


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ("url", "png", "pdf", "export"):
        asyncio.run(cli_main())
    else:
        asyncio.run(stdio_server(server).run())
