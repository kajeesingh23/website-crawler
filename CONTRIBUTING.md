# Contributing to Plax

Thanks for helping. Plax is used by designers, so every word on screen should be plain and every
feature should do what it says.

## Set up

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run dev
```

The app runs at http://localhost:3000. Build the extension with `npm run extension:build` and load
`dist/extension` as described in [docs/EXTENSION.md](docs/EXTENSION.md).

This project uses **Next.js 16**, which differs from older versions. Read the guides in
`node_modules/next/dist/docs/` before changing Next.js code (see `AGENTS.md`).

## How the code is organised

| Folder | What |
|---|---|
| `src/app/` | Pages: Analyse Website, Library (and item pages), Settings; API routes under `api/` |
| `src/lib/inspector/` | The in-page readers (`overlay`, `extract`, `motion`, `snapshot`, `path`) and the Playwright session |
| `src/lib/export/` | Build Prompt and code export (pure functions, used by the app and the extension) |
| `src/lib/recreate/` | Exact copy, studio settings, content and layout edits, Claude |
| `src/lib/` | Database, Library queries, captures, pairing, the security guard |
| `extension/` | The Chrome extension: manifest, side panel, content script |
| `mcp/` | The MCP server for Claude Code |
| `db/migrations/` | Numbered SQL migrations; the database is backed up before each runs |
| `tests/` | Node tests, most in a real (invisible) Chromium |

## Rules the code follows

- **Measured vs reconstructed.** `items.observed` holds only what was measured on the page.
  Anything reconstructed (Claude, customisation) goes in `items.inferred`.
- **Never overwrite.** New code is a new version; customisations are new variations (`variant_of`).
- **In-page readers are self-contained.** Functions that run inside a website (`overlay`,
  `extractDesign`, `motionState`, `snapshotElement`, `pathOf`, `listEditable`, `applyContent`) can't
  use imports or outer variables: Playwright sends them as text.
- **No `innerHTML` in the side panel.** Page text ends up there and the panel has extension rights.
- **Check everything that arrives from outside** (API bodies, captures, edits) before storing it.
  Only checked values become CSS.
- **Plain language** in the UI. Say what can't be done and why, instead of hiding it.
- **No placeholders.** A button either works or isn't there.
- **Never commit** `data/`, `.env.local` or anything with a key.

## Before you open a pull request

```bash
npm run lint
```

```bash
npm run build
```

```bash
npm test
```

All three must pass (GitHub runs them too). Add a test for new logic. Tests must never touch a
real library: use a temporary `PDI_DATA_DIR`, as the existing tests do.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(library): …`,
`fix(extension): …`). Work happens on `feature/*` branches; `main` stays releasable.
