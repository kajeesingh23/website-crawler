// Runs INSIDE the inspected website on the selected element (Playwright element.evaluate).
// Playwright sends it as source text, so it must be self-contained: no imports, no outer variables.
// Everything here is measured from the live page (observed), never guessed.

export type Colour = { hex: string; alpha: number }; // alpha 0–1

export type Asset = {
  kind: "image" | "svg" | "background" | "video";
  url?: string;
  svg?: string; // standalone SVG markup, for icons drawn inline in the page
  width: number;
  height: number;
  alt?: string;
};

export type Design = {
  appearance: {
    background: Colour | null; // null = transparent
    sitsOn: Colour | null; // the colour showing through when transparent
    text: Colour;
    border: { width: number; style: string; colour: Colour } | null;
    radius: string;
    shadow: string | null;
    gradient: string | null;
    opacity: number;
  };
  typography: {
    family: string;
    stack: string;
    size: number;
    weight: string;
    lineHeight: string;
    letterSpacing: string;
    align: string;
    decoration: string | null;
    transform: string | null;
    italic: boolean;
    webFont: boolean;
  };
  layout: {
    width: number;
    height: number;
    padding: number[]; // top, right, bottom, left
    margin: number[];
    border: number[];
    display: string;
    position: string;
    direction: string;
    justify: string;
    alignItems: string;
    wrap: string;
    gap: number; // space between items along the main direction
    columns: number;
    rows: number;
    minWidth: string;
    maxWidth: string;
  };
  palette: (Colour & { count: number; uses: string[] })[];
  fonts: { family: string; webFont: boolean }[];
  assets: Asset[];
};

