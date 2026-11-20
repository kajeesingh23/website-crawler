// Runs INSIDE a website page (Playwright page.evaluate). Self-contained: no imports, no outer variables.
// Reads the whole page's design language from what the browser actually renders. Nothing is guessed here.

export type Counted<T> = T & { count: number };
export type SystemColour = Counted<{ hex: string; alpha: number; uses: string[] }>;
export type TypeStyle = Counted<{ family: string; size: number; weight: string; lineHeight: string; letterSpacing: string; transform: string; tags: string[]; sample: string }>;
export type Example = { kind: "button" | "card" | "navigation" | "form"; path: string; label: string; width: number; height: number; image?: string };

export type SystemData = {
  title: string;
  url: string;
  colours: SystemColour[];
  type: TypeStyle[];
  fonts: Counted<{ family: string; webFont: boolean }>[];
  spacing: Counted<{ value: number }>[];
  radii: Counted<{ value: string }>[];
  shadows: Counted<{ value: string }>[];
  breakpoints: number[];
  unreadableStylesheets: number;
  layout: { flex: number; grid: number; gridColumns: Counted<{ columns: number }>[]; contentWidths: Counted<{ value: number }>[] };
  transitions: Counted<{ prop: string; duration: number; easing: string }>[];
  keyframes: string[];
  examples: Example[];
  scanned: number;
  truncated: boolean;
};

