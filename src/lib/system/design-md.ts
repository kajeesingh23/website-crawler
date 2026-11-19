import type { SystemColour, SystemData } from "./extract-system.ts";
import { duration, easingName, weightName } from "../inspector/describe.ts";

/** Which items of each list you chose to keep, by position. Missing section = keep everything. */
export type Selection = Partial<Record<Section, number[]>>;
export const SECTIONS = ["colours", "type", "fonts", "spacing", "radii", "shadows", "breakpoints", "transitions", "examples"] as const;
export type Section = (typeof SECTIONS)[number];

export function filterSystem(system: SystemData, sel: Selection): SystemData {
  const keep = <T,>(list: T[], section: Section) => (sel[section] ? list.filter((_, i) => sel[section]!.includes(i)) : list);
  return {
    ...system,
    colours: keep(system.colours, "colours"),
    type: keep(system.type, "type"),
    fonts: keep(system.fonts, "fonts"),
    spacing: keep(system.spacing, "spacing"),
    radii: keep(system.radii, "radii"),
    shadows: keep(system.shadows, "shadows"),
    breakpoints: keep(system.breakpoints, "breakpoints"),
    transitions: keep(system.transitions, "transitions"),
    examples: keep(system.examples, "examples"),
  };
}

const saturation = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

/** Likely roles, worked out from how often and where each colour is used. A guess, and labelled as one. */
export function guessRoles(colours: SystemColour[]) {
  const first = (use: string, skip: string[] = []) => colours.find((c) => c.uses.includes(use) && !skip.includes(c.hex));
  const background = first("background");
  const text = first("text", background ? [background.hex] : []);
  const accent = colours.find((c) => saturation(c.hex) > 0.35 && c.alpha === 1 && c.hex !== background?.hex && c.hex !== text?.hex);
  return { background: background?.hex, text: text?.hex, accent: accent?.hex };
}

const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const table = (head: string[], rows: (string | number)[][]) =>
  rows.length ? [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n") : "_None found._";

/** A readable design reference that anyone (or Claude) can use in another project. */
export function designMd(s: SystemData, capturedAt = new Date()): string {
  const roles = guessRoles(s.colours);
  const host = new URL(s.url).hostname.replace(/^www\./, "");
  const tokens = [
    ...s.colours.slice(0, 12).map((c, i) => `  --color-${i + 1}: ${c.hex}${c.alpha < 1 ? ` /* ${Math.round(c.alpha * 100)}% */` : ""};`),
    ...s.type.slice(0, 8).map((t, i) => `  --text-${i + 1}: ${t.weight} ${t.size}px/${t.lineHeight === "normal" ? "normal" : t.lineHeight} "${t.family}";`),
    ...s.spacing.map((x) => `  --space-${x.value}: ${x.value}px;`),
    ...s.radii.map((r, i) => `  --radius-${i + 1}: ${r.value};`),
    ...s.shadows.map((x, i) => `  --shadow-${i + 1}: ${x.value};`),
  ];
  return `# Design system: ${s.title || host}

Source: ${s.url}
Captured: ${capturedAt.toISOString().slice(0, 10)}

An independent reference collected from what the website renders. It is not merged into any other design system.
Everything below was measured, except lines marked **(guess)**.

## Colour

${roles.background || roles.text || roles.accent ? `Likely roles **(guess)**: ${[roles.background && `background ${roles.background}`, roles.text && `text ${roles.text}`, roles.accent && `accent ${roles.accent}`].filter(Boolean).join(", ")}.\n\n` : ""}${table(
    ["Colour", "Opacity", "Used for", "Times seen"],
    s.colours.map((c) => [`\`${c.hex}\``, `${Math.round(c.alpha * 100)}%`, c.uses.join(", "), c.count]),
  )}

## Typography

Fonts: ${s.fonts.map((f) => `${f.family}${f.webFont ? " (web font)" : ""}`).join(", ") || "—"}

${table(
    ["Size", "Weight", "Line height", "Letter spacing", "Font", "Used on", "Example"],
    s.type.map((t) => [`${t.size}px`, weightName(t.weight), t.lineHeight, t.letterSpacing, t.family, t.tags.join(", "), `“${t.sample.replace(/\|/g, "/")}”`]),
  )}

## Spacing

${s.spacing.length ? s.spacing.map((x) => `${x.value}px`).join(" · ") : "_None found._"}

## Corners

${s.radii.length ? s.radii.map((r) => `\`${r.value}\``).join(" · ") : "Square corners throughout."}

## Shadows

${s.shadows.length ? s.shadows.map((x) => `- \`${x.value}\``).join("\n") : "_None found._"}

## Layout

- ${s.layout.flex} flexible rows/columns and ${s.layout.grid} grids on the page
${s.layout.gridColumns.length ? `- Grids with ${s.layout.gridColumns.map((g) => `${g.columns} columns`).join(", ")}\n` : ""}${s.layout.contentWidths.length ? `- Content width: ${s.layout.contentWidths.map((w) => `${w.value}px`).join(", ")}\n` : ""}- Breakpoints: ${s.breakpoints.length ? s.breakpoints.map((b) => `${b}px`).join(", ") : "none readable"}${s.unreadableStylesheets ? ` (${s.unreadableStylesheets} stylesheet${s.unreadableStylesheets > 1 ? "s" : ""} from other websites couldn't be read)` : ""}

## Components

${s.examples.length ? s.examples.map((e) => `- **${e.kind[0].toUpperCase()}${e.kind.slice(1)}**: “${e.label}”, ${e.width} × ${e.height}px${e.image ? ` (\`${e.image}\`)` : ""}`).join("\n") : "_None found._"}

## Motion

${s.transitions.length ? s.transitions.map((t) => `- ${t.prop} over ${duration(t.duration)}, ${easingName(t.easing).toLowerCase()} (\`${t.easing}\`)`).join("\n") : "No transitions found."}
${s.keyframes.length ? `\nNamed animations: ${s.keyframes.map((k) => `\`${k}\``).join(", ")}\n` : ""}
## Tokens

\`\`\`css
:root {
${tokens.join("\n")}
}
\`\`\`
`;
}