export function extractDesign(el: Element): Design {
  // Any CSS colour (rgb, hsl, oklch, named…) → hex, by letting the browser paint one pixel.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const cache = new Map<string, Colour | null>();
  const colour = (css: string): Colour | null => {
    if (!css || css.startsWith("url")) return null;
    if (cache.has(css)) return cache.get(css)!;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const c = a === 0 ? null : { hex: `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`, alpha: Math.round((a / 255) * 100) / 100 };
    cache.set(css, c);
    return c;
  };
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  const firstFamily = (stack: string) => unquote(stack.split(",")[0]);
  const webFonts = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => unquote(f.family)));

  const cs = getComputedStyle(el);
  const SIDES = ["top", "right", "bottom", "left"];
  const sides = (pattern: string) => SIDES.map((s) => parseFloat(cs.getPropertyValue(pattern.replace("*", s))) || 0);

  // Appearance
  const borderWidths = sides("border-*-width");
  const widest = borderWidths.indexOf(Math.max(...borderWidths));
  const borderColour = colour(cs.getPropertyValue(`border-${SIDES[widest]}-color`));
  const borderStyle = cs.getPropertyValue(`border-${SIDES[widest]}-style`);
  const background = colour(cs.backgroundColor);
  let sitsOn: Colour | null = null;
  if (!background || background.alpha < 1) {
    for (let p = el.parentElement; p && !sitsOn; p = p.parentElement) sitsOn = colour(getComputedStyle(p).backgroundColor);
    sitsOn ??= { hex: "#ffffff", alpha: 1 }; // browsers paint white behind everything by default
  }

  // Walk the selection (capped so huge sections stay fast) for colours, fonts and assets.
  const palette = new Map<string, Colour & { count: number; uses: Set<string> }>();
  const add = (c: Colour | null, use: string) => {
    if (!c) return;
    const key = `${c.hex}/${c.alpha}`;
    const entry = palette.get(key) ?? { ...c, count: 0, uses: new Set<string>() };
    entry.count++;
    entry.uses.add(use);
    palette.set(key, entry);
  };
  const fonts = new Map<string, boolean>();
  const assets: Asset[] = [];
  const seen = new Set<string>();
  const addAsset = (key: string, a: Asset) => {
    if (assets.length >= 12 || seen.has(key) || (a.url && a.url.length > 100_000)) return;
    seen.add(key);
    assets.push(a);
  };

  for (const n of [el, ...el.querySelectorAll("*")].slice(0, 400)) {
    const r = n.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const s = getComputedStyle(n);
    if (s.visibility === "hidden") continue;
    const tag = n.tagName.toLowerCase();
    const size = { width: Math.round(r.width), height: Math.round(r.height) };

    if (n instanceof SVGElement) {
      if (tag !== "svg") {
        if (s.fill !== "none") add(colour(s.fill), "icon");
        if (s.stroke !== "none") add(colour(s.stroke), "icon");
      }
    } else {
      if ([...n.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim())) {
        add(colour(s.color), "text");
        const fam = firstFamily(s.fontFamily);
        fonts.set(fam, webFonts.has(fam));
      }
      add(colour(s.backgroundColor), "background");
      if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none") add(colour(s.borderTopColor), "border");
    }

    if (tag === "img") {
      const img = n as HTMLImageElement;
      const url = img.currentSrc || img.src;
      if (url) addAsset(url, { kind: "image", url, width: img.naturalWidth || size.width, height: img.naturalHeight || size.height, alt: img.alt || undefined });
    } else if (tag === "svg" && !(n.parentElement instanceof SVGElement)) {
      // Standalone copy: keep its size and resolve "currentColor" to the colour it shows on the page.
      const clone = n.cloneNode(true) as SVGElement;
      clone.setAttribute("width", String(size.width));
      clone.setAttribute("height", String(size.height));
      clone.style.color = s.color;
      const svg = new XMLSerializer().serializeToString(clone);
      if (svg.length < 30_000) addAsset(svg, { kind: "svg", svg, ...size });
    } else if (tag === "video") {
      const v = n as HTMLVideoElement;
      const url = v.currentSrc || v.src || v.poster;
      if (url) addAsset(url, { kind: "video", url, ...size });
    }
    for (const m of s.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) addAsset(m[1], { kind: "background", url: m[1], ...size });
  }
  if (!fonts.size) fonts.set(firstFamily(cs.fontFamily), webFonts.has(firstFamily(cs.fontFamily)));

  const column = cs.flexDirection.startsWith("column");
  const isGrid = cs.display.includes("grid");
  const tracks = (v: string) => (v.match(/[\d.]+px/g) ?? []).length;

  return {
    appearance: {
      background,
      sitsOn,
      text: colour(cs.color) ?? { hex: "#000000", alpha: 0 },
      border: borderWidths[widest] > 0 && borderStyle !== "none" && borderColour ? { width: borderWidths[widest], style: borderStyle, colour: borderColour } : null,
      radius: cs.borderRadius,
      shadow: cs.boxShadow === "none" ? null : cs.boxShadow,
      gradient: cs.backgroundImage.includes("gradient(") ? cs.backgroundImage : null,
      opacity: parseFloat(cs.opacity),
    },
    typography: {
      family: firstFamily(cs.fontFamily),
      stack: cs.fontFamily,
      size: parseFloat(cs.fontSize),
      weight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      align: cs.textAlign,
      decoration: cs.textDecorationLine === "none" ? null : cs.textDecorationLine,
      transform: cs.textTransform === "none" ? null : cs.textTransform,
      italic: cs.fontStyle !== "normal",
      webFont: webFonts.has(firstFamily(cs.fontFamily)),
    },
    layout: {
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
      padding: sides("padding-*"),
      margin: sides("margin-*"),
      border: borderWidths,
      display: cs.display,
      position: cs.position,
      direction: cs.flexDirection,
      justify: cs.justifyContent,
      alignItems: cs.alignItems,
      wrap: cs.flexWrap,
      gap: parseFloat(isGrid || !column ? cs.columnGap : cs.rowGap) || 0,
      columns: isGrid ? tracks(cs.gridTemplateColumns) : 0,
      rows: isGrid ? tracks(cs.gridTemplateRows) : 0,
      minWidth: cs.minWidth,
      maxWidth: cs.maxWidth,
    },
    palette: [...palette.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map(({ uses, ...c }) => ({ ...c, uses: [...uses] })),
    fonts: [...fonts].map(([family, webFont]) => ({ family, webFont })),
    assets,
  };
}
