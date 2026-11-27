# Architecture

## The one important decision: how we "see" other websites

Your app runs at `localhost`. A website such as `stripe.com` lives on another domain. Browsers
deliberately stop one site from reading another site's page, so the app **cannot** just show a
website in a frame and inspect it (most sites refuse to be framed at all).

Plax therefore reads websites in two ways, with the **same in-page readers**
(`src/lib/inspector/overlay.ts`, `extract.ts`, `motion.ts`, `snapshot.ts`, `path.ts`):

1. **The Chrome extension** (primary): the readers run as its content script in your own Chrome.
2. **Analyse Website** (in the app): the readers run in a Chromium window opened with Playwright,
   which can also move the mouse to test hover, focus and scroll.

Claude's browser tools (Claude in Chrome, Chrome DevTools MCP, Playwright MCP) give *Claude* a
browser, but the running app cannot call them. So:

| Need | Who does it | How |
|---|---|---|
| Select several things in your own browser | **The extension** | Side panel + content script; pictures with `chrome.tabs.captureVisibleTab`, cropped to the element; list kept in `chrome.storage.local`. |
| Open a site, hover, click to select | **The app** | The local server starts a real Chromium window with **Playwright** and adds a small inspector layer (outline, tooltip, click-to-lock) to every page. |
| Read colours, fonts, spacing, animations | **The app** | The inspector layer reads the browser's computed styles, `document.getAnimations()`, CSS rules it is allowed to read, and asset URLs. |
| Screenshot of the selected element | **The app** | Playwright element screenshot → `data/screenshots/`. |
| Explain, recreate, customise, combine | **Claude** | In-app via the Claude API (optional key), or from Claude Code through the local MCP server. |
| "Select the main navigation" in plain words | **Claude** | Reads the page's structure and picks the element. |

The website keeps running in its own window, with its own scripts and logins. Nothing from it
runs inside the app. Only plain data (style values, sanitised HTML, screenshots) comes back.

## How it fits together

```
 Chrome extension (Manifest V3)                    Plax app (Next.js, 127.0.0.1:3000)
 ┌───────────────────────────────┐  paired code    ┌──────────────────────────────────┐
 │ side panel: list, details,    │ ──── HTTP ────▶ │ proxy.ts guard → /api/captures/* │
 │ prompt, code, save            │  (localhost)    │ Analyse Website · Library ·      │
 │ content script: the in-page   │                 │ Settings                         │
 │ readers + smart picking       │                 │ SQLite + data/ files             │
 └───────────────────────────────┘                 └──────────────────────────────────┘
                                                      ▲ Playwright window (Analyse Website)
                                                      ▲ MCP server (mcp/) ◀── Claude Code
```

- **Pairing.** Settings shows a one-time code. The app stores only its SHA-256 hash in the
  `settings` table. The extension sends the code as `x-plax-token`. The guard (`src/lib/guard.ts`,
  run by `src/proxy.ts`) lets a `chrome-extension://` origin through only for `/api/captures/*`, only
  with the current code, and only from the extension that used the code first. Every other rule
  (this computer only, no other websites, no DNS rebinding) is unchanged.
- **Build Prompt and code export** (`src/lib/export/`) are pure functions of the measurements and the
  exact copy, so the extension and the app produce identical results, with no AI.

## Technology choices (and why)

- **Next.js + React + TypeScript + Tailwind:** as requested. The pages and the local server live in one project.
- **Playwright:** a reliable way to drive a real browser from Node. It also runs the tests.
- **`node:sqlite`:** built into Node, so it needs no extra install and no native build step. One file: `data/database/library.db`.
- **Local files under `data/`:** screenshots, assets and generated code. The whole folder is git-ignored.
- **esbuild** compiles the extension's TypeScript (the one build tool added for Plax). No UI
  framework in the side panel: plain DOM calls, never `innerHTML`.
- **No cloud.** Everything runs on your computer.

## Data on disk (git-ignored)

```
data/
  database/library.db
  screenshots/<item-id>.png
  assets/<website-id>/...
  components/<item-id>/v<n>/...
  animations/<item-id>.json
  design-systems/<id>/design.md
  exports/
```

## Data model (Plax additions, migration 003)

- `analyses`: one row per visit to a website from the extension; a visit holds many captures.
- `items.analysis_id`: which visit a capture came from.
- `items.variant_of`: the original a variation was made from. Variations are their own items.
- `items.kind = 'asset'`: pictures, icons and illustrations saved on their own.
- `settings`: small app settings (the pairing hash).

## Rules the code follows

- **Observed vs inferred:** the `items.observed` field holds only what was measured. Anything Claude reconstructs goes in `items.inferred`, along with its confidence and what was missing.
- **Versions, not overwrites:** each new code save creates a new `item_versions` row; each
  customisation is saved as a new variation item.
- **Attribution:** every item keeps its `source_url`.
- **Backups:** `data/database/` is copied before each migration runs.
- **Permissions:** we never get around logins or paywalls. If an element can't be read (cross-origin frame, canvas, closed shadow DOM), the app says so in plain words.
