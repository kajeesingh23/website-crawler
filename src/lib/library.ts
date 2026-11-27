import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir, db, saveComponent, saveItem } from "./db.ts";
import type { SystemData } from "./system/extract-system.ts";
import { designMd } from "./system/design-md.ts";
import { cardPreview, describeLayout, describeMovement, movementBetween, type CardPreview } from "./inspector/describe.ts";
import type { Selection } from "./inspector/session.ts";

// ---------- Reading ----------

export const FILTERS = {
  all: "All",
  component: "Components",
  animation: "Animations",
  typography: "Typography",
  asset: "Assets",
  layout: "Layouts",
  section: "Page sections",
  favourites: "Favourites",
} as const;
export type Filter = keyof typeof FILTERS;

// Which plain-language element names belong to each visual filter.
const GROUPS: Partial<Record<Filter, string[]>> = {
  typography: ["Heading", "Paragraph", "Text", "Link"],
  layout: ["Group", "List", "List item", "Box", "Form"],
  section: ["Section", "Header", "Footer", "Navigation", "Page"],
};

export type Query = {
  id?: string; // one item
  q?: string;
  filter?: Filter;
  collection?: string;
  website?: string;
  category?: string;
  tag?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
  kinds?: string[]; // only these kinds (a Library tab)
  variations?: boolean; // only variations of other items
};

export type ItemCard = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  favourite: boolean;
  thumbnail: string | null;
  sourceUrl: string | null;
  site: string | null;
  createdAt: string;
  moves: boolean;
  preview: CardPreview | null; // the recorded movement, replayed on the card
  variantOf: string | null;
};

const STOP = new Set(
  "a an and the my me i show find all that which with from of on in to for saved save look like any some ones one this these those please get".split(" "),
);

/** Turns "Find buttons that follow the cursor" into a forgiving full-text query: button* OR follow* OR cursor*. */
export function ftsQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return null;
  return [...new Set(words.map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w)))].map((w) => `"${w}"*`).join(" OR ");
}

const CAT = "COALESCE(i.category, json_extract(i.observed, '$.element.label'))";
// Something was seen moving: on its own, on hover or when scrolled into view (not just "motion was looked at").
const MOVING = ["running", "hover.changes", "hover.animations", "scroll.changes", "scroll.animations"]
  .map((k) => `COALESCE(json_array_length(i.observed, '$.motion.${k}'), 0)`)
  .join(" + ");

export function listItems(query: Query = {}): ItemCard[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (clause: string, ...values: (string | number)[]) => {
    where.push(clause);
    args.push(...values);
  };
  const fts = query.q ? ftsQuery(query.q) : null;
  const f = query.filter ?? "all";
  if (f === "component" || f === "animation" || f === "asset") add("i.kind = ?", f);
  if (f === "favourites") add("i.favourite = 1");
  const group = GROUPS[f];
  if (group) add(`${CAT} IN (${group.map(() => "?").join(",")})`, ...group);
  if (query.id) add("i.id = ?", query.id);
  if (query.collection) add("i.id IN (SELECT item_id FROM collection_items WHERE collection_id = ?)", query.collection);
  if (query.website) add("i.website_id = ?", query.website);
  if (query.category) add(`${CAT} = ?`, query.category);
  if (query.tag) add("EXISTS (SELECT 1 FROM json_each(i.tags) WHERE value = ?)", query.tag);
  if (query.from) add("date(i.created_at) >= date(?)", query.from);
  if (query.to) add("date(i.created_at) <= date(?)", query.to);
  if (query.kinds?.length) add(`i.kind IN (${query.kinds.map(() => "?").join(",")})`, ...query.kinds);
  if (query.variations) add("i.variant_of IS NOT NULL");

  const cols = `i.id, i.kind, i.name, i.description, ${CAT} AS category, i.tags, i.favourite, i.thumbnail, i.source_url,
    i.created_at, i.variant_of, COALESCE(w.title, w.url) AS site,
    (i.kind = 'animation' OR ${MOVING} > 0) AS moves, json_extract(i.observed, '$.motion') AS motion`;
  const sql = fts
    ? `SELECT ${cols} FROM items_fts JOIN items i ON i.rowid = items_fts.rowid LEFT JOIN websites w ON w.id = i.website_id
       WHERE items_fts MATCH ? ${where.map((w) => `AND ${w}`).join(" ")} ORDER BY items_fts.rank`
    : `SELECT ${cols} FROM items i LEFT JOIN websites w ON w.id = i.website_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY COALESCE(i.board_order, 0), i.created_at DESC`;
  const rows = db().prepare(sql).all(...(fts ? [fts, ...args] : args)) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    name: String(r.name),
    description: (r.description as string) ?? null,
    category: (r.category as string) ?? null,
    tags: JSON.parse(String(r.tags ?? "[]")),
    favourite: Boolean(r.favourite),
    thumbnail: (r.thumbnail as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    site: (r.site as string) ?? null,
    createdAt: String(r.created_at),
    moves: Boolean(r.moves),
    preview: r.motion ? cardPreview(JSON.parse(String(r.motion))) : null,
    variantOf: (r.variant_of as string) ?? null,
  }));
}

