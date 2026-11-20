// Runs INSIDE the inspected website on the selected element (Playwright element.evaluate).
// Playwright sends it as source text, so it must be self-contained: no imports, no outer variables.
// It makes a frozen copy: the same structure, every visible style written inline, nothing that can run.

export type Snapshot = {
  body: string; // the copied element; its root carries class "pdi-root"
  root: Record<string, string>; // the root's styles, kept separate so the page can add :hover etc.
  nodes: number;
  truncated: boolean;
};

export function snapshotElement(el: Element): Snapshot {
  const PROPS = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "box-sizing", "width", "height", "min-width",
    "max-width", "min-height", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top",
    "padding-right", "padding-bottom", "padding-left", "flex-direction", "flex-wrap", "justify-content",
    "align-items", "align-self", "align-content", "row-gap", "column-gap", "flex-grow", "flex-shrink", "flex-basis",
    "order", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "font-family", "font-size",
    "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform",
    "text-decoration-line", "text-decoration-color", "white-space", "color", "background-color", "background-image",
    "background-size", "background-position", "background-repeat", "border-top-width", "border-right-width",
    "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style",
    "border-left-style", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    "box-shadow", "opacity", "transform", "filter", "backdrop-filter", "overflow-x", "overflow-y", "object-fit",
    "object-position", "fill", "stroke", "stroke-width", "cursor", "list-style-type", "vertical-align",
    "transition-property", "transition-duration", "transition-timing-function", "transition-delay",
    "animation-name", "animation-duration", "animation-timing-function", "animation-delay",
    "animation-iteration-count", "animation-direction", "animation-fill-mode",
  ];
  // Values that are the browser's default; leaving them out keeps the copy readable.
  const SKIP = new Set(["none", "normal", "auto", "0px", "0s", "static", "visible", "rgba(0, 0, 0, 0)", "0% 0%", "repeat", "1", "0", "start", "stretch", "nowrap", "row", "ease", "content-box", "baseline", "fill", "50% 50%"]);
  const SPACE = /^(margin|padding)-|gap$/;
  const scale = (value: string, v: string) => value.replace(/(-?\d*\.?\d+)px/g, (_, n: string) => `calc(${n}px * var(${v}, 1))`);
  const time = (value: string) =>
    value.split(",").map((t) => `calc(${t.trim()} * var(--pdi-speed, 1))`).join(", ");

  const rootStyle = getComputedStyle(el);
  const rootText = rootStyle.color;
  const rootBg = rootStyle.backgroundColor;
  const rootFont = rootStyle.fontFamily;
  // Copies use these so the studio's controls (colours, font, spacing, speed…) change every version alike.
  const styleOf = (n: Element, isRoot: boolean) => {
    const s = getComputedStyle(n);
    const out: Record<string, string> = {};
    for (const p of PROPS) {
      let v = s.getPropertyValue(p);
      if (!v || (SKIP.has(v) && p !== "display")) continue;
      if (p === "display" && v === (n instanceof SVGElement ? "inline" : "block")) continue;
      if ((p === "width" || p === "height") && !isRoot && !["img", "svg", "video", "canvas", "iframe"].includes(n.tagName.toLowerCase())) continue;
      if (p === "color" && v === rootText) v = `var(--pdi-text, ${v})`;
      else if (p === "background-color" && v === rootBg) v = `var(--pdi-bg, ${v})`;
      else if (p === "font-family" && v === rootFont) v = `var(--pdi-font, ${v})`;
      else if (p === "font-size") v = scale(v, "--pdi-type-scale");
      else if (SPACE.test(p)) v = scale(v, "--pdi-space");
      else if (p.endsWith("-radius")) v = scale(v, "--pdi-radius-scale");
      else if (p === "box-shadow" && isRoot) v = `var(--pdi-shadow, ${v})`;
      else if (p === "transition-duration" || p === "transition-delay" || p === "animation-duration") v = time(v);
      out[p] = v;
    }
    if (isRoot && !out["background-color"]) out["background-color"] = "var(--pdi-bg, transparent)";
    if (isRoot && !out["color"]) out["color"] = `var(--pdi-text, ${rootText})`;
    return out;
  };

  const DROP = new Set(["script", "style", "link", "meta", "noscript", "template", "object", "embed"]);
  const PLACEHOLDER = new Set(["iframe", "canvas", "video"]);
  const SVG_ATTR_OK = (name: string, value: string) =>
    !name.startsWith("on") && !/^\s*javascript:/i.test(value) && !["style", "class", "id"].includes(name);
  let count = 0;
  let truncated = false;

  const copy = (src: Element, isRoot: boolean): Element | null => {
    const tag = src.tagName.toLowerCase();
    if (DROP.has(tag)) return null;
    const r = src.getBoundingClientRect();
    if (!isRoot && r.width === 0 && r.height === 0 && getComputedStyle(src).display === "none") return null;
    if (++count > 600) {
      truncated = true;
      return null;
    }
    if (PLACEHOLDER.has(tag)) {
      const ph = document.createElement("div");
      ph.setAttribute("data-was", tag);
      ph.style.cssText = `width:${r.width}px;height:${r.height}px;background:repeating-linear-gradient(45deg,#ddd 0 8px,#eee 8px 16px)`;
      return ph;
    }
    let out: Element;
    if (src instanceof SVGElement) {
      out = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const a of src.attributes) if (SVG_ATTR_OK(a.name, a.value)) out.setAttribute(a.name, a.value);
    } else {
      out = document.createElement(tag === "a" ? "span" : tag); // links become plain text: copies never navigate
      if (tag === "img") {
        const img = src as HTMLImageElement;
        out.setAttribute("src", img.currentSrc || img.src);
        if (img.alt) out.setAttribute("alt", img.alt);
      }
      if (tag === "input" || tag === "textarea" || tag === "button") {
        for (const name of ["type", "placeholder"]) {
          const v = src.getAttribute(name);
          if (v) out.setAttribute(name, v);
        }
        if (tag === "input") out.setAttribute("value", (src as HTMLInputElement).value);
      }
    }
    if (isRoot) out.setAttribute("class", "pdi-root");
    else {
      const style = Object.entries(styleOf(src, false)).map(([p, v]) => `${p}:${v}`).join(";");
      if (style) out.setAttribute("style", style);
    }
    for (const child of src.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out.appendChild(document.createTextNode(child.textContent ?? ""));
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const c = copy(child as Element, false);
        if (c) out.appendChild(c);
      }
    }
    return out;
  };

  const body = copy(el, true);
  return { body: body?.outerHTML ?? "", root: styleOf(el, true), nodes: count, truncated };
}
