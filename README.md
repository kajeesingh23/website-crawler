# Personal Design Intelligence

A local-first workspace for exploring websites, selecting the details you like, understanding how
they work, and saving them to a personal visual library that Claude can reuse.

> Repository: `website-crawler`. App name: **Personal Design Intelligence**.

## Status

Phases 1–2 are built: explore a website, select anything, and see its design. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Using it

1. `npm run dev`, then open http://localhost:3000 and choose **Explore Website**.
2. Paste a link. The website opens in its own browser window, working exactly as it normally does.
3. Press **Start selecting** (in the app, or the pill at the bottom right of the website).
   Hover to see what each part is. Click to pick it.
4. The app shows a preview, a plain-language name and its size. Use **Select larger area**,
   **Select inside**, **Previous** and **Next** to adjust. Press Esc on the website to clear.
5. Below the preview, the design inspector shows what was measured on the page: colours
   (click to copy), typography with a live preview, layout in plain words with a spacing
   diagram, all colours used inside, and its images, icons and videos.

## Install

Requires Node.js 22.5+ (for the built-in `node:sqlite`).

```bash
npm install
npx playwright install chromium   # one-time: the browser used for exploring
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

## Tests

```bash
npm test   # opens test pages in an invisible browser; your library is never touched
```

## Troubleshooting

- **`node:sqlite` not found:** update Node to 22.5 or newer.
- **Browser window doesn't open (from Phase 1):** run `npx playwright install chromium`.
