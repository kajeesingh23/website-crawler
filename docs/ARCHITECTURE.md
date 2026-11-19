# Architecture

## The one important decision: how we "see" other websites

Your app runs at `localhost`. A website such as `stripe.com` lives on another domain. Browsers
deliberately stop one site from reading another site's page, so the app **cannot** just show a
website in a frame and inspect it (most sites refuse to be framed at all).

Claude's browser tools (Claude in Chrome, Chrome DevTools MCP, Playwright MCP) give *Claude* a
browser, but the running app cannot call them. So:

| Need | Who does it | How |
|---|---|---|
| Open a site, hover, click to select | **The app** | The local server starts a real Chromium window with **Playwright** and adds a small inspector layer (outline, tooltip, click-to-lock) to every page. |
| Read colours, fonts, spacing, animations | **The app** | The inspector layer reads the browser's computed styles, `document.getAnimations()`, CSS rules it is allowed to read, and asset URLs. |
| Screenshot of the selected element | **The app** | Playwright element screenshot → `data/screenshots/`. |
| Explain, recreate, customise, combine | **Claude** | In-app via the Claude API (optional key), or from Claude Code through the local MCP server. |
| "Select the main navigation" in plain words | **Claude** | Reads the page's structure and picks the element. |

The website keeps running in its own window, with its own scripts and logins. Nothing from it
runs inside the app. Only plain data (style values, sanitised HTML, screenshots) comes back.

## How it fits together

```
 Personal Design Intelligence (Next.js, localhost:3000)
   Home · Explore · My Board · Library · Design Systems
        │ live selection events                ▲ library data
   Inspector session ──▶ AI layer (Claude) ──▶ Library: SQLite + data/ files
   (Playwright + overlay)                          ▲
        ▼                                          │
   Chromium window (the real website)      MCP server (mcp/) ◀── Claude Code
```

## Technology choices (and why)

- **Next.js + React + TypeScript + Tailwind:** as requested. The pages and the local server live in one project.
- **Playwright:** a reliable way to drive a real browser from Node. It also runs the tests.
- **`node:sqlite`:** built into Node, so it needs no extra install and no native build step. One file: `data/database/library.db`.
- **Local files under `data/`:** screenshots, assets and generated code. The whole folder is git-ignored.
- **No Chrome extension and no cloud** in the first version.

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

## Rules the code follows

- **Observed vs inferred:** the `items.observed` field holds only what was measured. Anything Claude reconstructs goes in `items.inferred`, along with its confidence and what was missing.
- **Versions, not overwrites:** each code or customisation save creates a new `item_versions` row.
- **Attribution:** every item keeps its `source_url`.
- **Backups:** `data/database/` is copied before each migration runs.
- **Permissions:** we never get around logins or paywalls. If an element can't be read (cross-origin frame, canvas, closed shadow DOM), the app says so in plain words.
