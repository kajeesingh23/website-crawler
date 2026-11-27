// Content and layout changes for a saved copy (the studio's second half: colours, type and spacing
// are in document.ts). The original is never changed: the result is saved as a new variation.

export type ContentEdits = {
  texts?: Record<number, string>; // nth piece of text inside the component → new text
  images?: Record<number, { src?: string; alt?: string; fit?: string }>;
};
export type Editable = { texts: string[]; images: { src: string; alt: string; fit: string }[] };

// The next two run in a browser (DOMParser). They must stay self-contained, like the in-page readers,
// so tests can run them in Chromium too.

/** The text and images a person can change, in page order. */
export function listEditable(html: string): Editable {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector(".pdi-root");
  if (!root) return { texts: [], images: [] };
  const texts: string[] = [];
  const walk = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) texts.push(n.textContent.trim());
  const images = [...root.querySelectorAll("img")].map((img) => ({ src: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") ?? "", fit: img.style.objectFit || "" }));
  return { texts: texts.slice(0, 60), images: images.slice(0, 30) };
}

/** The copy with new text and pictures. Only web addresses and image data are accepted as pictures. */
export function applyContent(html: string, edits: ContentEdits): string {
  const SAFE_SRC = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,)/i;
  const FITS = ["cover", "contain", "fill", "none", "scale-down"];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector(".pdi-root");
  if (!root) return html;
  let i = 0;
  const walk = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim()) continue;
    const next = edits.texts?.[i++];
    if (typeof next === "string") n.textContent = n.textContent.replace(n.textContent.trim(), next); // keeps surrounding spaces
  }
  [...root.querySelectorAll("img")].forEach((img, k) => {
    const e = edits.images?.[k];
    if (!e) return;
    if (e.src && SAFE_SRC.test(e.src)) {
      img.setAttribute("src", e.src);
      img.removeAttribute("srcset");
    }
    if (typeof e.alt === "string") img.setAttribute("alt", e.alt);
    if (e.fit && FITS.includes(e.fit)) img.style.objectFit = e.fit;
  });
  return `<!doctype html>\n${doc.documentElement.outerHTML}\n`;
}

// ---------- Size and layout (plain strings: works anywhere) ----------

export const RATIOS = { "": "Original", "1 / 1": "Square", "4 / 3": "4:3", "3 / 2": "3:2", "16 / 9": "16:9", "9 / 16": "Tall 9:16" } as const;

export type Layout = {
  width?: number; // px
  height?: number;
  ratio?: keyof typeof RATIOS;
  direction?: "row" | "column";
  gap?: number;
  align?: "flex-start" | "center" | "flex-end" | "stretch";
  justify?: "flex-start" | "center" | "flex-end" | "space-between";
};

const size = (n: unknown, max: number) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n <= max ? `${Math.round(n)}px` : undefined);
const oneOf = <T extends string>(v: unknown, ok: readonly T[]) => (ok.includes(v as T) ? (v as T) : undefined);

/** Only checked values become CSS, so nothing typed can inject other styles. */
export function layoutCss(l: Layout): string {
  const direction = oneOf(l.direction, ["row", "column"] as const);
  const decls: Record<string, string | undefined> = {
    width: size(l.width, 4000),
    "max-width": size(l.width, 4000) && "none",
    height: size(l.height, 4000),
    "aspect-ratio": oneOf(l.ratio, Object.keys(RATIOS).filter(Boolean)),
    display: direction && "flex",
    "flex-direction": direction,
    gap: typeof l.gap === "number" && l.gap >= 0 && l.gap <= 400 ? `calc(${Math.round(l.gap)}px * var(--pdi-space, 1))` : undefined,
    "align-items": oneOf(l.align, ["flex-start", "center", "flex-end", "stretch"] as const),
    "justify-content": oneOf(l.justify, ["flex-start", "center", "flex-end", "space-between"] as const),
  };
  if (decls.height || decls["aspect-ratio"]) decls.overflow = "hidden";
  const lines = Object.entries(decls)
    .filter(([, v]) => v)
    .map(([k, v]) => `    ${k}: ${v} !important;`);
  return lines.length ? `  .pdi-root {\n${lines.join("\n")}\n  }` : "";
}

export function applyLayout(html: string, l: Layout): string {
  const block = layoutCss(l);
  const cleaned = html.replace(/<style id="pdi-layout">[\s\S]*?<\/style>\n?/, "");
  return block ? cleaned.replace("</head>", `<style id="pdi-layout">\n${block}\n</style>\n</head>`) : cleaned;
}
