// Personal Design Intelligence — local MCP server.
// Lets Claude Code (or any MCP client) search and reuse your design library. Runs on this computer
// only, talks over stdin/stdout, and never goes on the internet. Start: node mcp/server.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// The library code finds its database and migrations relative to the project folder.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const L = await import("../src/lib/library.ts");
const { dataDir, saveComponent } = await import("../src/lib/db.ts");
const { findSimilar } = await import("../src/lib/visual/index.ts");
const { describeLayout, describeMovement, movementBetween, duration, easingName, weightName } = await import("../src/lib/inspector/describe.ts");
type Design = import("../src/lib/inspector/extract.ts").Design;
type Motion = import("../src/lib/inspector/session.ts").Motion;
type SystemData = import("../src/lib/system/extract-system.ts").SystemData;

const server = new McpServer({ name: "personal-design-intelligence", version: "0.7.0" });

type Reply = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };
const reply = (value: unknown): Reply => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string): Reply => ({ content: [{ type: "text", text: message }], isError: true });
const READ = { readOnlyHint: true, openWorldHint: false } as const;
const KINDS: Record<string, string> = { component: "Component", animation: "Animation", design_system: "Design system" };

const item = (id: string) => L.getItem(id);
const missing = (id: string) => fail(`No item with id ${id}. Use search_library to find ids.`);
const file = (rel: string | null | undefined) => (rel ? path.join(dataDir, rel) : undefined);

/** The design tokens of one component, in plain values a project can use. */
function componentTokens(d: Design) {
  const a = d.appearance;
  return {
    colours: {
      background: a.background?.hex ?? `transparent (sits on ${a.sitsOn?.hex ?? "white"})`,
      text: a.text.hex,
      border: a.border ? `${a.border.width}px ${a.border.style} ${a.border.colour.hex}` : null,
      palette: d.palette.map((c) => ({ hex: c.hex, alpha: c.alpha, usedFor: c.uses })),
    },
    typography: {
      font: d.typography.family,
      fontStack: d.typography.stack,
      size: `${d.typography.size}px`,
      weight: weightName(d.typography.weight),
      lineHeight: d.typography.lineHeight,
      letterSpacing: d.typography.letterSpacing,
      otherFontsInside: d.fonts.map((f) => f.family),
    },
    spacing: { inside: d.layout.padding.map((n) => `${n}px`).join(" "), outside: d.layout.margin.map((n) => `${n}px`).join(" "), gap: `${d.layout.gap}px` },
    corners: d.appearance.radius,
    shadow: d.appearance.shadow,
    size: `${d.layout.width} × ${d.layout.height}px`,
    layout: describeLayout(d.layout),
  };
}

/** How something moves, in words plus the exact timing and keyframes. */
function motionSummary(m: Motion) {
  const moment = (i: { changes: { part: string; prop: string; from: string; to: string }[] } | null) =>
    i?.changes.map((c) => {
      const t = m.transitions.find((x) => x.part === c.part && (x.prop === c.prop || x.prop === "all"));
      const words = c.prop === "transform" ? describeMovement(movementBetween(c.from, c.to)) : `${c.prop}: ${c.from} → ${c.to}`;
      return `${c.part}: ${words}${t ? ` over ${duration(t.duration)}, ${easingName(t.easing).toLowerCase()} (${t.easing})` : ""}`;
    }) ?? [];
  return {
    observed: "Everything here was seen on the live page, not reconstructed.",
    onItsOwn: m.running.map((a) => ({ name: a.name, kind: a.kind, part: a.part, duration: duration(a.duration), easing: a.easing, iterations: a.iterations, direction: a.direction, keyframes: a.keyframes })),
    onHover: moment(m.hover),
    onFocus: m.focus ? moment(m.focus) : "Can't be focused",
    onScrollIntoView: m.scroll ? { changes: moment(m.scroll), animations: m.scroll.animations.map((a) => a.name), drivenByScript: m.scroll.scripted } : "Visible from the start, so not tested",
    declaredTransitions: m.transitions.map((t) => `${t.part}: ${t.prop} ${duration(t.duration)} ${t.easing}${t.delay ? ` after ${duration(t.delay)}` : ""}`),
    scrollLinked: m.scrollTimelines,
  };
}

