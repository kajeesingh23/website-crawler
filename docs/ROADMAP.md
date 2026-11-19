# Roadmap

Each phase ends with a short report covering what was done, what changed, how to test it, its limits and what comes next.
Branches: `main` (stable), `develop` (integration), plus one `feature/*` branch per phase.

| Phase | Branch | Success when… |
|---|---|---|
| 0 Foundation ✅ | `main` | Repo, scaffold, schema, docs |
| 1 Foundation app ✅ | `feature/browser-inspector` | Paste a URL, the site opens, hover and click to select an element |
| 2 Design inspector ✅ | `feature/browser-inspector` | You understand the selection's colour, type, layout and assets without reading code |
| 3 Animation inspector | `feature/animation-engine` | You can see, replay and save animations; observed and reconstructed ones are marked apart |
| 4 Recreate + customise | `feature/component-library` | You get a working copy, can compare it with the original, and can tweak it visually |
| 5 My Board + Library | `feature/collection-board` | Everything saved shows up on the board, with collections and search |
| 6 Design systems | `feature/design-systems` | Whole-site tokens, plus a `design.md` export |
| 7 Claude + MCP | `feature/mcp-integration` | Claude Code can search and reuse your library |
| 8 Refinement | `develop` | Similarity search, responsive inspection, security review |
