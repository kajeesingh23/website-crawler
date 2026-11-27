// Build Prompt: a ready-to-paste brief for Claude Code, Cursor, v0 or any AI tool, written from what
// was measured on the page. Deterministic: the same capture always gives the same prompt, no AI needed.
import type { Colour, Design } from "../inspector/extract.ts";
import type { Motion } from "../inspector/session.ts";
import type { SizeResult } from "../inspector/responsive.ts";
import { describeLayout, duration, easingName, PROP_NAMES } from "../inspector/describe.ts";
import { designTokens, splitDocument } from "./code.ts";

export const MODES = {
  pixel: "Pixel-accurate recreation",
  editable: "Editable component",
  tokens: "Design-system tokens",
  animation: "Animation",
  responsive: "Responsive layout",
} as const;
export type Mode = keyof typeof MODES;

export type PromptInput = {
  name: string;
  label: string; // "Card", "Button"…
  url?: string;
  text?: string;
  width: number;
  height: number;
  design: Design | null;
  motion?: Motion | null;
  motionTested?: boolean; // hover, focus and scroll-in were tried (Analyse Website); the extension can't
  html?: string; // exact copy
  sizes?: SizeResult[]; // measured at phone, tablet and desktop widths
};

const MAX_HTML = 24_000; // keeps prompts within what AI tools accept comfortably
const colour = (c: Colour | null) => (c ? `${c.hex}${c.alpha < 1 ? ` at ${Math.round(c.alpha * 100)}% opacity` : ""}` : "transparent");
const px = (n: number) => `${Math.round(n * 10) / 10}px`;
const box = (v: number[]) => (v.every((n) => n === v[0]) ? px(v[0]) : v.map(px).join(" "));
const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

function measurements(i: PromptInput): string {
  const d = i.design;
  if (!d) return `- Size: ${i.width} × ${i.height}px\n- The design couldn't be read; use the screenshot or reference HTML.`;
  const a = d.appearance;
  const t = d.typography;
  const l = d.layout;
  return list([
    `Size: ${px(l.width)} wide × ${px(l.height)} tall`,
    `Background: ${colour(a.background)}${!a.background && a.sitsOn ? ` (sits on ${colour(a.sitsOn)})` : ""}${a.gradient ? `; gradient ${a.gradient}` : ""}`,
    `Text: ${colour(a.text)}; ${t.stack}; ${px(t.size)}; weight ${t.weight}; line height ${t.lineHeight}; letter spacing ${t.letterSpacing}${t.italic ? "; italic" : ""}${t.transform ? `; ${t.transform}` : ""}`,
    `Layout: ${describeLayout(l)} (display ${l.display}${l.display.includes("flex") ? `, ${l.direction}, justify ${l.justify}, align ${l.alignItems}` : ""}${l.gap ? `, gap ${px(l.gap)}` : ""})`,
    `Padding: ${box(l.padding)}`,
    `Corner radius: ${a.radius}`,
    ...(a.border ? [`Border: ${a.border.width}px ${a.border.style} ${colour(a.border.colour)}`] : []),
    `Shadow: ${a.shadow ?? "none"}`,
    ...(a.opacity < 1 ? [`Opacity: ${a.opacity}`] : []),
    ...(d.palette.length ? [`Colours used inside: ${d.palette.slice(0, 10).map((c) => `${c.hex} (${c.uses.join(", ")})`).join("; ")}`] : []),
    ...(d.fonts.length ? [`Fonts: ${d.fonts.map((f) => `${f.family}${f.webFont ? " (web font)" : ""}`).join(", ")}`] : []),
    ...(d.assets.length ? [`Images and icons: ${d.assets.slice(0, 8).map((x) => `${x.kind} ${x.width}×${x.height}${x.url ? ` ${x.url}` : ""}${x.alt ? ` "${x.alt}"` : ""}`).join("; ")}`] : []),
  ]);
}

function motionFacts(i: PromptInput): string {
  const m = i.motion;
  const lines: string[] = [];
  for (const a of m?.running ?? [])
    lines.push(`Runs on its own: "${a.name}" on ${a.part}, ${duration(a.duration)}${a.delay ? ` after ${duration(a.delay)}` : ""}, ${a.easing} (${easingName(a.easing).toLowerCase()}), ${a.iterations === "infinite" ? "loops forever" : `${a.iterations}×`}, direction ${a.direction}. Keyframes: ${JSON.stringify(a.keyframes)}`);
  for (const t of m?.transitions ?? []) lines.push(`Smooth change set up on ${t.part}: ${PROP_NAMES[t.prop] ?? t.prop} over ${duration(t.duration)}${t.delay ? ` after ${duration(t.delay)}` : ""}, ${t.easing}`);
  const moment = (label: string, x?: { changes: { part: string; prop: string; from: string; to: string }[] } | null) => {
    for (const c of x?.changes ?? []) lines.push(`On ${label}, ${c.part}: ${PROP_NAMES[c.prop] ?? c.prop} goes from ${c.from} to ${c.to}`);
  };
  moment("hover", m?.hover);
  moment("keyboard focus", m?.focus);
  moment("scrolling into view", m?.scroll);
  if (!lines.length) lines.push("No motion was observed.");
  if (!i.motionTested) lines.push("Hover, focus and scroll-in weren't tested for this capture; if it should react to them, choose something subtle and say what you chose.");
  return list(lines);
}

