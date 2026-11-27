import type { Design } from "./extract.ts";
import type { Anim, Declared, Keyframe, MotionState } from "./motion.ts";
import type { Interaction, Motion } from "./session.ts";

type Layout = Design["layout"];

/** Says how an element arranges its contents, in words a designer would use. */
export function describeLayout(l: Layout): string {
  let text: string;
  if (l.display.includes("flex")) {
    const row = !l.direction.startsWith("column");
    const spread: Record<string, string> = {
      "space-between": "spread to the edges",
      "space-around": "spread out with space around each",
      "space-evenly": "spaced evenly",
      center: "centred",
      "flex-end": "pushed to the end",
      end: "pushed to the end",
    };
    const cross: Record<string, string> = {
      center: row ? "vertically centred" : "horizontally centred",
      "flex-start": row ? "lined up at the top" : "lined up on the left",
      start: row ? "lined up at the top" : "lined up on the left",
      "flex-end": row ? "lined up at the bottom" : "lined up on the right",
      end: row ? "lined up at the bottom" : "lined up on the right",
      baseline: "lined up on their text",
    };
    text = [
      row ? "Side by side" : "Stacked",
      spread[l.justify],
      cross[l.alignItems],
      l.gap > 0 && `${Math.round(l.gap)}px apart`,
      l.wrap === "wrap" && "wrapping onto new lines",
    ]
      .filter(Boolean)
      .join(", ");
  } else if (l.display.includes("grid")) {
    const cols = `${l.columns} column${l.columns === 1 ? "" : "s"}`;
    text = `Grid of ${cols}${l.rows > 1 ? ` and ${l.rows} rows` : ""}${l.gap > 0 ? `, ${Math.round(l.gap)}px apart` : ""}`;
  } else if (l.display.startsWith("inline")) {
    text = "Sits in line with the text around it";
  } else {
    text = "Stacks normally, top to bottom";
  }
  const position: Record<string, string> = {
    absolute: "Placed freely on top of the area around it",
    fixed: "Pinned to the screen while you scroll",
    sticky: "Sticks in place once you scroll to it",
  };
  return position[l.position] ? `${text}. ${position[l.position]}.` : `${text}.`;
}

const WEIGHTS: Record<string, string> = {
  "100": "Thin",
  "200": "Extra light",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "Semibold",
  "700": "Bold",
  "800": "Extra bold",
  "900": "Black",
};

export const weightName = (w: string) => (WEIGHTS[w] ? `${WEIGHTS[w]} (${w})` : w);

// ---------- Motion ----------

export type Movement = { dx: number; dy: number; scale: number; rotate: number; relative?: boolean };
export type Change = { part: string; prop: string; from: string; to: string };

const IDENTITY: Movement = { dx: 0, dy: 0, scale: 1, rotate: 0 };

