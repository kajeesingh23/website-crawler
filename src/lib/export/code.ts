// Code exports built from the exact copy and the measurements. Pure functions: they run in the app,
// in the browser and in the extension, with no AI and no network.
import type { Design } from "../inspector/extract.ts";
import type { Motion } from "../inspector/session.ts";

/** The studio's adjustable values back to plain CSS: var(--pdi-x, V) → V, calc(Npx * var(--pdi-y, 1)) → Npx. */
export function plainCss(value: string): string {
  let v = value;
  for (let i = 0; i < 4 && v.includes("var(--pdi-"); i++)
    v = v.replace(/calc\(([^()]*?) \* var\(--pdi-[a-z-]+, 1\)\)/g, "$1").replace(/var\(--pdi-[a-z-]+, ((?:[^()]|\([^()]*\))*)\)/g, "$1");
  return v;
}

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** The copied element alone (what's inside <body>), and the root's own styles from the <style> block. */
export function splitDocument(html: string) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1].trim() ?? html;
  const rootBlock = html.match(/\.pdi-root \{\n([\s\S]*?)\n {2}\}/)?.[1] ?? "";
  const root = Object.fromEntries(
    rootBlock
      .split("\n")
      .map((l) => l.trim().replace(/;$/, ""))
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]),
  );
  const extra = /\.pdi-root:hover|@keyframes/.test(html);
  return { body, root, extra };
}

// ---------- Tailwind ----------