server.registerTool(
  "search_library",
  {
    title: "Search the design library",
    description:
      "Find saved components, animations and design systems. Plain words work: 'buttons that follow the cursor', 'dark navigation', 'scroll reveal'. Returns ids for the other tools.",
    inputSchema: {
      query: z.string().max(300).optional().describe("Plain-language search; leave out to list everything"),
      filter: z.enum(["all", "component", "animation", "typography", "layout", "section", "favourites"]).optional(),
      collection_id: z.string().optional().describe("Only items in this collection (see list_collections)"),
      tag: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: READ,
  },
  async ({ query, filter, collection_id, tag, limit }) => {
    const items = L.listItems({ q: query, filter, collection: collection_id, tag }).slice(0, limit ?? 20);
    if (!items.length) return reply("Nothing matches. Try fewer or different words, or leave the query out to list everything.");
    return reply(
      items.map((i) => ({
        id: i.id,
        name: i.name,
        kind: KINDS[i.kind] ?? i.kind,
        category: i.category,
        description: i.description,
        website: i.site,
        tags: i.tags,
        favourite: i.favourite,
        animated: i.moves,
        saved: i.createdAt,
      })),
    );
  },
);

server.registerTool(
  "get_item",
  {
    title: "Open a saved item",
    description: "Everything about one saved item: what it is, where it came from, its design tokens, how it moves, how it was recreated, notes, tags, versions and file locations.",
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const i = item(id);
    if (!i) return missing(id);
    const design = i.observed.design as Design | undefined;
    const motion = i.observed.motion as Motion | undefined;
    const system = i.observed.system as SystemData | undefined;
    return reply({
      id: i.id,
      name: i.name,
      kind: KINDS[i.kind] ?? i.kind,
      category: i.category,
      description: i.description,
      source: i.sourceUrl,
      website: i.site,
      saved: i.createdAt,
      notes: i.notes,
      tags: i.tags,
      favourite: i.favourite,
      collections: L.listCollections().filter((c) => i.collections.includes(c.id)).map((c) => c.name),
      tokens: design ? componentTokens(design) : undefined,
      motion: motion ? motionSummary(motion) : undefined,
      designSystem: system ? { colours: system.colours.length, textStyles: system.type.length, fonts: system.fonts.map((f) => f.family), note: "Use get_design_tokens for the full system." } : undefined,
      recreation: i.kind === "component" ? { ...i.inferred, note: "Reconstructed, not measured. 'compare' rows were measured on rendered pages." } : undefined,
      hasCode: { html: !!i.code.html, react: !!i.code.react },
      versions: i.versions.map((v) => ({ version: v.version, saved: v.createdAt, note: v.note, files: v.files.map((f) => file(`${v.codePath}/${f}`)) })),
      screenshot: file(i.thumbnail),
    });
  },
);

server.registerTool(
  "get_code",
  {
    title: "Get a component's code",
    description:
      "The saved code of a component: a standalone HTML/CSS document and, when it exists, a React (TypeScript) version. The root element has class 'pdi-root'; CSS variables like --pdi-bg and --pdi-space are its customisation points.",
    inputSchema: { id: z.string(), format: z.enum(["html", "react", "both"]).optional() },
    annotations: READ,
  },
  async ({ id, format = "both" }) => {
    const i = item(id);
    if (!i) return missing(id);
    if (!i.code.html && !i.code.react) return fail(`“${i.name}” has no saved code. Only recreated components do; use get_item for its design.`);
    const parts: string[] = [];
    if (format !== "react" && i.code.html) parts.push(`HTML and CSS (${i.name}):\n\n${i.code.html}`);
    if (format !== "html") parts.push(i.code.react ? `React:\n\n${i.code.react}` : "No React version was saved (it was an exact copy made without Claude).");
    return reply(parts.join("\n\n---\n\n"));
  },
);

server.registerTool(
  "get_animation",
  {
    title: "Get how something moves",
    description: "The observed motion of an item: what moves on its own, on hover, on focus and when scrolled into view, with durations, easing and keyframes.",
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const i = item(id);
    if (!i) return missing(id);
    const m = i.observed.motion as Motion | undefined;
    return m ? reply({ name: i.name, ...motionSummary(m) }) : fail(`“${i.name}” has no recorded motion. Animations are recorded with Explore animation in the app.`);
  },
);

server.registerTool(
  "get_design_tokens",
  {
    title: "Get design tokens",
    description:
      "For a design system: its full design.md (colours with uses, type scale, spacing, corners, shadows, layout, breakpoints, motion, CSS tokens). For a component: its colours, type, spacing, corners and shadow.",
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const i = item(id);
    if (!i) return missing(id);
    if (i.kind === "design_system") {
      const md = file(`${i.versions[0]?.codePath}/design.md`);
      return md && fs.existsSync(md) ? reply(fs.readFileSync(md, "utf8")) : fail("This design system's design.md is missing.");
    }
    const d = i.observed.design as Design | undefined;
    return d ? reply({ name: i.name, ...componentTokens(d) }) : fail(`“${i.name}” has no measured design.`);
  },
);

server.registerTool(
  "get_assets",
  {
    title: "List an item's assets",
    description:
      "Images, icons (as SVG markup), background images and videos inside an item, with their original addresses, plus the item's own screenshot and example pictures on disk. Check licences before reusing website assets.",
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const i = item(id);
    if (!i) return missing(id);
    const d = i.observed.design as Design | undefined;
    const sys = i.observed.system as SystemData | undefined;
    return reply({
      name: i.name,
      source: i.sourceUrl,
      licence: "These come from someone else's website. Check the licence before reusing them.",
      assets: (d?.assets ?? []).map((a) => ({ kind: a.kind, url: a.url, svg: a.svg, size: `${a.width} × ${a.height}`, alt: a.alt })),
      fonts: d?.fonts ?? sys?.fonts ?? [],
      screenshot: file(i.thumbnail),
      examplePictures: sys?.examples.filter((e) => e.image).map((e) => ({ kind: e.kind, label: e.label, file: file(`design-systems/${i.id}/${e.image}`) })) ?? [],
    });
  },
);

server.registerTool(
  "get_preview",
  {
    title: "See an item",
    description: "The item's screenshot as an image, so you can look at it (for example to find one similar to a picture the user shared).",
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const i = item(id);
    if (!i) return missing(id);
    const p = file(i.thumbnail);
    if (!p || !fs.existsSync(p)) return fail(`“${i.name}” has no screenshot.`);
    return { content: [{ type: "text", text: `${i.name} (${KINDS[i.kind] ?? i.kind})` }, { type: "image", data: fs.readFileSync(p).toString("base64"), mimeType: "image/png" }] };
  },
);

server.registerTool(
  "compare_items",
  {
    title: "Compare items",
    description: "Side-by-side design tokens and motion of 2 to 4 saved items.",
    inputSchema: { ids: z.array(z.string()).min(2).max(4) },
    annotations: READ,
  },
  async ({ ids }) => {
    const found = ids.map((id) => item(id));
    const lost = ids.filter((_, n) => !found[n]);
    if (lost.length) return fail(`Unknown ids: ${lost.join(", ")}`);
    return reply(
      found.map((i) => ({
        id: i!.id,
        name: i!.name,
        kind: KINDS[i!.kind] ?? i!.kind,
        website: i!.site,
        tokens: i!.observed.design ? componentTokens(i!.observed.design as Design) : undefined,
        motion: i!.observed.motion ? motionSummary(i!.observed.motion as Motion) : undefined,
      })),
    );
  },
);

server.registerTool(
  "list_collections",
  {
    title: "List collections",
    description: "The user's collections with how many items each holds. Pass a collection id to search_library to see its items.",
    inputSchema: {},
    annotations: READ,
  },
  async () => reply(L.listCollections()),
);

server.registerTool(
  "find_similar",
  {
    title: "Find items that look similar",
    description:
      "Saved items whose screenshots look most like an item, or like a picture on this computer (for example a screenshot the user shared). Compares shape and colour, not meaning; scores are 0–1.",
    inputSchema: {
      id: z.string().optional().describe("Find look-alikes of this saved item"),
      image_path: z.string().optional().describe("Or: full path of a PNG, JPEG or WebP picture on this computer"),
      limit: z.number().int().min(1).max(20).optional(),
    },
    annotations: READ,
  },
  async ({ id, image_path, limit }) => {
    if (!id && !image_path) return fail("Give an item id or an image_path.");
    let target: { id: string } | { image: Buffer; mime: string };
    if (id) {
      if (!item(id)) return missing(id);
      target = { id };
    } else {
      const ext = path.extname(image_path!).toLowerCase();
      const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext];
      if (!mime) return fail("Only PNG, JPEG or WebP pictures can be compared.");
      if (!fs.existsSync(image_path!) || fs.statSync(image_path!).size > 20_000_000) return fail("That picture doesn't exist or is larger than 20 MB.");
      target = { image: fs.readFileSync(image_path!), mime };
    }
    const found = await findSimilar(target, limit ?? 6);
    return found.length
      ? reply(found.map((i) => ({ id: i.id, name: i.name, kind: KINDS[i.kind] ?? i.kind, score: i.score, website: i.site, description: i.description })))
      : reply("Nothing in the library has a picture to compare with yet.");
  },
);

