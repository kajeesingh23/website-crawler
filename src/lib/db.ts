import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.PDI_DATA_DIR ?? "data");

const g = globalThis as typeof globalThis & { __pdiDb?: DatabaseSync };

// The open database survives dev-server reloads, so new migrations are checked once per code load too.
let checked = false;

/** Opens data/database/library.db once per server process and applies any new migrations. */
export function db(): DatabaseSync {
  const file = path.join(dataDir, "database", "library.db");
  if (g.__pdiDb) {
    if (!checked) migrate(g.__pdiDb, file);
    checked = true;
    return g.__pdiDb;
  }
  checked = true;
  fs.mkdirSync(path.join(dataDir, "database"), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  migrate(d, file);
  return (g.__pdiDb = d);
}

function migrate(d: DatabaseSync, file: string) {
  const dir = path.join(process.cwd(), "db", "migrations");
  const done = new Set(d.prepare("SELECT name FROM schema_migrations").all().map((r) => r.name as string));
  const pending = fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !done.has(f)).sort();
  if (!pending.length) return;
  // Back up an existing library before changing its structure.
  if (done.size) d.exec(`VACUUM INTO '${`${file}.backup-${Date.now()}`.replaceAll("'", "''")}'`);
  for (const name of pending) {
    d.exec("BEGIN");
    try {
      d.exec(fs.readFileSync(path.join(dir, name), "utf8"));
      d.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  }
}

export function recordWebsite(url: string, title: string) {
  db()
    .prepare(
      `INSERT INTO websites (id, url, title) VALUES (?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET title = excluded.title, last_seen = datetime('now')`,
    )
    .run(randomUUID(), url, title);
}

/**
 * Saves something to the library. The screenshot goes to data/screenshots/, everything measured on
 * the page goes in `observed`. Returns the new item's id.
 */
export function saveItem(item: {
  kind: "animation" | "component" | "design_system" | "asset";
  name: string;
  sourceUrl?: string;
  observed: unknown;
  inferred?: unknown;
  png?: Buffer;
  category?: string;
  tags?: string[];
  description?: string;
  analysisId?: string;
  variantOf?: string;
}) {
  const id = randomUUID();
  let thumbnail: string | null = null;
  if (item.png) {
    fs.mkdirSync(path.join(dataDir, "screenshots"), { recursive: true });
    thumbnail = `screenshots/${id}.png`;
    fs.writeFileSync(path.join(dataDir, thumbnail), item.png);
  }
  try {
    const site = item.sourceUrl
      ? (db().prepare("SELECT id FROM websites WHERE url = ?").get(item.sourceUrl) as { id: string } | undefined)
      : undefined;
    db()
      .prepare(
        `INSERT INTO items (id, kind, name, website_id, source_url, thumbnail, observed, inferred, category, tags, description, analysis_id, variant_of, board_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MIN(board_order), 0) - 1 FROM items))`, // newest first on the board
      )
      .run(
        id, item.kind, item.name, site?.id ?? null, item.sourceUrl ?? null, thumbnail,
        JSON.stringify(item.observed), JSON.stringify(item.inferred ?? {}),
        item.category ?? null, JSON.stringify(item.tags ?? []), item.description ?? null,
        item.analysisId ?? null, item.variantOf ?? null,
      );
  } catch (e) {
    if (thumbnail) fs.rmSync(path.join(dataDir, thumbnail), { force: true }); // no orphan files
    throw e;
  }
  return id;
}

/** Saves a recreated component: the item, plus its code as version 1 in data/components/<id>/v1/. */
export function saveComponent(c: {
  kind?: "component" | "asset";
  name: string;
  sourceUrl?: string;
  png?: Buffer;
  observed: unknown;
  inferred: unknown;
  html: string;
  react?: string;
  note?: string;
  category?: string;
  tags?: string[];
  description?: string;
  analysisId?: string;
  variantOf?: string;
}) {
  const { html, react, note, kind, ...item } = c;
  const id = saveItem({ kind: kind ?? "component", ...item });
  const rel = `components/${id}/v1`;
  try {
    fs.mkdirSync(path.join(dataDir, rel), { recursive: true });
    fs.writeFileSync(path.join(dataDir, rel, "component.html"), html);
    if (react) fs.writeFileSync(path.join(dataDir, rel, "Component.tsx"), react);
    db()
      .prepare("INSERT INTO item_versions (id, item_id, version, framework, code_path, change_note) VALUES (?, ?, 1, ?, ?, ?)")
      .run(randomUUID(), id, react ? "html-css, react" : "html-css", rel, note ?? null);
  } catch (e) {
    // Don't leave a half-saved component behind.
    db().prepare("DELETE FROM items WHERE id = ?").run(id);
    fs.rmSync(path.join(dataDir, "components", id), { recursive: true, force: true });
    fs.rmSync(path.join(dataDir, "screenshots", `${id}.png`), { force: true });
    throw e;
  }
  return id;
}

/** A new version of a saved item's code; earlier versions stay as they were. Returns the version number. */
export function addVersion(itemId: string, files: { html: string; react?: string }, note: string, framework: string) {
  const { n } = db().prepare("SELECT COALESCE(MAX(version), 0) + 1 AS n FROM item_versions WHERE item_id = ?").get(itemId) as { n: number };
  const rel = `components/${itemId}/v${n}`;
  fs.mkdirSync(path.join(dataDir, rel), { recursive: true });
  fs.writeFileSync(path.join(dataDir, rel, "component.html"), files.html);
  if (files.react) fs.writeFileSync(path.join(dataDir, rel, "Component.tsx"), files.react);
  db()
    .prepare("INSERT INTO item_versions (id, item_id, version, framework, code_path, change_note) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), itemId, n, framework, rel, note);
  return n;
}

export type RecentWebsite = { url: string; title: string | null; last_seen: string };

export function getHomeData() {
  const d = db();
  const count = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return {
    components: count("SELECT COUNT(*) n FROM items WHERE kind = 'component'"),
    animations: count("SELECT COUNT(*) n FROM items WHERE kind = 'animation'"),
    collections: count("SELECT COUNT(*) n FROM collections"),
    websites: count("SELECT COUNT(*) n FROM websites"),
    recentWebsites: d
      .prepare("SELECT url, title, last_seen FROM websites ORDER BY last_seen DESC LIMIT 6")
      .all()
      .map((r) => ({ ...r })) as RecentWebsite[], // plain objects, so they can go to the browser
  };
}