export function libraryCounts() {
  const n = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  return {
    total: n("SELECT COUNT(*) n FROM items"),
    components: n("SELECT COUNT(*) n FROM items WHERE kind = 'component'"),
    animations: n("SELECT COUNT(*) n FROM items WHERE kind = 'animation'"),
    assets: n("SELECT COUNT(*) n FROM items WHERE kind = 'asset'"),
    designSystems: n("SELECT COUNT(*) n FROM items WHERE kind = 'design_system'"),
    favourites: n("SELECT COUNT(*) n FROM items WHERE favourite = 1"),
    variations: n("SELECT COUNT(*) n FROM items WHERE variant_of IS NOT NULL"),
  };
}

/** Every website you've visited, with how much you saved from it and how many extension sessions it had. */
export function listWebsites() {
  return db()
    .prepare(
      `SELECT w.id, w.url, w.title, w.last_seen AS lastSeen,
         (SELECT COUNT(*) FROM items i WHERE i.website_id = w.id) AS items,
         (SELECT COUNT(*) FROM analyses a WHERE a.website_id = w.id) AS analyses
       FROM websites w ORDER BY w.last_seen DESC`,
    )
    .all() as { id: string; url: string; title: string | null; lastSeen: string; items: number; analyses: number }[];
}

export function listCollections() {
  return db()
    .prepare(
      `SELECT c.id, c.name, COUNT(ci.item_id) AS count FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id GROUP BY c.id ORDER BY c.created_at DESC, c.rowid DESC`,
    )
    .all()
    .map((r) => ({ ...r })) as { id: string; name: string; count: number }[]; // plain objects, so they can go to the browser
}

/** Choices for the library's filters: only websites, categories and tags that are actually used. */
export function filterOptions() {
  const d = db();
  return {
    websites: d
      .prepare("SELECT DISTINCT w.id, COALESCE(w.title, w.url) AS name FROM websites w JOIN items i ON i.website_id = w.id ORDER BY name")
      .all()
      .map((r) => ({ ...r })) as { id: string; name: string }[],
    categories: (d.prepare(`SELECT DISTINCT ${CAT} AS c FROM items i WHERE c IS NOT NULL ORDER BY c`).all() as { c: string }[]).map((r) => r.c),
    tags: (d.prepare("SELECT DISTINCT value AS t FROM items, json_each(items.tags) ORDER BY t").all() as { t: string }[]).map((r) => r.t),
  };
}

export type ItemDetail = ItemCard & {
  notes: string | null;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  updatedAt: string;
  versions: { version: number; framework: string | null; note: string | null; createdAt: string; files: string[]; codePath: string | null }[];
  collections: string[];
  code: { html?: string; react?: string };
  original: { id: string; name: string } | null; // what this is a variation of
  variations: { id: string; name: string; thumbnail: string | null }[];
};

