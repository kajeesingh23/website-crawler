-- Visual fingerprint of an item's screenshot (shape hash + colour histogram), for "looks similar".
-- Filled in lazily the first time similarity is asked for.
ALTER TABLE items ADD COLUMN fingerprint TEXT;
