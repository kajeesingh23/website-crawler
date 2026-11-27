// The app holds a personal library and can open websites, spend Claude credit and change files.
// It must only ever answer this computer and its own pages.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const EXTENSION = /^chrome-extension:\/\/[a-p]{32}$/;

export type RequestFacts = {
  method: string;
  path: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  secFetchMode: string | null;
};

/** What the app knows about the paired extension, for a request that says it comes from one. */
export type PairingFacts = {
  origin: string | null; // the paired extension's address; null while the code hasn't been used yet
  tokenValid: boolean; // the request carried the current pairing code
};

/** Null when the request may go through; otherwise the reason it's refused. */
export function refuse(r: RequestFacts, pairing?: PairingFacts | null): string | null {
  // Another device on the network, or a website pointing its own name at this computer (DNS rebinding).
  if (!r.host || !LOCAL_HOST.test(r.host)) return "This app only answers on this computer (open it at http://localhost).";
  // The paired Plax extension may save captures, and do nothing else. Any other extension is refused.
  if (r.origin && EXTENSION.test(r.origin)) {
    const firstUse = pairing?.origin === null && r.path === "/api/captures/pair";
    const ok = r.path.startsWith("/api/captures/") && pairing?.tokenValid && (pairing.origin === r.origin || firstUse);
    return ok ? null : "Only the paired Plax extension can do that. Pair it in Plax Settings.";
  }
  const api = r.path.startsWith("/api/");
  const changes = !["GET", "HEAD", "OPTIONS"].includes(r.method.toUpperCase());
  // A change must come from one of the app's own pages ("null" = a sandboxed frame, never trusted).
  if (changes && r.origin !== null) {
    let host: string | null = null;
    try {
      host = new URL(r.origin).host;
    } catch {}
    if (host?.toLowerCase() !== r.host.toLowerCase()) return "Requests from other websites aren't allowed.";
  }
  // Other websites can't read the library's data or pictures either, but you can still follow a link to the app.
  if (api && r.secFetchSite === "cross-site" && r.secFetchMode !== "navigate") return "Requests from other websites aren't allowed.";
  return null;
}
