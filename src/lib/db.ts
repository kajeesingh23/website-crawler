import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.PDI_DATA_DIR ?? "data");

const g = globalThis as typeof globalThis & { __pdiDb?: DatabaseSync };

/** Opens data/database/library.db once per server process and applies any new migrations. */
export function db(): DatabaseSync {
  if (g.__pdiDb) return g.__pdiDb;
  fs.mkdirSync(path.join(dataDir, "database"), { recursive: true });
  const file = path.join(dataDir, "database", "library.db");
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
export function saveItem(item: { kind: "animation" | "component"; name: string; sourceUrl?: string; observed: unknown; png?: Buffer }) {
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
        "INSERT INTO items (id, kind, name, website_id, source_url, thumbnail, observed) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, item.kind, item.name, site?.id ?? null, item.sourceUrl ?? null, thumbnail, JSON.stringify(item.observed));
  } catch (e) {
    if (thumbnail) fs.rmSync(path.join(dataDir, thumbnail), { force: true }); // no orphan files
    throw e;
  }
  return id;
}

export type RecentWebsite ={ url: string; title: string | null; last_seen: string };

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
      .all() as RecentWebsite[],
  };
}
