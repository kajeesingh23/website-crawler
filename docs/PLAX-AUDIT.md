# Plax — product and technical audit

Audit of **Personal Design Intelligence v1.0.0** (`main` @ `3ae6947`) before turning it into **Plax**.
Written before any Plax code changes, as the brief requires. Severity: **High** = blocks the core
workflow, **Medium** = real friction, **Low** = polish.

---

## 1. Current product architecture

```
Next.js 16 app (localhost only, 127.0.0.1)
├── Explore        → Playwright opens the site in a SEPARATE headed Chromium window
│                    overlay.ts (injected) = hover/click selection, one element at a time
│                    extract.ts / motion.ts / snapshot.ts run in the page and return JSON
│                    Live state streams to the app over Server-Sent Events
├── My Board       → visual grid, collections, drag order, multi-select, compare
├── Design Library → plain-language search list over the same items
├── Item page      → preview, design, motion, code, notes, tags, versions, look-alikes
├── Design Systems → whole-site collection in a hidden background browser
├── API routes     → session, recreate, responsive, library, design-systems, similar
└── proxy.ts       → only this computer and the app's own pages may call it
SQLite (node:sqlite) + data/ files (screenshots, components, design-systems)
mcp/server.ts      → 13 tools for Claude Code (search, code, tokens, find_similar, …)
```

- **Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Playwright, `node:sqlite`, Anthropic SDK, MCP SDK, zod. No UI kit, no state library.
- **Data model:** one `items` table (`kind`: component · animation · design_system), with `observed` (measured) and `inferred` (reconstructed) JSON kept apart, plus `item_versions`, `collections` / `collection_items`, `websites`, full-text search, and `fingerprint`. Two migrations; the database is backed up before each one.
- **Tests:** 29 Node tests using real Chromium (no UI tests). CI and the release workflow run on GitHub Actions.

## 2. Existing features and how well they work

| Feature | Works? | Notes |
|---|---|---|
| Analyse a URL, hover and click to select | ✅ | Opens in a separate window; one selection at a time |
| Design inspector (colours, type, layout, assets) | ✅ | Measured; strong foundation, reusable as-is |
| Animation explorer (hover, focus, scroll, loops) | ✅ | Measured, with a player; moves the website window while it runs |
| Recreate (exact copy without AI, Claude with a key) | ✅ / ⚠️ | Exact copy is verified at ≥95% pixel match; **the Claude path has never run with a real key** |
| Studio customisation | ✅ | Colours, font, shadow, text size, spacing, corners, speed (CSS variables) |
| Screen sizes (375/768/1280) | ✅ | Logged-out view only |
| Save animation / save component | ✅ | Two separate save forms in two places |
| My Board + Design Library | ✅ | Same data, two destinations |
| Collections, favourites, notes, tags, compare, duplicate, delete | ✅ | Drag reorder needs a mouse |
| Design-system collection + `design.md` | ✅ | Never merged with anything |
| Look-alike search | ✅ | Visual only |
| MCP server for Claude Code | ✅ | Connected for the user across all projects |
| Security guard, local-only binding | ✅ | Tested, including cross-site requests |
| Build prompt for other AI tools | ❌ | Missing; the only generation is Claude, inside the app |
| Multiple selections per session | ❌ | Missing |
| Browser extension | ❌ | Missing |
| Saving assets | ❌ | The `asset` filter exists but nothing can be saved |

## 3. UX problems

| # | Problem | Severity |
|---|---|---|
| U1 | **Two windows.** You browse in a Playwright window and read results in another; you constantly switch, and the window isn't your own browser (no logins, often flagged as a bot). | High |
| U2 | **One selection at a time.** Each click replaces the last; nothing collects a page's navigation, hero, buttons and cards together. | High |
| U3 | **The Explore panel is one very long column**: preview, Animation, Recreate, Screen sizes and Inspector all stacked, with heavy scrolling and no sense of where you are. | High |
| U4 | **Two places for the same library** (My Board, Design Library); users have to learn which one does what. | Medium |
| U5 | **Saving is fragmented**: "Save animation" and "Save component" sit in different panels, and nothing saves a plain selection or an asset. | Medium |
| U6 | **No hand-off to other AI tools**: the most common next step (paste into Claude Code or Cursor) has no button. | Medium |
| U7 | **Generic visual identity**: serif headings on Geist, pill buttons everywhere, a stock blue accent; nothing says "design tool". | Medium |
| U8 | **Leftover placeholders**: "Coming in the next phases" lines remain in Explore. | Low |
| U9 | **No settings** (theme, Claude key status, extension pairing). | Low |
| U10 | **Keyboard and accessibility gaps**: drag reorder has no keyboard path; the selection overlay can't be driven by keyboard. | Medium |
| U11 | **Home is a stats dashboard** (counts first, work second). | Low |

## 4. Technical limitations

- **T1 Playwright-only capture.** It can't use the user's real browser session, logins or extensions, and some sites block automated browsers. → Fixed by the extension.
- **T2 In-memory single session.** One global selection; lost on restart; not designed for several captures.
- **T3 SSE re-sends screenshots** on every state change (fine locally, wasteful for many captures).
- **T4 Variations are linked only inside JSON** (`inferred.of`), not as a column; they can't be listed reliably.
- **T5 The exact copy can't reproduce hover on inner parts**, only on the whole element.
- **T6 Claude generation is unverified live** (no key on this machine).
- **T7 Cross-origin limits** (by design): other sites' frames and stylesheets can't be read; closed shadow DOM is invisible. This applies equally to an extension.
- **T8 The guard blocks every non-app origin**, so an extension can't save to the app until it is explicitly paired.

