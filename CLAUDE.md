# Prompt Stack Registry

Source of truth for stacks, runtimes, tools, and agents.

## Structure

```
index.json                    # Package index (CLI searches this)
catalog/
├── stacks/                   # MCP server stacks
│   ├── slack/
│   │   ├── manifest.json     # Stack metadata + secrets
│   │   └── node/src/         # MCP server code
│   └── ...
├── runtimes/*.json           # Runtime definitions (node, python, deno)
├── tools/*.json              # Tool definitions (ffmpeg, ripgrep)
└── agents/*.json             # Agent definitions (claude, codex, gemini)

GitHub Releases (v1.0.0):     # Binary downloads
├── node-20.10.0-darwin-arm64.tar.gz
├── python-3.12-darwin-arm64.tar.gz
├── ffmpeg-6.0-darwin-arm64.tar.gz
└── ...
```

## Current Stacks (11)

| Stack | Description | Secrets |
|-------|-------------|---------|
| content-extractor | YouTube, Reddit, TikTok, articles | - |
| google-ai | Gemini, Imagen 4, Veo 3.1 | GOOGLE_AI_API_KEY |
| google-workspace | Gmail, Sheets, Docs, Drive, Calendar | GOOGLE_CREDENTIALS |
| ms-office | Word, Excel document reading | - |
| notion-workspace | Pages, databases, search | NOTION_API_KEY |
| openai | DALL-E, Whisper, TTS, Sora | OPENAI_API_KEY |
| slack | Messages, channels, files | SLACK_BOT_TOKEN |
| social-media | Twitter, LinkedIn, Facebook, Instagram | (optional) |
| video-editor | ffmpeg-based editing | - |
| web-export | HTML to PNG/PDF | - |
| zoho-mail | Email via Zoho | ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET |

## URLs

- Index: `https://raw.githubusercontent.com/prompt-stack/registry/main/index.json`
- Binaries: `https://github.com/prompt-stack/registry/releases/download/v1.0.0/{name}.tar.gz`

## Adding a Stack

1. Create `catalog/stacks/{name}/manifest.json`
2. Add MCP server code in `node/` or `python/`
3. Add entry to `index.json` under `packages.stacks.official`
4. Push to main branch

## Manifest Format

```json
{
  "id": "slack",
  "name": "Slack",
  "version": "1.0.0",
  "description": "Send messages, search channels...",
  "mcp": {
    "runtime": "node",
    "command": "npx",
    "args": ["tsx", "node/src/index.ts"]
  },
  "secrets": [
    { "key": "SLACK_BOT_TOKEN", "required": true }
  ],
  "tools": ["slack_send_message", "slack_list_channels", ...]
}
```