function reference(i: PromptInput): string {
  if (!i.html) return "";
  const { body, root } = splitDocument(i.html);
  const rootCss = Object.entries(root).map(([p, v]) => `${p}: ${v};`).join(" ");
  const html = body.length > MAX_HTML ? `${body.slice(0, MAX_HTML)}\n<!-- … cut here: the copy is longer than fits in a prompt -->` : body;
  return `\n## Reference HTML (exact copy, styles inline)\nThe outer element (class "pdi-root") has: ${rootCss}\nValues like calc(16px * var(--pdi-space, 1)) are adjustable copies of the measured value (16px here).\n\n\`\`\`html\n${html}\n\`\`\`\n`;
}

const source = (i: PromptInput) => `${i.label}${i.url ? ` from ${i.url}` : ""}`;
const RULES = `- Treat every value above as measured on the live page. Don't round or "improve" them unless asked.
- If something wasn't measured, choose sensibly and list your guesses at the end.
- Don't copy the original's logos, brand names or written content into production work without permission.`;

/** The prompt for one mode. */
export function buildPrompt(i: PromptInput, mode: Mode): string {
  const title = `# ${MODES[mode]}: ${i.name}`;
  const what = `Source: ${source(i)}${i.text ? `\nVisible text: "${i.text.slice(0, 200)}"` : ""}`;
  switch (mode) {
    case "pixel":
      return `${title}

Recreate this ${i.label.toLowerCase()} so it looks exactly like the original, as a self-contained component.

${what}

## Measured design
${measurements(i)}

## Motion
${motionFacts(i)}
${reference(i)}
## Rules
${RULES}
- Match sizes, spacing, colours and type exactly. Reproduce observed hover states and animations in CSS.`;
    case "editable":
      return `${title}

Build a reusable, editable ${i.label.toLowerCase()} component that keeps the look of the original.

${what}

## Look to keep
${measurements(i)}

## Make it editable
- Pass every piece of text, image (src and alt) and link in as props, with the original content as example defaults.
- Put colours, spacing, corner radius and type into CSS variables or design tokens, not hard-coded values.
- Use semantic HTML, visible focus styles, alt text and labels; it must work with a keyboard.
- Let it stretch to its container's width instead of a fixed width, keeping the measured proportions.

## Motion
${motionFacts(i)}
${reference(i)}
## Rules
${RULES}`;
    case "tokens":
      return `${title}

Turn these measured values into a small design-token set, then use the tokens to style a ${i.label.toLowerCase()} like the original.

${what}

## Tokens (W3C Design Tokens format, measured)
\`\`\`json
${JSON.stringify(designTokens(i.design, i.motion), null, 2)}
\`\`\`

## Deliver
1. The tokens as CSS custom properties (and a Tailwind theme extension if the project uses Tailwind).
2. Sensible names based on how each value is used (for example color-surface, color-text, space-2), with the measured values kept exactly.
3. The component, using only the tokens.

## Rules
${RULES}`;
    case "animation":
      return `${title}

Recreate the motion of this ${i.label.toLowerCase()}: the same timing, easing and movement.

${what}

## Observed motion
${motionFacts(i)}

## Element at rest
${measurements(i)}

## Rules
${RULES}
- Prefer CSS transitions and keyframes; use a motion library only for what CSS can't express, and say so.
- Respect prefers-reduced-motion: reduce or remove movement for people who ask for less.`;
    case "responsive": {
      const sizes = (i.sizes ?? []).filter((s) => s.found);
      const measured = sizes.length
        ? list(sizes.map((s) => (s.hidden ? `${s.name} (${s.width}px): hidden at this width` : `${s.name} (${s.width}px): ${[s.size, s.layout, s.padding && `padding ${s.padding}`, s.fontSize && `text ${s.fontSize}px`].filter(Boolean).join("; ")}`)))
        : `- Measured only at one width: ${px(i.design?.layout.width ?? i.width)} wide. Adapt it sensibly for the other sizes.`;
      return `${title}

Make this ${i.label.toLowerCase()} work well on phone (375px), tablet (768px) and desktop (1280px) screens.

${what}

## As measured on the page
${measurements(i)}

## At different screen widths
${measured}

## Deliver
- Mobile-first CSS with breakpoints at 768px and 1280px (or the project's own).
- Keep the measured desktop look; on smaller screens stack, wrap or shrink where needed, keeping text readable (at least 16px body text) and tap targets at least 44px.
${reference(i)}
## Rules
${RULES}`;
    }
  }
}