// ---------- Changes: never without the user's go-ahead ----------

const CONFIRM = z.literal(true).describe("Set to true only after the user has explicitly agreed to this change in the conversation");

server.registerTool(
  "save_variation",
  {
    title: "Save a variation of a component",
    description:
      "Saves new code you wrote as a NEW item in the library, based on an existing one (the original is never changed). Ask the user first and pass confirmed: true only after they agree.",
    inputSchema: {
      source_id: z.string(),
      name: z.string().min(1).max(120),
      html: z.string().min(1).max(400_000).describe('A standalone HTML document; give the component\'s root element class="pdi-root"'),
      react: z.string().max(400_000).optional(),
      what_changed: z.string().min(1).max(500).describe("One line, e.g. 'Dark navy version with a slower hover'"),
      confirmed: CONFIRM,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ source_id, name, html, react, what_changed }) => {
    const src = item(source_id);
    if (!src) return missing(source_id);
    const shot = file(src.thumbnail);
    const id = saveComponent({
      name,
      sourceUrl: src.sourceUrl ?? undefined,
      png: shot && fs.existsSync(shot) ? fs.readFileSync(shot) : undefined,
      html,
      react,
      note: what_changed,
      observed: src.observed,
      inferred: { source: "variation", of: source_id, notes: what_changed, note: "Written by Claude from a saved item; not measured." },
      category: src.category ?? undefined,
      tags: [...new Set([...src.tags, "variation"])],
      description: `Variation of “${src.name}”: ${what_changed}`,
    });
    return reply({ saved: true, id, name, message: `Saved “${name}” as a new item. The original is unchanged.` });
  },
);