export function getItem(id: string): ItemDetail | null {
  const [base] = listItems({ id });
  if (!base) return null;
  const row = db().prepare("SELECT notes, observed, inferred, updated_at FROM items WHERE id = ?").get(id) as Record<string, string>;
  const versions = (
    db().prepare("SELECT version, framework, change_note, created_at, code_path FROM item_versions WHERE item_id = ? ORDER BY version DESC").all(id) as Record<string, unknown>[]
  ).map((v) => {
    const codePath = (v.code_path as string) ?? null;
    const files = codePath && fs.existsSync(path.join(dataDir, codePath)) ? fs.readdirSync(path.join(dataDir, codePath)) : [];
    return { version: Number(v.version), framework: (v.framework as string) ?? null, note: (v.change_note as string) ?? null, createdAt: String(v.created_at), files, codePath };
  });
  const latest = versions[0];
  const read = (file: string) => {
    const p = latest?.codePath && path.join(dataDir, latest.codePath, file);
    return p && fs.existsSync(p) ? fs.readFileSync(p, "utf8") : undefined;
  };
  return {
    ...base,
    notes: row.notes ?? null,
    observed: JSON.parse(row.observed || "{}"),
    inferred: JSON.parse(row.inferred || "{}"),
    updatedAt: row.updated_at,
    versions,
    collections: (db().prepare("SELECT collection_id AS id FROM collection_items WHERE item_id = ?").all(id) as { id: string }[]).map((r) => r.id),
    code: { html: read("component.html"), react: read("Component.tsx") },
    original: originalOf(base.variantOf),
    variations: db()
      .prepare("SELECT id, name, thumbnail FROM items WHERE variant_of = ? ORDER BY created_at DESC")
      .all(id)
      .map((r) => ({ ...r })) as ItemDetail["variations"],
  };
}

function originalOf(id: string | null) {
  const row = id ? db().prepare("SELECT id, name FROM items WHERE id = ?").get(id) : undefined;
  return row ? { id: String(row.id), name: String(row.name) } : null; // a plain object, so it can go to the browser
}

/**
 * A customised copy saved as its own item, linked to the original by variant_of.
 * The original, its files and its versions are never changed.
 */
export function saveVariation(sourceId: string, v: { name: string; html: string; png?: Buffer; changes: unknown }): string {
  const src = getItem(sourceId);
  if (!src) throw new Error("The original no longer exists.");
  const name = v.name.trim();
  if (!name || name.length > 120) throw new Error("A name needs 1 to 120 characters.");
  if (!v.html.includes("pdi-root") || v.html.length > 6_000_000) throw new Error("The customised copy isn't valid.");
  return saveComponent({
    kind: src.kind === "asset" ? "asset" : "component",
    name,
    sourceUrl: src.sourceUrl ?? undefined,
    png: v.png,
    html: v.html,
    note: "Customised in Plax",
    variantOf: src.id,
    observed: src.observed, // what was measured on the original page; the changes are kept apart below
    inferred: { source: "variation", of: src.id, changes: v.changes },
    category: src.category ?? undefined,
    tags: [...new Set([...src.tags, "variation"])],
    description: `Variation of “${src.name}”`,
  });
}

// Folders the app may serve files from; everything else in data/ (the database above all) stays private.
const FILE_DIRS = ["screenshots", "components", "design-systems"];