/** Reads a CSS transform ("translateY(20px) scale(1.05)", "matrix(…)", "none") into plain numbers. */
export function parseTransform(css: string | undefined): Movement {
  const m: Movement = { ...IDENTITY };
  if (!css || css === "none") return m;
  for (const [, fn, args] of css.matchAll(/([a-zA-Z0-9]+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean);
    const num = (i: number) => parseFloat(v[i] ?? "0") || 0;
    const len = (i: number) => {
      if (v[i]?.endsWith("%")) m.relative = true;
      return num(i);
    };
    const deg = (i: number) => {
      const s = v[i] ?? "0";
      if (s.endsWith("turn")) return num(i) * 360;
      if (s.endsWith("rad")) return (num(i) * 180) / Math.PI;
      return num(i);
    };
    switch (fn) {
      case "translate": case "translate3d": m.dx += len(0); m.dy += len(1); break;
      case "translateX": m.dx += len(0); break;
      case "translateY": m.dy += len(0); break;
      case "scale": case "scale3d": m.scale *= num(0); break;
      case "scaleX": case "scaleY": m.scale *= num(0); break;
      case "rotate": case "rotateZ": m.rotate += deg(0); break;
      case "matrix": m.scale *= Math.hypot(num(0), num(1)); m.rotate += (Math.atan2(num(1), num(0)) * 180) / Math.PI; m.dx += num(4); m.dy += num(5); break;
      case "matrix3d": m.scale *= Math.hypot(num(0), num(1)); m.rotate += (Math.atan2(num(1), num(0)) * 180) / Math.PI; m.dx += num(12); m.dy += num(13); break;
    }
  }
  return m;
}

export function movementBetween(from?: string, to?: string): Movement {
  const a = parseTransform(from);
  const b = parseTransform(to);
  return { dx: b.dx - a.dx, dy: b.dy - a.dy, scale: b.scale / (a.scale || 1), rotate: b.rotate - a.rotate, relative: a.relative || b.relative };
}

/** "Moves up 20px, fades in" — empty when nothing visible changes. */
export function describeMovement(m: Movement, opacity?: [number, number]): string {
  const unit = m.relative ? "% of its size" : "px";
  const r = (v: number) => Math.round(Math.abs(v) * 10) / 10;
  const steps: string[] = [];
  const moves = [
    Math.abs(m.dy) >= 0.5 && `${m.dy < 0 ? "up" : "down"} ${r(m.dy)}${unit}`,
    Math.abs(m.dx) >= 0.5 && `${m.dx < 0 ? "left" : "right"} ${r(m.dx)}${unit}`,
  ].filter(Boolean);
  if (moves.length) steps.push(`moves ${moves.join(" and ")}`);
  if (Math.abs(m.scale - 1) >= 0.005) steps.push(`${m.scale > 1 ? "grows" : "shrinks"} ${Math.round(Math.abs(m.scale - 1) * 100)}%`);
  if (Math.abs(m.rotate) >= 0.5) steps.push(`turns ${r(m.rotate)}°${m.rotate < 0 ? " anticlockwise" : ""}`);
  if (opacity && Math.abs(opacity[1] - opacity[0]) >= 0.05) steps.push(opacity[1] > opacity[0] ? "fades in" : "fades out");
  const text = steps.join(", ");
  return text && text[0].toUpperCase() + text.slice(1);
}

/** What visibly changed between two photos of the same element. */
export function diffStates(a: MotionState, b: MotionState, only?: string[]): Change[] {
  const out: Change[] = [];
  for (let i = 0; i < Math.min(a.styles.length, b.styles.length); i++)
    for (const prop of Object.keys(a.styles[i])) {
      if (only && !only.includes(prop)) continue;
      const from = a.styles[i][prop];
      const to = b.styles[i][prop];
      if (from !== to) out.push({ part: a.parts[i], prop, from, to });
    }
  return out.slice(0, 40);
}

/** Animations present in the later photo that weren't running in the earlier one. */
export const newAnimations = (before: MotionState, ...after: MotionState[]): Anim[] => {
  const seen = new Set(before.animations.map((a) => a.key));
  return after.flatMap((s) => s.animations).filter((a) => !seen.has(a.key) && (seen.add(a.key), true));
};

export const PROP_NAMES: Record<string, string> = {
  transform: "Position and size",
  translate: "Position",
  scale: "Size",
  rotate: "Rotation",
  opacity: "Opacity",
  filter: "Filter",
  color: "Text colour",
  "background-color": "Background",
  "border-color": "Border colour",
  "box-shadow": "Shadow",
  "border-radius": "Corners",
  "outline-color": "Outline",
  "text-decoration-line": "Underline",
  "clip-path": "Clip shape",
  all: "Everything",
};

const NAMED_EASINGS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** The four numbers behind an easing curve, or null for steps()/linear() lists. */
export function bezierOf(easing: string): [number, number, number, number] | null {
  if (NAMED_EASINGS[easing]) return NAMED_EASINGS[easing];
  const m = easing.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/);
  return m ? [+m[1], +m[2], +m[3], +m[4]] : null;
}