## 5. Preserve

The in-page readers (`extract.ts`, `motion.ts`, `snapshot.ts`, `extract-system.ts`, `fingerprint.ts`): self-contained, tested, and **directly reusable as extension content-script code**. Also: the observed/inferred split, exact-copy recreation and measured comparison, studio CSS variables, the library data layer, collections, search, design systems and `design.md`, look-alikes, the MCP server, the security guard, migration backups, and CI/release.

## 6. Merge or remove

| Change | Why |
|---|---|
| **Merge My Board + Design Library → Library** (tabs: Websites · Components · Design Systems · Assets · Collections · Variations) | Same data; one destination. No data migration is needed for items, only UI. |
| **Merge "Save animation" / "Save component" → one "Save" per capture** | One mental model: a capture is saved; animation, code and tokens are parts of it. |
| **Home → folded into Analyse** (recent websites and recent captures become its empty state) | Workflow first; the counts move to Library. |
| **Explore → Analyse Website**, split into a capture list + a tabbed detail (Design · Motion · Recreate · Prompt · Sizes) | Fixes U3. |
| **Keep the Playwright window** as a fallback for people without the extension (and for the MCP and tests), but make the extension the primary path | Avoids breaking working flows. |
| **Remove** the "Coming in the next phases" text and the old `ComingSoon` component | Dead UI. |

## 7. Recommended architecture

```
Chrome extension (Manifest V3)                     Plax app (Next.js, localhost)
┌─────────────────────────────┐   paired token     ┌──────────────────────────────┐
│ side panel                  │◀──── HTTP ────────▶│ /api/captures  (new)         │
│  capture list, details,     │   (localhost only) │ Library · Analyse · Settings │
│  prompt + code, save        │                    │ SQLite + data/               │
│ content script = existing   │                    └──────────────────────────────┘
│  overlay + extract + motion │
│  + snapshot readers         │
│ service worker: screenshot  │
│  (captureVisibleTab + crop) │
└─────────────────────────────┘
```

- **The extension works on its own:** selection, multi-capture, inspection, Build Prompt and exact-copy HTML are all done in the browser and stored in `chrome.storage.local`. **Saving to the Library** needs the Plax app running and the extension **paired**: the app shows a one-time token in Settings; the extension sends it as a header; the guard allows exactly that extension origin plus a valid token. Nothing is opened to other websites.
- **Permissions:** `sidePanel`, `activeTab`, `scripting`, `storage`, and host access to `http://localhost/*` only. No `<all_urls>`: `activeTab` covers the tab you're analysing once you open the panel there.
- **Screenshots:** `chrome.tabs.captureVisibleTab`, cropped to the element in the service worker (scrolling it into view first). Elements taller than the screen are captured in their visible part, and the panel says so.
- **Data model (migration 003, with backup):** `analyses` (one per site visit, many captures), `items.analysis_id`, `items.variant_of`, and an `asset` kind. Existing items keep working; Websites in the Library are grouped from `websites` + `analyses`.
- **Build prompt:** generated **deterministically from the measured data, with no AI or key needed**, in five modes (pixel-accurate, editable component, design-system tokens, animation, responsive). Code export: HTML/CSS (exact copy), Tailwind (mapped from tokens), JSON design tokens, React (Claude when connected; otherwise HTML wrapped in a component, clearly labelled).
- **Customisation:** extend the studio with content editing (text, image replace/upload, object-fit, aspect ratio), dimensions and layout, applied to the copy via `DOMParser`. The original is never overwritten: every saved change is a variation (`variant_of`).
- **Build tooling:** the extension's TypeScript is compiled with one small, justified dev dependency (`esbuild`) into plain files, then zipped (`npm run extension:zip` → `dist/plax-extension-<version>.zip`).

## 8. Prioritised roadmap

| Order | Phase | Scope | Done when |
|---|---|---|---|
| 1 | **Rebrand + IA** | Plax name, wordmark, icon, tokens (light/dark), nav = Analyse Website · Library · Settings; remove dead UI | App renamed, old routes redirect, no placeholders |
| 2 | **Extension + multi-capture** *(top priority)* | MV3 side panel, selection mode, hover/click, smart component picking (card over its text), multi-select list (remove, undo, clear, reorder, preview), screenshots, local session | Tested in Chrome on real sites; tests for the selection logic |
| 3 | **Capture model + save** | Migration 003, pairing, `/api/captures`, one Save, analyses grouped by website | Captures from the extension appear in Library; existing data intact |
| 4 | **Build Prompt + code export** | Five prompt modes, HTML/Tailwind/tokens/React, copy and download | Prompts work without a key; tested |
| 5 | **Customisation + variations** | Content, image, dimension and layout editing; `variant_of` | Original never changes; variations listed |
| 6 | **Unified Library** | Tabs, website pages, assets, collections, variations; My Board/Design Library redirect | All old features reachable; no data lost |
| 7 | **Packaging + docs** | ZIP, icons, version, README with screenshots, install guide, CONTRIBUTING | A newcomer can install from the README |
| 8 | **QA** | Run every workflow in Chrome, accessibility and keyboard pass, fix issues | Checklist complete |

**Blockers and honest constraints**
- **Claude features need an API key** to be verified; everything else (including Build Prompt) works without one.
- **Pushing** is done by the user in GitHub Desktop (Git on this Mac has no GitHub sign-in).
- **Chrome Web Store:** the ZIP will be ready for submission, but submitting needs the user's developer account; it won't be described as published.
- **Testing the extension** in Chrome needs the user to load it once (`chrome://extensions` → Developer mode → Load unpacked); automated tests cover the content-script logic in Chromium.