server.registerTool(
  "update_item",
  {
    title: "Change an item's name, notes, tags or favourite",
    description: "Edits an EXISTING item. Ask the user first and pass confirmed: true only after they agree. Tags replace the current tags.",
    inputSchema: {
      id: z.string(),
      name: z.string().min(1).max(120).optional(),
      notes: z.string().max(5000).optional(),
      tags: z.array(z.string().max(40)).max(30).optional(),
      favourite: z.boolean().optional(),
      confirmed: CONFIRM,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, name, notes, tags, favourite }) => {
    if (!item(id)) return missing(id);
    try {
      L.updateItem(id, { name, notes, tags, favourite });
    } catch (e) {
      return fail((e as Error).message);
    }
    return reply({ updated: true, id });
  },
);

server.registerTool(
  "add_to_collection",
  {
    title: "Add items to a collection",
    description: "Adds items to an existing collection, or creates a new one. Items aren't copied. Ask the user first and pass confirmed: true only after they agree.",
    inputSchema: {
      ids: z.array(z.string()).min(1).max(100),
      collection_id: z.string().optional(),
      new_collection_name: z.string().min(1).max(80).optional(),
      confirmed: CONFIRM,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ ids, collection_id, new_collection_name }) => {
    const lost = ids.filter((id) => !item(id));
    if (lost.length) return fail(`Unknown ids: ${lost.join(", ")}`);
    if (!collection_id && !new_collection_name) return fail("Give collection_id or new_collection_name.");
    try {
      if (collection_id && !L.listCollections().some((c) => c.id === collection_id)) return fail(`No collection with id ${collection_id}. Use list_collections.`);
      const target = collection_id ?? L.createCollection(new_collection_name!);
      L.addToCollection(target, ids);
      return reply({ added: ids.length, collection_id: target });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

await server.connect(new StdioServerTransport());