const PREFIX: Record<string, string> = {
  "padding-top": "pt", "padding-right": "pr", "padding-bottom": "pb", "padding-left": "pl",
  "margin-top": "mt", "margin-right": "mr", "margin-bottom": "mb", "margin-left": "ml",
  width: "w", height: "h", "min-width": "min-w", "max-width": "max-w", "min-height": "min-h",
  top: "top", right: "right", bottom: "bottom", left: "left", "z-index": "z",
  "row-gap": "gap-y", "column-gap": "gap-x", "font-size": "text", "line-height": "leading", "letter-spacing": "tracking",
  color: "text", "background-color": "bg", opacity: "opacity", "font-weight": "font",
  "border-top-left-radius": "rounded-tl", "border-top-right-radius": "rounded-tr",
  "border-bottom-right-radius": "rounded-br", "border-bottom-left-radius": "rounded-bl",
  "box-shadow": "shadow", "grid-template-columns": "grid-cols", "grid-template-rows": "grid-rows",
  "flex-grow": "grow", "flex-shrink": "shrink", "flex-basis": "basis", order: "order",
};
const KEYWORD: Record<string, Record<string, string>> = {
  display: { flex: "flex", grid: "grid", block: "block", "inline-block": "inline-block", inline: "inline", "inline-flex": "inline-flex", "inline-grid": "inline-grid", none: "hidden" },
  position: { relative: "relative", absolute: "absolute", fixed: "fixed", sticky: "sticky" },
  "flex-direction": { column: "flex-col", "row-reverse": "flex-row-reverse", "column-reverse": "flex-col-reverse" },
  "flex-wrap": { wrap: "flex-wrap", "wrap-reverse": "flex-wrap-reverse" },
  "justify-content": { center: "justify-center", "space-between": "justify-between", "space-around": "justify-around", "space-evenly": "justify-evenly", "flex-end": "justify-end", end: "justify-end", "flex-start": "justify-start" },
  "align-items": { center: "items-center", "flex-start": "items-start", start: "items-start", "flex-end": "items-end", end: "items-end", baseline: "items-baseline" },
  "align-self": { center: "self-center", "flex-start": "self-start", "flex-end": "self-end" },
  "text-align": { center: "text-center", right: "text-right", left: "text-left", justify: "text-justify", end: "text-end" },
  "text-transform": { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize" },
  "font-style": { italic: "italic" },
  "text-decoration-line": { underline: "underline", "line-through": "line-through", overline: "overline" },
  "white-space": { nowrap: "whitespace-nowrap", pre: "whitespace-pre", "pre-wrap": "whitespace-pre-wrap" },
  "overflow-x": { hidden: "overflow-x-hidden", auto: "overflow-x-auto", scroll: "overflow-x-scroll" },
  "overflow-y": { hidden: "overflow-y-hidden", auto: "overflow-y-auto", scroll: "overflow-y-scroll" },
  "object-fit": { cover: "object-cover", contain: "object-contain", fill: "object-fill", none: "object-none" },
  "box-sizing": { "border-box": "box-border" },
  cursor: { pointer: "cursor-pointer" },
};
// Arbitrary values can't hold spaces: Tailwind reads "_" as a space.
const arb = (v: string) => v.trim().replace(/['"]/g, "").replace(/,\s+/g, ",").replace(/\s+/g, "_");

/** One CSS declaration as a Tailwind class (an arbitrary value or property when there's no utility). */
export function twClass(prop: string, raw: string): string {
  const value = plainCss(unescape(raw)).trim();
  const keyword = KEYWORD[prop]?.[value];
  if (keyword) return keyword;
  if (prop === "font-family") return `font-[${arb(value)}]`;
  if (PREFIX[prop]) return `${PREFIX[prop]}-[${arb(value)}]`;
  return `[${prop}:${arb(value)}]`;
}

const toClasses = (decls: [string, string][]) => decls.map(([p, v]) => twClass(p, v)).join(" ");
const parseStyle = (style: string) =>
  style
    .split(/;(?![^(]*\))/)
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as [string, string]);

/** The exact copy with every inline style turned into Tailwind classes. */
export function toTailwind(html: string): string {
  const { body, root, extra } = splitDocument(html);
  const out = body
    .replace(/ class="pdi-root"/, ` class="${toClasses(Object.entries(root))}"`)
    .replace(/ style="([^"]*)"/g, (_, style: string) => ` class="${toClasses(parseStyle(unescape(style)))}"`);
  const note = extra ? "\n<!-- Hover effects and animations aren't Tailwind classes: copy them from the HTML/CSS export. -->" : "";
  return `<!-- Tailwind version of the exact copy. Values are the measured ones, as arbitrary values. -->${note}\n${out}\n`;
}

// ---------- Design tokens (W3C Design Tokens format) ----------

type Token = { $type: string; $value: unknown; $description?: string };

export function designTokens(design: Design | null, motion?: Motion | null): Record<string, Record<string, Token>> {
  const tokens: Record<string, Record<string, Token>> = {};
  const put = (group: string, name: string, t: Token) => ((tokens[group] ??= {})[name] = t);
  if (design) {
    const a = design.appearance;
    const bg = a.background ?? a.sitsOn;
    if (bg) put("color", "background", { $type: "color", $value: bg.hex });
    put("color", "text", { $type: "color", $value: a.text.hex });
    if (a.border) put("color", "border", { $type: "color", $value: a.border.colour.hex });
    design.palette.slice(0, 12).forEach((c, i) => put("color", `palette-${i + 1}`, { $type: "color", $value: c.hex, $description: `Used for ${c.uses.join(", ")}` }));
    const t = design.typography;
    put("font", "family", { $type: "fontFamily", $value: t.stack.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "")) });
    put("font", "size", { $type: "dimension", $value: `${t.size}px` });
    put("font", "weight", { $type: "fontWeight", $value: Number(t.weight) || t.weight });
    put("font", "line-height", { $type: "dimension", $value: t.lineHeight });
    if (t.letterSpacing !== "normal") put("font", "letter-spacing", { $type: "dimension", $value: t.letterSpacing });
    const space = [...new Set([...design.layout.padding, design.layout.gap].filter((n) => n > 0).map((n) => Math.round(n)))].sort((x, y) => x - y);
    space.forEach((n, i) => put("space", `${i + 1}`, { $type: "dimension", $value: `${n}px` }));
    if (a.radius && a.radius !== "0px") put("radius", "default", { $type: "dimension", $value: a.radius });
    if (a.shadow) put("shadow", "default", { $type: "shadow", $value: a.shadow });
  }
  const timings = [...(motion?.transitions ?? []).map((x) => [x.duration, x.easing] as const), ...(motion?.running ?? []).map((x) => [x.duration, x.easing] as const)];
  [...new Set(timings.map(([d]) => Math.round(d)))].filter((d) => d > 0).forEach((d, i) => put("duration", `${i + 1}`, { $type: "duration", $value: `${d}ms` }));
  [...new Set(timings.map(([, e]) => e))].forEach((e, i) => put("easing", `${i + 1}`, { $type: "cubicBezier", $value: e }));
  return tokens;
}

// ---------- React ----------

export const componentName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
    .replace(/^[^A-Za-z]+/, "") || "Component";

const literal = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

/** The exact copy inside a React component, without AI. Clearly labelled as such. */
export function reactWrapper(html: string, name: string): string {
  const css = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1].replace(/ {2}body \{[\s\S]*?\n {2}\}\n/, "").trim() ?? "";
  const { body } = splitDocument(html);
  const fn = componentName(name);
  return `// Made without AI: the exact copy (HTML and CSS) wrapped in a React component.
// It looks right, but it isn't idiomatic React. For a clean rewrite, connect Claude in Plax
// and use "Convert to React with Claude" on the saved item.

const css = \`
${literal(css)}
\`;

const markup = \`${literal(body)}\`;

export default function ${fn}() {
  return (
    <>
      <style>{css}</style>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
`;
}
