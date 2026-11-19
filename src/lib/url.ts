/** Accepts "stripe.com" or a full link; only real web pages are allowed. */
export function normaliseUrl(raw: string): string {
  const text = raw.trim();
  if (!text) throw new Error("Paste a website link first.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error("That doesn't look like a website link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only website links (starting with http or https) can be explored.");
  return url.href;
}
