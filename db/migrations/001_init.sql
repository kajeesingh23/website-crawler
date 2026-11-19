-- Personal Design Intelligence — initial schema (SQLite via node:sqlite)
-- Files (screenshots, assets, code) live under PDI_DATA_DIR; rows store relative paths.

CREATE TABLE IF NOT EXISTS websites (
  id           TEXT PRIMARY KEY,
  url          TEXT NOT NULL UNIQUE,
  title        TEXT,
  first_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per saved thing: component, animation, asset, typography, layout, section, design system.
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('component','animation','asset','typography','layout','section','design_system')),
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  notes         TEXT,
  website_id    TEXT REFERENCES websites(id) ON DELETE SET NULL,
  source_url    TEXT,                          -- exact page the item came from (attribution)
  thumbnail     TEXT,                          -- relative path under data/screenshots
  favourite     INTEGER NOT NULL DEFAULT 0,
  board_order   REAL,                          -- drag-and-drop position on My Board
  -- "observed" = measured from the live page; "inferred" = reconstructed by AI. Never mixed.
  observed      TEXT NOT NULL DEFAULT '{}',    -- JSON: selector, structure, computed styles, tokens, animations, assets
  inferred      TEXT NOT NULL DEFAULT '{}',    -- JSON: AI reconstruction notes, confidence, gaps
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS items_kind ON items(kind);
CREATE INDEX IF NOT EXISTS items_website ON items(website_id);

-- Generated code + customisations; every save is a new version, nothing is overwritten.
CREATE TABLE IF NOT EXISTS item_versions (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  framework   TEXT,                            -- html-css | react | tailwind | framer-motion | gsap | svg
  code_path   TEXT,                            -- relative path under data/components
  change_note TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (item_id, version)
);

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Many-to-many: an item can sit in many collections without duplicating files.
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position      REAL,
  PRIMARY KEY (collection_id, item_id)
);

-- Full-text search over names, descriptions, notes and tags.
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  name, description, notes, tags, category,
  content='items', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, name, description, notes, tags, category)
  VALUES (new.rowid, new.name, new.description, new.notes, new.tags, new.category);
END;
CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, name, description, notes, tags, category)
  VALUES ('delete', old.rowid, old.name, old.description, old.notes, old.tags, old.category);
END;
CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, name, description, notes, tags, category)
  VALUES ('delete', old.rowid, old.name, old.description, old.notes, old.tags, old.category);
  INSERT INTO items_fts(rowid, name, description, notes, tags, category)
  VALUES (new.rowid, new.name, new.description, new.notes, new.tags, new.category);
END;
