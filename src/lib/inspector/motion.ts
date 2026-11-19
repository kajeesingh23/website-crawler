// Runs INSIDE the inspected website on the selected element (Playwright element.evaluate).
// Playwright sends it as source text, so it must be self-contained: no imports, no outer variables.
// It takes a still "photo" of how the element looks and moves right now; the session takes several
// (resting, hovered, focused, scrolled into view) and compares them.

export type Keyframe = Record<string, string | number>; // offset + whitelisted properties (+ easing)

export type Anim = {
  key: string; // identifies the same animation across photos
  kind: "css-animation" | "css-transition" | "script";
  name: string;
  part: string;
  duration: number; // ms
  delay: number;
  easing: string;
  iterations: number | "infinite";
  direction: string;
  keyframes: Keyframe[];
};

export type Declared = { part: string; prop: string; duration: number; delay: number; easing: string };

export type MotionState = {
  parts: string[];
  styles: Record<string, string>[];
  animations: Anim[];
  transitions: Declared[];
  scrollTimelines: string[];
};

export function motionState(el: Element): MotionState {
  const PROPS = [
    "transform", "translate", "scale", "rotate", "opacity", "filter", "color", "background-color",
    "border-color", "box-shadow", "border-radius", "outline-color", "text-decoration-line", "clip-path",
  ];
  // Only properties that are safe and meaningful to replay on a preview.
  const KEYFRAME_PROPS = new Set([
    "transform", "translate", "scale", "rotate", "opacity", "filter", "color", "backgroundColor", "boxShadow", "borderRadius", "clipPath",
  ]);
  const parts = [el, ...el.querySelectorAll("*")]
    .filter((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    })
    .slice(0, 30);
  const partName = (n: Element) => {
    if (n === el) return "Whole element";
    if (n.closest("svg")) return "Icon";
    if (n.tagName === "IMG") return "Image";
    const text = (n as HTMLElement).innerText?.trim().replace(/\s+/g, " ");
    return text ? `“${text.slice(0, 24)}${text.length > 24 ? "…" : ""}”` : "Inner shape";
  };
  const names = parts.map(partName);
  const splitList = (v: string) => v.split(/,(?![^(]*\))/).map((x) => x.trim());

  const animations: Anim[] = el.getAnimations({ subtree: true }).map((a) => {
    const effect = a.effect as KeyframeEffect | null;
    const timing = effect?.getTiming();
    const idx = parts.indexOf(effect?.target as Element);
    const kind = a instanceof CSSAnimation ? "css-animation" : a instanceof CSSTransition ? "css-transition" : "script";
    const name = a instanceof CSSAnimation ? a.animationName : a instanceof CSSTransition ? a.transitionProperty : a.id || "Scripted animation";
    const keyframes = (effect?.getKeyframes() ?? []).map((k) => {
      const out: Keyframe = { offset: Number(k.computedOffset) };
      for (const [p, v] of Object.entries(k)) if (KEYFRAME_PROPS.has(p) && typeof v === "string") out[p] = v;
      if (typeof k.easing === "string" && k.easing !== "linear") out.easing = k.easing;
      return out;
    });
    const part = idx >= 0 ? names[idx] : "Part inside";
    return {
      key: `${kind}:${name}:${idx}`,
      kind,
      name,
      part: effect?.pseudoElement ? `${part} (decoration)` : part,
      duration: Number(timing?.duration) || 0,
      delay: timing?.delay ?? 0,
      // CSS animations keep their easing on the keyframes rather than on the timing.
      easing: String(keyframes[0]?.easing ?? timing?.easing ?? "linear"),
      iterations: timing?.iterations === Infinity ? "infinite" : (timing?.iterations ?? 1),
      direction: timing?.direction ?? "normal",
      keyframes,
    };
  });

  const transitions: Declared[] = [];
  const scrollTimelines: string[] = [];
  parts.forEach((n, i) => {
    const s = getComputedStyle(n);
    const props = splitList(s.transitionProperty);
    const durs = splitList(s.transitionDuration);
    const delays = splitList(s.transitionDelay);
    const eases = splitList(s.transitionTimingFunction);
    props.forEach((prop, j) => {
      const duration = parseFloat(durs[j % durs.length]) * 1000;
      if (duration > 0)
        transitions.push({ part: names[i], prop, duration, delay: parseFloat(delays[j % delays.length]) * 1000, easing: eases[j % eases.length] });
    });
    const timeline = s.getPropertyValue("animation-timeline");
    if (timeline && timeline !== "auto") scrollTimelines.push(`${names[i]}: ${timeline}`);
  });

  return {
    parts: names,
    styles: parts.map((n) => {
      const s = getComputedStyle(n);
      return Object.fromEntries(PROPS.map((p) => [p, s.getPropertyValue(p)]));
    }),
    animations,
    transitions: transitions.slice(0, 20),
    scrollTimelines,
  };
}
