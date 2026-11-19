// The app holds a personal library and can open websites, spend Claude credit and change files.
// It must only ever answer this computer and its own pages.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export type RequestFacts = {
  method: string;
  path: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  secFetchMode: string | null;
};

/** Null when the request may go through; otherwise the reason it's refused. */
export function refuse(r: RequestFacts): string | null {
  // Another device on the network, or a website pointing its own name at this computer (DNS rebinding).
  if (!r.host || !LOCAL_HOST.test(r.host)) return "This app only answers on this computer (open it at http://localhost).";
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