export function easingName(easing: string): string {
  const named: Record<string, string> = {
    linear: "Steady speed",
    ease: "Gentle start and end",
    "ease-in": "Starts slow, speeds up",
    "ease-out": "Starts fast, slows down",
    "ease-in-out": "Slow start and end",
  };
  if (named[easing]) return named[easing];
  const b = bezierOf(easing);
  if (!b) return easing.startsWith("steps") ? "Jumps in steps" : "Custom curve";
  const [x1, y1, x2, y2] = b;
  if (Math.min(y1, y2) < 0 || Math.max(y1, y2) > 1) return "Springy, overshoots";
  // A flat start (or flat end) on the curve means slow movement there.
  const slowStart = x1 > 0 && y1 / x1 < 0.5;
  const slowEnd = x2 < 1 && (1 - y2) / (1 - x2) < 0.5;
  if (slowStart && slowEnd) return "Slow start and end";
  if (slowStart) return "Starts slow, speeds up";
  if (slowEnd) return "Starts fast, slows down";
  return "Steady speed";
}

export const duration = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 100) / 10}s` : `${Math.round(ms)}ms`);

// Only these can be replayed on a screenshot; colour and other changes are described instead.
export const PLAYABLE = new Set(["transform", "translate", "scale", "rotate", "opacity", "filter"]);
export const camel = (p: string) => p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** The transition the website declared for this change, if any (falls back to "all"). */
export function timingFor(prop: string, part: string, transitions: Declared[]) {
  return (
    transitions.find((t) => t.part === part && t.prop === prop) ??
    transitions.find((t) => t.part === part && t.prop === "all") ?? { duration: 0, delay: 0, easing: "linear" }
  );
}

/** What a Library card replays to show the movement was recorded. Empty keyframes: recorded, but not playable on a picture. */
export type CardPreview = { label: string; keyframes: Keyframe[]; duration: number; easing: string; alternate: boolean };

const playableFrames = (frames: Keyframe[]) =>
  frames.map((k) => Object.fromEntries(Object.entries(k).filter(([p]) => PLAYABLE.has(p) || p === "offset" || p === "easing")));

export function cardPreview(saved: Partial<Motion> | null | undefined): CardPreview | null {
  if (!saved) return null;
  // Older or hand-made saves can miss parts; treat missing as "nothing seen".
  const m = { running: [], transitions: [], hover: null, focus: null, scroll: null, ...saved } as Motion;
  const anim = (a: Anim, label: string): CardPreview => ({
    label: `${label} · ${duration(a.duration)}`,
    keyframes: playableFrames(a.keyframes),
    duration: a.duration,
    easing: a.easing,
    alternate: a.direction.includes("alternate"),
  });
  const own = m.running.find((a) => a.keyframes.some((k) => Object.keys(k).some((p) => PLAYABLE.has(p))));
  if (own) return anim(own, "Moves on its own");
  const moments: [string, Interaction | null][] = [["On hover", m.hover], ["Scrolling into view", m.scroll], ["On focus", m.focus]];
  for (const [label, i] of moments) {
    const whole = i?.changes.filter((c) => c.part === "Whole element" && PLAYABLE.has(c.prop)) ?? [];
    if (!whole.length) continue;
    const t = timingFor(whole[0].prop, "Whole element", m.transitions);
    return {
      label: `${label} · ${t.duration ? duration(t.duration) : "instant"}`,
      keyframes: [Object.fromEntries(whole.map((c) => [camel(c.prop), c.from])), Object.fromEntries(whole.map((c) => [camel(c.prop), c.to]))],
      duration: t.duration || 300, // an instant change is slowed down so it can be seen
      easing: t.easing,
      alternate: true,
    };
  }
  for (const [label, i] of moments) {
    const a = i?.animations.find((x) => x.keyframes.some((k) => Object.keys(k).some((p) => PLAYABLE.has(p))));
    if (a) return anim(a, label);
  }
  // Recorded, but only things a picture can't show (colours, shadows, inner parts).
  for (const [label, i] of moments) {
    const c = i?.changes[0];
    if (c) return { label: `${label} · ${(PROP_NAMES[c.prop] ?? c.prop).toLowerCase()} changes`, keyframes: [], duration: 0, easing: "linear", alternate: false };
  }
  if (m.running[0]) return { label: "Moves on its own", keyframes: [], duration: 0, easing: "linear", alternate: false };
  return null;
}