/** A file from the library folder, refusing anything outside FILE_DIRS. */
export function resolveDataFile(parts: string[]): string | null {
  if (!FILE_DIRS.includes(parts[0] ?? "")) return null;
  // Check where the path really ends up, so "screenshots/../database" can't escape.
  const base = path.join(dataDir, parts[0]);
  const abs = path.resolve(dataDir, ...parts);
  return abs.startsWith(base + path.sep) && fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

// ---------- Describing new items (so plain-language search finds them) ----------

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Category, tags and a one-line description, all derived from what was measured. */
export function describeForLibrary(sel: Selection, url?: string) {
  const host = url ? new URL(url).hostname.replace(/^www\./, "") : undefined;
  const tags = new Set<string>([sel.label.toLowerCase()]);
  if (host) tags.add(host);
  const d = sel.design;
  const bg = d?.appearance.background ?? d?.appearance.sitsOn;
  if (bg) tags.add(luminance(bg.hex) < 0.35 ? "dark" : luminance(bg.hex) > 0.8 ? "light" : "mid-tone");
  if (d?.typography.family) tags.add(d.typography.family.toLowerCase());
  const m = sel.motion;
  const hoverMove = m?.hover?.changes.find((c) => c.prop === "transform");
  if (m?.hover?.changes.length) tags.add("hover");
  if (m?.running.length) tags.add("loop");
  if (m?.scroll?.changes.length || m?.scroll?.animations.length) tags.add("scroll");
  if (m?.focus?.changes.length) tags.add("focus");
  if (m && (m.running.length || m.hover?.changes.length || m.scroll?.changes.length)) tags.add("animated");

  const parts = [`${sel.label} from ${host ?? "a website"}`];
  if (d) parts.push(describeLayout(d.layout).replace(/\.$/, "").toLowerCase());
  if (hoverMove) {
    const text = describeMovement(movementBetween(hoverMove.from, hoverMove.to));
    if (text) parts.push(`${text.toLowerCase()} on hover`);
  }
  if (m?.scroll?.changes.length) parts.push("reveals when scrolled into view");
  return { category: sel.label, tags: [...tags], description: parts.join(" · ") };
}

// ---------- Changing ----------

const tx = <T>(fn: () => T): T => {
  db().exec("BEGIN");
  try {
    const out = fn();
    db().exec("COMMIT");
    return out;
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
};

export function updateItem(id: string, patch: { name?: string; notes?: string; tags?: string[]; favourite?: boolean }) {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 120) throw new Error("A name needs 1 to 120 characters.");
    sets.push("name = ?");
    args.push(name);
  }
  if (patch.notes !== undefined) {
    if (patch.notes.length > 5000) throw new Error("Notes can be up to 5,000 characters.");
    sets.push("notes = ?");
    args.push(patch.notes);
  }
  if (patch.tags !== undefined) {
    const tags = [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (tags.length > 30 || tags.some((t) => t.length > 40)) throw new Error("Up to 30 tags, each up to 40 characters.");
    sets.push("tags = ?");
    args.push(JSON.stringify(tags));
  }
  if (patch.favourite !== undefined) {
    sets.push("favourite = ?");
    args.push(patch.favourite ? 1 : 0);
  }
  if (!sets.length) return;
  db().prepare(`UPDATE items SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...args, id);
}

/** Permanently deletes items and their screenshots and code. */
export function deleteItems(ids: string[]) {
  tx(() => {
    for (const id of ids) db().prepare("DELETE FROM items WHERE id = ?").run(id);
  });
  for (const id of ids) {
    fs.rmSync(path.join(dataDir, "screenshots", `${id}.png`), { force: true });
    for (const dir of ["components", "design-systems"]) fs.rmSync(path.join(dataDir, dir, id), { recursive: true, force: true });
  }
}

/** Gives every item a whole-number position, keeping the current order. */
function normaliseOrder() {
  const ids = (db().prepare("SELECT id FROM items ORDER BY COALESCE(board_order, 0), created_at DESC").all() as { id: string }[]).map((r) => r.id);
  tx(() => ids.forEach((id, i) => db().prepare("UPDATE items SET board_order = ? WHERE id = ?").run(i, id)));
}

/** A full copy (screenshot, code and versions included), placed right after the original. */
export function duplicateItem(id: string): string {
  const src = db().prepare("SELECT thumbnail FROM items WHERE id = ?").get(id) as { thumbnail: string | null } | undefined;
  if (!src) throw new Error("That item no longer exists.");
  const copy = randomUUID();
  const thumbnail = src.thumbnail ? `screenshots/${copy}.png` : null;
  if (thumbnail && fs.existsSync(path.join(dataDir, src.thumbnail!))) fs.copyFileSync(path.join(dataDir, src.thumbnail!), path.join(dataDir, thumbnail));
  for (const dir of ["components", "design-systems"])
    if (fs.existsSync(path.join(dataDir, dir, id))) fs.cpSync(path.join(dataDir, dir, id), path.join(dataDir, dir, copy), { recursive: true });
  normaliseOrder();
  const order = (db().prepare("SELECT board_order FROM items WHERE id = ?").get(id) as { board_order: number }).board_order;
  tx(() => {
    db().prepare("UPDATE items SET board_order = board_order + 1 WHERE board_order > ?").run(order);
    db()
      .prepare(
        `INSERT INTO items (id, kind, name, description, category, tags, notes, website_id, source_url, thumbnail, favourite, board_order, observed, inferred)
         SELECT ?, kind, name || ' copy', description, category, tags, notes, website_id, source_url, ?, favourite, ?, observed, inferred FROM items WHERE id = ?`,
      )
      .run(copy, thumbnail, order + 1, id);
    db()
      .prepare(
        `INSERT INTO item_versions (id, item_id, version, framework, code_path, change_note)
         SELECT lower(hex(randomblob(16))), ?, version, framework, replace(code_path, ?, ?), change_note FROM item_versions WHERE item_id = ?`,
      )
      .run(copy, `/${id}/`, `/${copy}/`, id);
  });
  return copy;
}

/** Drag and drop: puts one item just before or after another. */
export function moveItem(id: string, targetId: string, place: "before" | "after") {
  if (id === targetId) return;
  normaliseOrder();
  const ids = (db().prepare("SELECT id FROM items ORDER BY board_order").all() as { id: string }[]).map((r) => r.id).filter((x) => x !== id);
  const at = ids.indexOf(targetId);
  if (at < 0) throw new Error("That item no longer exists.");
  ids.splice(place === "before" ? at : at + 1, 0, id);
  tx(() => ids.forEach((x, i) => db().prepare("UPDATE items SET board_order = ? WHERE id = ?").run(i, x)));
}

export function createCollection(name: string): string {
  const n = name.trim();
  if (!n || n.length > 80) throw new Error("A collection name needs 1 to 80 characters.");
  const id = randomUUID();
  db().prepare("INSERT INTO collections (id, name) VALUES (?, ?)").run(id, n);
  return id;
}

export function renameCollection(id: string, name: string) {
  const n = name.trim();
  if (!n || n.length > 80) throw new Error("A collection name needs 1 to 80 characters.");
  db().prepare("UPDATE collections SET name = ? WHERE id = ?").run(n, id);
}

/** Removes the collection only; its items stay in the library. */
export function deleteCollection(id: string) {
  db().prepare("DELETE FROM collections WHERE id = ?").run(id);
}

/** An item can sit in many collections; adding it twice changes nothing. */
export function addToCollection(collectionId: string, ids: string[]) {
  tx(() => {
    for (const id of ids) db().prepare("INSERT OR IGNORE INTO collection_items (collection_id, item_id) VALUES (?, ?)").run(collectionId, id);
  });
}

export function removeFromCollection(collectionId: string, ids: string[]) {
  tx(() => {
    for (const id of ids) db().prepare("DELETE FROM collection_items WHERE collection_id = ? AND item_id = ?").run(collectionId, id);
  });
}

/**
 * Saves a collected design system as its own, independent reference: the page screenshot as its
 * thumbnail, example screenshots and design.md in data/design-systems/<id>/.
 */
export function saveDesignSystem(c: { name: string; system: SystemData; pageShot?: Buffer; shots: (Buffer | null)[] }): string {
  const s = c.system;
  const host = new URL(s.url).hostname.replace(/^www\./, "");
  const id = saveItem({
    kind: "design_system",
    name: c.name,
    sourceUrl: s.url,
    png: c.pageShot,
    observed: {},
    category: "Design system",
    tags: ["design system", host, ...s.fonts.map((f) => f.family.toLowerCase())],
    description: `Design system from ${host} · ${s.colours.length} colours, ${s.type.length} text styles, ${s.spacing.length} spacing steps, ${s.examples.length} component examples`,
  });
  const rel = `design-systems/${id}`;
  try {
    fs.mkdirSync(path.join(dataDir, rel), { recursive: true });
    const examples = s.examples.map((e, i) => {
      const shot = c.shots[i];
      if (!shot) return e;
      const image = `example-${i + 1}.png`;
      fs.writeFileSync(path.join(dataDir, rel, image), shot);
      return { ...e, image };
    });
    const saved = { ...s, examples };
    fs.writeFileSync(path.join(dataDir, rel, "design.md"), designMd(saved));
    tx(() => {
      db().prepare("UPDATE items SET observed = ? WHERE id = ?").run(JSON.stringify({ system: saved }), id);
      db()
        .prepare("INSERT INTO item_versions (id, item_id, version, framework, code_path, change_note) VALUES (?, ?, 1, 'design.md', ?, 'Collected')")
        .run(randomUUID(), id, rel);
    });
  } catch (e) {
    deleteItems([id]);
    throw e;
  }
  return id;
}
