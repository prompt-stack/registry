# Prompt Stack Registry

Official registry for stacks, binaries, agents, runtimes, and prompts.

## Package Types

| Type | Description | Location |
|------|-------------|----------|
| **Stack** | MCP servers with tools | `catalog/stacks/{id}/` |
| **Binary** | Standalone binaries/CLIs | `catalog/binaries/{id}.json` |
| **Agent** | AI coding assistants | `catalog/agents/{id}.json` |
| **Runtime** | Language interpreters | `catalog/runtimes/{id}.json` |
| **Prompt** | System prompt templates | `catalog/prompts/{id}.md` |

## Installation

```bash
# Search for packages
pstack search whisper

# Install packages
pstack install stack:whisper
pstack install binary:ffmpeg
pstack install prompt:code-review

# List installed
pstack list
```

## Repository Structure

```
index.json                    # Package index (all metadata)

catalog/
├── stacks/                   # MCP server stacks
│   └── {stack-id}/
│       ├── manifest.json     # Stack metadata
│       └── node/src/ or python/src/
│
├── prompts/                  # Prompt templates
│   └── {prompt-id}.md        # Markdown with YAML frontmatter
│
├── binaries/                 # Binary manifests
│   └── {binary-id}.json
│
├── agents/                   # Agent manifests
│   └── {agent-id}.json
│
└── runtimes/                 # Runtime manifests
    └── {runtime-id}.json
```

## Creating a Stack

1. Create folder: `catalog/stacks/{stack-id}/`

2. Add `manifest.json`:
```json
{
  "id": "my-stack",
  "name": "My Stack",
  "version": "1.0.0",
  "description": "What it does",
  "runtime": "node",
  "command": ["npx", "tsx", "node/src/index.ts"],
  "provides": {
    "tools": ["my_tool_1", "my_tool_2"]
  },
  "requires": {
    "binaries": ["ffmpeg"],
    "secrets": [
      { "name": "MY_API_KEY", "label": "API Key", "required": true }
    ]
  },
  "meta": {
    "author": "Your Name",
    "license": "MIT",
    "category": "productivity",
    "tags": ["example"]
  }
}
```

3. Add MCP server code in `node/src/index.ts` or `python/src/server.py`

4. Add entry to `index.json` under `packages.stacks.official`

### Secrets Flow

When users install a stack with secrets:

1. `pstack install my-stack` creates `~/.rudi/stacks/my-stack/.env` with placeholders
2. User edits `.env` to add their API keys
3. MCP registration reads from `.env` and injects into agent configs (Claude, Codex, Gemini)

Example `.env` created on install:
```bash
# API Key for My Stack
# Get yours: https://example.com/api-keys
MY_API_KEY=
```

## Creating a Prompt

1. Create file: `catalog/prompts/{prompt-id}.md`

2. Add YAML frontmatter + content:
```markdown
---
name: My Prompt
description: What this prompt does
category: coding
tags:
  - example
icon: "🔍"
author: Your Name
---

# Prompt Title

Your system prompt content here...
```

3. Add entry to `index.json` under `packages.prompts.official`

## Adding a Binary

Binaries use install types to determine how they're installed:

| Install Type | Source | Examples |
|--------------|--------|----------|
| `binary` | Upstream URL | ffmpeg, jq |
| `npm` | npm registry | vercel, wrangler |
| `pip` | PyPI | httpie |
| `system` | User installs | docker, git |

Example binary manifest (`catalog/binaries/jq.json`):
```json
{
  "id": "binary:jq",
  "name": "jq",
  "version": "1.7.1",
  "description": "JSON processor",
  "installType": "binary",
  "binary": "jq",
  "upstream": {
    "darwin-arm64": "https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-macos-arm64",
    "darwin-x64": "https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-macos-amd64",
    "linux-x64": "https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64"
  }
}
```

## Categories

**Stacks:** ai-generation, ai-local, productivity, communication, social-media, data-extraction, document-processing, media, deployment, utilities

**Binaries:** media, data, devops, utilities, ai-ml, version-control

**Prompts:** coding, writing, creative, utilities, general

## Current Stacks

| Stack | Description | Auth |
|-------|-------------|------|
| whisper | Local audio transcription | None |
| google-workspace | Gmail, Sheets, Docs, Drive, Calendar | OAuth |
| google-ai | Gemini, Imagen, Veo | API Key |
| openai | DALL-E, Whisper, TTS, Sora | API Key |
| notion-workspace | Pages, databases, search | API Key |
| slack | Messages, channels, files | Bot Token |
| zoho-mail | Email via Zoho | OAuth |
| content-extractor | YouTube, Reddit, TikTok, articles | None |
| video-editor | ffmpeg-based editing | None |
| web-export | HTML to PNG/PDF | None |
| ms-office | Read .docx/.xlsx | None |
| social-media | Twitter, LinkedIn, Facebook, Instagram | OAuth |

## Security

**Never include API keys or secrets in the registry.** Stacks declare required secrets in `manifest.json` under `requires.secrets`. When installed, a `.env` file is created at `~/.rudi/stacks/<id>/.env` where users add their keys locally.

## URLs

- **Index:** `https://raw.githubusercontent.com/learn-rudi/registry/main/index.json`
- **Stacks:** `https://raw.githubusercontent.com/learn-rudi/registry/main/catalog/stacks/{id}/`

## License

MIT
