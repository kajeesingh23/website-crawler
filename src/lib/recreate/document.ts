import type { Colour, Design } from "../inspector/extract.ts";
import type { Snapshot } from "../inspector/snapshot.ts";
import type { Motion } from "../inspector/session.ts";
import { describeLayout } from "../inspector/describe.ts";

const css = (o: Record<string, string | number>) =>
  Object.entries(o)
    .map(([p, v]) => `    ${p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`)
    .join("\n");

/** A standalone page around the frozen copy, adding what inline styles can't hold: hover and keyframes. */
export function buildDocument(snapshot: Snapshot, sitsOn: Colour | null, motion?: Motion): string {
  const hover = (motion?.hover?.changes ?? []).filter((c) => c.part === "Whole element");
  const keyframes = [...(motion?.running ?? []), ...(motion?.hover?.animations ?? []), ...(motion?.scroll?.animations ?? [])]
    .filter((a) => a.kind === "css-animation")
    .filter((a, i, all) => all.findIndex((b) => b.name === a.name) === i)
    .map((a) => {
      const frames = a.keyframes
        .map(({ offset, easing, ...props }) =>
          `    ${Math.round(Number(offset) * 100)}% {\n${css({ ...props, ...(easing ? { "animation-timing-function": easing } : {}) }).replace(/^/gm, "  ")}\n    }`,
        )
        .join("\n");
      return `  @keyframes ${a.name} {\n${frames}\n  }`;
    });
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Component</title>
<style>
  body {
    margin: 0;
    padding: 40px;
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${sitsOn?.hex ?? "#ffffff"};
  }
  .pdi-root {
${css(snapshot.root)}
  }
${hover.length ? `  .pdi-root:hover {\n${css(Object.fromEntries(hover.map((c) => [c.prop, c.to])))}\n  }\n` : ""}${keyframes.join("\n")}
</style>
</head>
<body>
${snapshot.body}
</body>
</html>
`;
}

// ---------- Studio settings ----------

export const FONTS: Record<string, string> = {
  "System sans": "ui-sans-serif, system-ui, -apple-system, sans-serif",
  "Editorial serif": "Georgia, 'Times New Roman', serif",
  Rounded: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
  Mono: "ui-monospace, 'SF Mono', Menlo, monospace",
};

export const SHADOWS: Record<string, string> = {
  None: "none",
  Soft: "0 4px 16px rgba(0, 0, 0, 0.08)",
  Lifted: "0 12px 32px rgba(0, 0, 0, 0.16)",
  Strong: "0 20px 48px rgba(0, 0, 0, 0.28)",
};

export type Overrides = {
  bg?: string;
  text?: string;
  font?: string; // a key of FONTS
  shadow?: string; // a key of SHADOWS
  typeScale?: number;
  space?: number;
  radiusScale?: number;
  speed?: number; // multiplies durations: 2 = twice as slow
};

const clamp = (n: unknown, lo: number, hi: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined);
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);

/** Only known, checked values become CSS, so nothing typed or sent can inject other styles. */
export function overridesCss(o: Overrides): string {
  const vars: Record<string, string | number | undefined> = {
    "--pdi-bg": hex(o.bg),
    "--pdi-text": hex(o.text),
    "--pdi-font": o.font ? FONTS[o.font] : undefined,
    "--pdi-shadow": o.shadow ? SHADOWS[o.shadow] : undefined,
    "--pdi-type-scale": clamp(o.typeScale, 0.5, 2),
    "--pdi-space": clamp(o.space, 0, 3),
    "--pdi-radius-scale": clamp(o.radiusScale, 0, 4),
    "--pdi-speed": clamp(o.speed, 0.1, 5),
  };
  const lines = Object.entries(vars)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `    ${k}: ${v};`);
  return lines.length ? `  :root {\n${lines.join("\n")}\n  }` : "";
}

export function applyOverrides(html: string, o: Overrides): string {
  const block = overridesCss(o);
  const cleaned = html.replace(/<style id="pdi-overrides">[\s\S]*?<\/style>\n?/, "");
  return block ? cleaned.replace("</head>", `<style id="pdi-overrides">\n${block}\n</style>\n</head>`) : cleaned;
}

// ---------- Original vs recreated ----------

export type CompareRow = { label: string; original: string; recreated: string; match: boolean };

const colourText = (c: Colour | null) => (c ? `${c.hex}${c.alpha < 1 ? ` ${Math.round(c.alpha * 100)}%` : ""}` : "transparent");
const sameColour = (a: Colour | null, b: Colour | null) => (!a && !b) || (!!a && !!b && a.hex === b.hex && Math.abs(a.alpha - b.alpha) <= 0.02);
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, Math.abs(a) * 0.02);

/** Measured, not judged: both sides come from the same reader running on real rendered pages. */
export function compareDesigns(o: Design, r: Design): CompareRow[] {
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  const box = (v: number[]) => v.map((n) => Math.round(n)).join(" ");
  return [
    { label: "Width", original: px(o.layout.width), recreated: px(r.layout.width), match: near(o.layout.width, r.layout.width) },
    { label: "Height", original: px(o.layout.height), recreated: px(r.layout.height), match: near(o.layout.height, r.layout.height) },
    {
      label: "Background",
      original: colourText(o.appearance.background),
      recreated: colourText(r.appearance.background),
      match: sameColour(o.appearance.background, r.appearance.background),
    },
    { label: "Text colour", original: colourText(o.appearance.text), recreated: colourText(r.appearance.text), match: sameColour(o.appearance.text, r.appearance.text) },
    { label: "Font", original: o.typography.family, recreated: r.typography.family, match: o.typography.family === r.typography.family },
    { label: "Font size", original: px(o.typography.size), recreated: px(r.typography.size), match: near(o.typography.size, r.typography.size) },
    { label: "Weight", original: o.typography.weight, recreated: r.typography.weight, match: o.typography.weight === r.typography.weight },
    { label: "Line height", original: o.typography.lineHeight, recreated: r.typography.lineHeight, match: o.typography.lineHeight === r.typography.lineHeight },
    { label: "Letter spacing", original: o.typography.letterSpacing, recreated: r.typography.letterSpacing, match: o.typography.letterSpacing === r.typography.letterSpacing },
    { label: "Inside space", original: box(o.layout.padding), recreated: box(r.layout.padding), match: o.layout.padding.every((v, i) => near(v, r.layout.padding[i])) },
    { label: "Corners", original: o.appearance.radius, recreated: r.appearance.radius, match: o.appearance.radius === r.appearance.radius },
    { label: "Shadow", original: o.appearance.shadow ?? "None", recreated: r.appearance.shadow ?? "None", match: o.appearance.shadow === r.appearance.shadow },
    { label: "Layout", original: describeLayout(o.layout), recreated: describeLayout(r.layout), match: describeLayout(o.layout) === describeLayout(r.layout) },
  ];
}

// ---------- Claude's reply ----------

export type Recreation = { html: string; react?: string; notes?: string; confidence?: number; unknowns: string[] };

/** Reads the tagged sections of Claude's reply; null when the page itself is missing. */
export function parseReply(text: string): Recreation | null {
  const tag = (name: string) => text.match(new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*</${name}>`))?.[1];
  const html = tag("component_html");
  if (!html || !/<\/html>/i.test(html)) return null;
  const confidence = Number(tag("confidence"));
  return {
    html,
    react: tag("component_react"),
    notes: tag("notes"),
    confidence: Number.isFinite(confidence) ? Math.min(100, Math.max(0, confidence)) : undefined,
    unknowns: (tag("unknowns") ?? "")
      .split("\n")
      .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean),
  };
}

/** Width and height from a PNG's header, to avoid sending images the API can't take. */
export const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
