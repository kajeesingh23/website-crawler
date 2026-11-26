import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";

// Pairing lets exactly one Plax extension save to this app. The app shows a one-time code; the
// extension sends it with every request. Only a hash of the code is stored. The first request with
// the code ties the pairing to that extension's address (chrome-extension://<id>); after that,
// no other extension can use the code.

export type Pairing = { hash: string; origin: string | null; createdAt: string };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function getPairing(): Pairing | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'pairing'").get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as Pairing) : null;
}

const store = (p: Pairing | null) =>
  p
    ? db().prepare("INSERT INTO settings (key, value) VALUES ('pairing', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(p))
    : db().prepare("DELETE FROM settings WHERE key = 'pairing'").run();

/** A new code, replacing any earlier pairing. Returned once, never stored. */
export function newPairing(): string {
  const token = `plax-${randomBytes(18).toString("base64url")}`;
  store({ hash: hash(token), origin: null, createdAt: new Date().toISOString() });
  return token;
}

export const unpair = () => store(null);

export function tokenMatches(token: string | null, p: Pairing | null = getPairing()): boolean {
  if (!token || !p || token.length > 200) return false;
  return timingSafeEqual(Buffer.from(hash(token), "hex"), Buffer.from(p.hash, "hex"));
}

/** Ties the pairing to the extension that first used the code. */
export function bindOrigin(origin: string) {
  const p = getPairing();
  if (p && !p.origin) store({ ...p, origin });
}
