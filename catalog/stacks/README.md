# Stacks

MCP (Model Context Protocol) servers that extend agents with tools for external services.

## Current Stacks

### AI & Generation
| Stack | Description | Secrets Required |
|-------|-------------|------------------|
| `openai` | DALL-E images, Whisper transcription, TTS, Sora video | `OPENAI_API_KEY` |
| `google-ai` | Gemini, Imagen 4, Veo 3.1 | `GOOGLE_AI_API_KEY` |

### Communication
| Stack | Description | Secrets Required |
|-------|-------------|------------------|
| `slack` | Send messages, search channels, upload files | `SLACK_BOT_TOKEN` |
| `zoho-mail` | Send, search, manage emails | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` |

### Productivity
| Stack | Description | Secrets Required |
|-------|-------------|------------------|
| `google-workspace` | Gmail, Sheets, Docs, Drive, Calendar | `GOOGLE_CREDENTIALS` |
| `notion-workspace` | Pages, databases, search | `NOTION_API_KEY` |
| `airtable` | Query and manage Airtable bases and records | `AIRTABLE_API_KEY` |
| `ms-office` | Read Word/Excel documents | - |

### Development
| Stack | Description | Secrets Required |
|-------|-------------|------------------|
| `github` | Repos, PRs, issues, code search | `GITHUB_TOKEN` |
| `postgres` | Query PostgreSQL (Neon, Railway, Supabase) | `DATABASE_URL` |
| `sqlite` | Query local SQLite databases | `SQLITE_DB_PATH` |

### Business
| Stack | Description | Secrets Required |
|-------|-------------|------------------|
| `stripe` | Payments, customers, invoices, subscriptions | `STRIPE_API_KEY` |

### Data & Finance
| Stack | Description | Secrets Required |
|-------|-------------|------------------|
| `data-analysis` | Python/pandas analysis, charts, visualization | - |
| `finance` | Stock market data, crypto prices, portfolio tracking | `ALPHA_VANTAGE_API_KEY` (optional) |

### Content & Media
| Stack | Description | Secrets Required |
|-------|-------------|------------------|
| `content-extractor` | YouTube, Reddit, TikTok, articles | - |
| `social-media` | Twitter, LinkedIn, Facebook, Instagram | (platform-specific) |
| `video-editor` | FFmpeg-based video editing | - |
| `web-export` | HTML to PNG/PDF | - |
| `whisper` | Local audio transcription | - |

## Installation

```bash
rudi install slack
rudi secrets set SLACK_BOT_TOKEN "xoxb-..."
rudi integrate claude
```

Installed to: `~/.rudi/stacks/{stack-id}/`

## Stack Structure

Each stack is a folder containing:

```
{stack-id}/
├── manifest.json     # Required: metadata, command, secrets
├── src/              # MCP server source code
│   └── index.ts
├── dist/             # Built output (if applicable)
├── package.json      # Dependencies
└── .env.example      # Secret names (schema reference)
```

## manifest.json

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `"slack"`) |
| `name` | string | Display name |
| `version` | string | Semver version |
| `description` | string | Short description |
| `runtime` | string | `"node"` or `"python"` |
| `command` | string[] | Command to run (e.g., `["node", "dist/index.js"]`) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `provides.tools` | string[] | MCP tools provided |
| `requires.binaries` | string[] | Required binaries (ffmpeg, etc.) |
| `requires.secrets` | array | Required API keys/credentials |
| `meta.tags` | string[] | Search tags |
| `meta.category` | string | Category for grouping |
| `meta.icon` | string | Emoji icon |

### Secrets Schema

```json
{
  "requires": {
    "secrets": [
      {
        "name": "SLACK_BOT_TOKEN",
        "label": "Slack Bot Token",
        "description": "Bot token from your Slack App (xoxb-...)",
        "link": "https://api.slack.com/apps",
        "required": true
      }
    ]
  }
}
```

### Example manifest.json

```json
{
  "id": "slack",
  "name": "Slack",
  "version": "1.0.0",
  "description": "Send messages, search channels, upload files",
  "runtime": "node",
  "command": ["node", "dist/index.js"],
  "provides": {
    "tools": [
      "slack_send_message",
      "slack_list_channels",
      "slack_search"
    ]
  },
  "requires": {
    "secrets": [
      {
        "name": "SLACK_BOT_TOKEN",
        "label": "Slack Bot Token",
        "link": "https://api.slack.com/apps",
        "required": true
      }
    ]
  },
  "meta": {
    "category": "communication",
    "tags": ["slack", "messaging"],
    "icon": "💬"
  }
}
```

## Adding a New Stack

1. Create folder: `catalog/stacks/{stack-id}/`
2. Add `manifest.json` with required fields
3. Add MCP server code
4. Add entry to `/index.json` under `packages.stacks.official`
5. Push to main branch

## How Stacks Run

```
Agent config → shim (~/.rudi/shims/rudi-mcp) → rudi mcp <stack>
                                                    ↓
                                            Loads secrets from
                                            ~/.rudi/secrets.json
                                                    ↓
                                            Injects as env vars
                                                    ↓
                                            Runs stack command
```

Secrets are stored centrally in `~/.rudi/secrets.json` (chmod 600).
Agent configs contain NO secrets - just shim paths.
