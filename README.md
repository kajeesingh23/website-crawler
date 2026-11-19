# Personal Design Intelligence

A local-first workspace for exploring websites, selecting the details you like, understanding how
they work, and saving them to a personal visual library that Claude can reuse.

> Repository: `website-crawler`. App name: **Personal Design Intelligence**.

## Status

Foundation only: the project scaffold, database schema and architecture are in place.
See [docs/ROADMAP.md](docs/ROADMAP.md).

## Install

Requires Node.js 22.5+ (for the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local   # optional: add an Anthropic API key
npm run dev                  # http://localhost:3000
```

## Where things live

| Path | What | In Git? |
|---|---|---|
| `src/` | The app (Next.js) | yes |
| `db/migrations/` | Database schema | yes |
| `mcp/` | Local MCP server for Claude Code (Phase 7) | yes |
| `docs/` | Architecture and roadmap | yes |
| `data/` | **Your** library: database, screenshots, assets, code | **no**, never |
| `.env.local` | Your keys | **no**, never |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to learn how the app inspects websites.

## Troubleshooting

- **`node:sqlite` not found:** update Node to 22.5 or newer.
- **Browser window doesn't open (from Phase 1):** run `npx playwright install chromium`.
