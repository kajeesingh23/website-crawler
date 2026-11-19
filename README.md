# Personal Design Intelligence

A local-first workspace for exploring websites, selecting the details you like, understanding how
they work, and saving them to a personal visual library that Claude can reuse.

> Repository: `website-crawler`. App name: **Personal Design Intelligence**.

## Status

Phases 1–5 are built: explore a website, select anything, see its design and motion, recreate it as code, make it yours, and keep everything on your board. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
6. **Explore animation** watches the selection for a few seconds: on its own, on hover, on focus
   and while scrolling into view (the website window visibly hovers and scrolls). It shows what
   changed, timing and easing in plain words, and a preview with play, pause, replay and speed.
   Name it and **Save animation** to keep it in your library.
7. **Recreate This Component** turns the selection into reusable code. Without Claude you get an
   exact copy made from the measurements; with Claude connected you also get clean HTML/CSS and a
   React version, **Improve the Match**, and changes by instruction. Every version is rendered and
   measured against the original ("Matches 12 of 13 measured properties"), shown side by side or as
   an overlay, and can be customised with colour pickers and sliders before you save it.

8. **My Board** shows everything you save as visual cards: filter (components, animations,
   typography, layouts, page sections, favourites), search in plain words, drag to rearrange,
   star favourites, select several to add to collections, compare or delete. An item can be in
   many collections without being copied. Open a card for its live preview, measured design,
   animation, code (copy or export), notes, tags and version history.
9. **Design Library** searches everything in your own words ("dark navigation", "buttons that
   follow the cursor") and filters by website, kind, tag and date.

### Connecting Claude (optional)

Add your key to `.env.local` (copy `.env.example`), then restart `npm run dev`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Requests use your Anthropic account and are billed to it. Everything else works without a key.

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
