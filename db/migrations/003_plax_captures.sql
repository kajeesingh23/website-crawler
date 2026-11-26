-- Plax: captures from the browser extension, grouped by visit, and variations as real links.
-- The migration runner backs up library.db before this runs.

-- One row per visit to a website from the extension; a visit can hold many captures.
CREATE TABLE IF NOT EXISTS analyses (
  id          TEXT PRIMARY KEY,
  website_id  TEXT REFERENCES websites(id) ON DELETE SET NULL,
  url         TEXT NOT NULL,
  title       TEXT,
  source      TEXT NOT NULL DEFAULT 'extension',   -- extension | app
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS analyses_website ON analyses(website_id);

ALTER TABLE items ADD COLUMN analysis_id TEXT REFERENCES analyses(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN variant_of  TEXT REFERENCES items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS items_analysis ON items(analysis_id);
CREATE INDEX IF NOT EXISTS items_variant ON items(variant_of);

-- Variations saved before this column existed kept their original's id inside the JSON.
UPDATE items SET variant_of = json_extract(inferred, '$.of')
WHERE json_extract(inferred, '$.source') = 'variation' AND json_extract(inferred, '$.of') IN (SELECT id FROM items);

-- Small app settings, such as the extension pairing (a hash of the token, never the token itself).
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