export function extractSystem(): SystemData {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const colourCache = new Map<string, { hex: string; alpha: number } | null>();
  const colour = (css: string) => {
    if (!css || css === "none" || css.startsWith("url")) return null;
    if (colourCache.has(css)) return colourCache.get(css)!;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const c = a === 0 ? null : { hex: `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`, alpha: Math.round((a / 255) * 100) / 100 };
    colourCache.set(css, c);
    return c;
  };
  const tally = <T,>(map: Map<string, Counted<T>>, key: string, make: () => T) => {
    const e = map.get(key) ?? { ...make(), count: 0 };
    e.count++;
    map.set(key, e);
    return e;
  };
  const top = <T,>(map: Map<string, Counted<T>>, n: number) => [...map.values()].sort((a, b) => b.count - a.count).slice(0, n);
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  const webFonts = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => unquote(f.family)));

  const colours = new Map<string, Counted<{ hex: string; alpha: number; uses: string[] }>>();
  const addColour = (css: string, use: string) => {
    const c = colour(css);
    if (!c) return;
    const e = tally(colours, `${c.hex}/${c.alpha}`, () => ({ ...c, uses: [] as string[] }));
    if (!e.uses.includes(use)) e.uses.push(use);
  };
  const type = new Map<string, TypeStyle>();
  const fonts = new Map<string, Counted<{ family: string; webFont: boolean }>>();
  const spacing = new Map<string, Counted<{ value: number }>>();
  const radii = new Map<string, Counted<{ value: string }>>();
  const shadows = new Map<string, Counted<{ value: string }>>();
  const gridColumns = new Map<string, Counted<{ columns: number }>>();
  const contentWidths = new Map<string, Counted<{ value: number }>>();
  const transitions = new Map<string, Counted<{ prop: string; duration: number; easing: string }>>();
  const keyframes = new Set<string>();
  let flex = 0;
  let grid = 0;

  // A short, stable address for an element, so it can be photographed afterwards.
  const pathOf = (el: Element): string => {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const tag = n.tagName.toLowerCase();
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n!.tagName) : [];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
    }
    return parts.join(" > ");
  };
  const examples: Example[] = [];
  const exampleKeys = new Set<string>();
  const addExample = (kind: Example["kind"], el: Element, styleKey: string, limit: number, label: string) => {
    if (examples.filter((e) => e.kind === kind).length >= limit || exampleKeys.has(`${kind}:${styleKey}`)) return;
    const path = pathOf(el);
    if (examples.some((e) => e.path === path)) return;
    exampleKeys.add(`${kind}:${styleKey}`);
    const r = el.getBoundingClientRect();
    examples.push({ kind, path, label, width: Math.round(r.width), height: Math.round(r.height) });
  };

  const all = [document.body, ...document.body.querySelectorAll("*")]; // the body often carries the page background
  const nodes = all.slice(0, 4000);
  const SPACE = ["padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left", "row-gap", "column-gap"];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.opacity === "0") continue;
    const tag = el.tagName.toLowerCase();

    if (el instanceof SVGElement) {
      if (tag !== "svg") {
        if (s.fill !== "none") addColour(s.fill, "icon");
        if (s.stroke !== "none") addColour(s.stroke, "icon");
      }
      continue;
    }
    const text = [...el.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.textContent?.trim() ?? "").join(" ").trim();
    if (text) {
      addColour(s.color, "text");
      const family = unquote(s.fontFamily.split(",")[0]);
      tally(fonts, family, () => ({ family, webFont: webFonts.has(family) }));
      const key = [family, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing, s.textTransform].join("|");
      const t = tally(type, key, () => ({
        family,
        size: parseFloat(s.fontSize),
        weight: s.fontWeight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        transform: s.textTransform,
        tags: [] as string[],
        sample: text.slice(0, 48),
      }));
      if (!t.tags.includes(tag) && t.tags.length < 6) t.tags.push(tag);
    }
    addColour(s.backgroundColor, "background");
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none") addColour(s.borderTopColor, "border");

    for (const p of SPACE) {
      const v = Math.round(parseFloat(s.getPropertyValue(p)));
      if (v > 0 && v <= 240) tally(spacing, String(v), () => ({ value: v }));
    }
    if (s.borderRadius !== "0px") tally(radii, s.borderRadius, () => ({ value: s.borderRadius }));
    if (s.boxShadow !== "none") tally(shadows, s.boxShadow, () => ({ value: s.boxShadow }));

    if (s.display.includes("flex")) flex++;
    if (s.display.includes("grid")) {
      grid++;
      const cols = (s.gridTemplateColumns.match(/[\d.]+px/g) ?? []).length;
      if (cols > 1) tally(gridColumns, String(cols), () => ({ columns: cols }));
    }
    if (s.maxWidth.endsWith("px") && s.marginLeft === s.marginRight && parseFloat(s.marginLeft) > 0) {
      const w = Math.round(parseFloat(s.maxWidth));
      tally(contentWidths, String(w), () => ({ value: w }));
    }

    const props = s.transitionProperty.split(",");
    const durs = s.transitionDuration.split(",");
    const eases = s.transitionTimingFunction.split(/,(?![^(]*\))/);
    props.forEach((p, i) => {
      const duration = parseFloat(durs[i % durs.length]) * 1000;
      if (duration > 0) {
        const easing = eases[i % eases.length].trim();
        tally(transitions, `${p.trim()}|${duration}|${easing}`, () => ({ prop: p.trim(), duration, easing }));
      }
    });

    // Real examples of the site's building blocks.
    const short = text.length > 0 && text.length <= 32;
    const hasFill = !!colour(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0;
    const key = [s.backgroundColor, s.color, s.borderRadius, s.paddingTop, s.paddingLeft, s.borderTopWidth].join("|");
    const isButton =
      tag === "button" ||
      el.getAttribute("role") === "button" ||
      (tag === "input" && /submit|button/.test((el as HTMLInputElement).type)) ||
      (tag === "a" && hasFill && parseFloat(s.paddingLeft) > 0);
    if (isButton && r.height >= 24 && r.height <= 80 && (short || tag === "input")) addExample("button", el, key, 4, text || "Button");
    if (tag === "nav" || el.getAttribute("role") === "navigation") addExample("navigation", el, String(Math.round(r.width)), 2, "Navigation");
    if (tag === "form" && r.height >= 40) addExample("form", el, key, 2, "Form");
    const raised = s.boxShadow !== "none" || (parseFloat(s.borderTopWidth) > 0 && s.borderRadius !== "0px") || (!!colour(s.backgroundColor) && s.borderRadius !== "0px");
    if (raised && el.children.length >= 2 && r.width >= 160 && r.width <= 640 && r.height >= 100 && r.height <= 720) {
      const heading = el.querySelector("h1, h2, h3, h4, h5, h6, strong");
      addExample("card", el, key, 4, heading?.textContent?.trim().slice(0, 32) || "Card");
    }
  }

  // Breakpoints and animation names live in the stylesheets; other websites' sheets can't be read.
  const breakpoints = new Set<number>();
  let unreadableStylesheets = 0;
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) {
        for (const m of rule.conditionText.matchAll(/(?:min|max)-width:\s*([\d.]+)(px|em|rem)/g))
          breakpoints.add(Math.round(parseFloat(m[1]) * (m[2] === "px" ? 1 : 16)));
        walk(rule.cssRules);
      } else if (rule instanceof CSSKeyframesRule) keyframes.add(rule.name);
      else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      unreadableStylesheets++;
    }
  }
  for (const a of document.getAnimations()) if (a instanceof CSSAnimation) keyframes.add(a.animationName);

  return {
    title: document.title,
    url: location.href,
    colours: top(colours, 24),
    type: top(type, 16).sort((a, b) => b.size - a.size),
    fonts: top(fonts, 6),
    spacing: top(spacing, 24)
      .filter((s) => s.count >= 2)
      .sort((a, b) => a.value - b.value),
    radii: top(radii, 8),
    shadows: top(shadows, 6),
    breakpoints: [...breakpoints].filter((b) => b >= 240 && b <= 2560).sort((a, b) => a - b),
    unreadableStylesheets,
    layout: { flex, grid, gridColumns: top(gridColumns, 5), contentWidths: top(contentWidths, 4) },
    transitions: top(transitions, 8),
    keyframes: [...keyframes].slice(0, 20),
    examples,
    scanned: nodes.length,
    truncated: all.length > nodes.length,
  };
}
