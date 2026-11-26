# Roadmap

Each phase ends with a short report covering what was done, what changed, how to test it, its limits and what comes next.
Branches: `main` (stable), `develop` (integration), plus one `feature/*` branch per phase.

| Phase | Branch | Success when… |
|---|---|---|
| 0 Foundation ✅ | `main` | Repo, scaffold, schema, docs |
| 1 Foundation app ✅ | `feature/browser-inspector` | Paste a URL, the site opens, hover and click to select an element |
| 2 Design inspector ✅ | `feature/browser-inspector` | You understand the selection's colour, type, layout and assets without reading code |
| 3 Animation inspector ✅ | `feature/animation-engine` | You can see, replay and save animations; observed and reconstructed ones are marked apart |
| 4 Recreate + customise ✅ | `feature/component-library` | You get a working copy, can compare it with the original, and can tweak it visually |
| 5 My Board + Library ✅ | `feature/collection-board` | Everything saved shows up on the board, with collections and search |
| 6 Design systems ✅ | `feature/design-systems` | Whole-site tokens, plus a `design.md` export |
| 7 Claude + MCP ✅ | `feature/mcp-integration` | Claude Code can search and reuse your library |
| 8 Refinement ✅ | `develop` | Similarity search, responsive inspection, security review |

## Plax (2.0)

Planned in [PLAX-AUDIT.md](PLAX-AUDIT.md), built on `feature/plax`.

| Phase | Done when… |
|---|---|
| 1 Rebrand + IA ✅ | Plax name and look; Analyse Website · Library · Settings; old addresses redirect; no placeholders |
| 2 Extension + multi-capture ✅ | Side panel, smart picking, multi-selection with reorder, undo and clear, pictures, saved list |
| 3 Capture model + save ✅ | Migration 003, pairing, `/api/captures`, one Save per capture |
| 4 Build Prompt + code export ✅ | Five prompt modes and four code formats, without a key |
| 5 Customisation + variations ✅ | Text, pictures, size and layout edits saved as variations |
| 6 Unified Library ✅ | One Library with six tabs; every earlier feature kept |
| 7 Packaging + docs ✅ | ZIP, icons, install guide, README, CONTRIBUTING |
| 8 QA ✅ | Every workflow run; tests, lint and build pass |
