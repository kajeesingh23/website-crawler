// Runs INSIDE the inspected website: Playwright injects it before the site's own scripts, and the
// Plax extension runs it as its content script. Playwright sends it as source text, so it must be
// self-contained: no imports, no outer variables.

export type ElementInfo = {
  label: string; // plain-language name, e.g. "Button"
  note?: string; // why something can't be fully inspected
  tag: string;
  text: string;
  width: number;
  height: number;
  hasParent: boolean;
  hasChild: boolean;
  path: string[]; // plain-language ancestors, outermost first, e.g. ["Page", "Navigation"]
};

export type PageEvent =
  | { type: "ready" }
  | { type: "mode"; inspecting: boolean }
  | { type: "select"; info: ElementInfo }
  | { type: "clear" };

export function overlay(opts?: { smart?: boolean }) {
  type W = Window & { __pdi?: unknown; __pdiEmit?: (ev: unknown) => Promise<unknown> };
  const w = window as W;
  if (w !== w.top || w.__pdi) return; // top page only; embedded frames are reported, not entered

  const emit = (ev: unknown) => Promise.resolve(w.__pdiEmit?.(ev)).catch(() => undefined);
  let inspecting = false;
  let hovered: Element | null = null;
  let selected: Element | null = null;

  // Built with DOM APIs (not innerHTML) so sites with strict Trusted Types policies still work.
  const host = document.createElement("pdi-overlay");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .box{position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #4f3bf5;background:rgba(79,59,245,.08);border-radius:3px;display:none}
    .sel{border-color:#ff5c28;background:rgba(255,92,40,.06)}
    .tip{position:fixed;pointer-events:none;z-index:2147483647;font:500 12px/1.3 system-ui,sans-serif;color:#fff;background:#141414;padding:5px 9px;border-radius:7px;display:none;white-space:nowrap;max-width:380px;overflow:hidden;text-overflow:ellipsis}
    .pill{all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;font:500 13px/1 system-ui,sans-serif;color:#fff;background:#141414;padding:11px 16px;border-radius:999px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}
    .pill.on{background:#4f3bf5}
    .mark{position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #4f3bf5;border-radius:3px;display:none}
    .mark b{position:absolute;left:-2px;top:-20px;font:600 11px/18px system-ui,sans-serif;color:#fff;background:#4f3bf5;padding:0 6px;border-radius:4px 4px 4px 0}`;
  const make = (cls: string, tag = "div") => {
    const el = document.createElement(tag);
    el.className = cls;
    root.appendChild(el);
    return el;
  };
  root.appendChild(style);
  const hoverBox = make("box");
  const selBox = make("box sel");
  const tip = make("tip");
  const pill = make("pill", "button");

  const mount = () => document.documentElement.appendChild(host);
  if (document.documentElement) mount();
  else document.addEventListener("readystatechange", mount, { once: true });

  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  function label(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const r = el.getBoundingClientRect();
    const hasText = () => !!el.textContent?.trim(); // lazy: large sections have a lot of text
    if (tag === "body") return "Page";
    if (tag === "iframe") return "Embedded frame";
    if (tag === "nav" || role === "navigation") return "Navigation";
    if (tag === "header" || role === "banner") return "Header";
    if (tag === "footer" || role === "contentinfo") return "Footer";
    if (tag === "button" || role === "button") return "Button";
    if (opts?.smart && isCard(el)) return "Card";
    if (tag === "a") return hasText() ? "Link" : "Image link";
    if (/^h[1-6]$/.test(tag)) return "Heading";
    if (tag === "p") return "Paragraph";
    if (tag === "img" || tag === "picture") return "Image";
    if (tag === "svg") return r.width <= 48 && r.height <= 48 ? "Icon" : "Illustration";
    if (tag === "video") return "Video";
    if (tag === "canvas") return "Canvas drawing";
    if (tag === "input" || tag === "textarea" || tag === "select") return "Form field";
    if (tag === "form") return "Form";
    if (tag === "ul" || tag === "ol") return "List";
    if (tag === "li") return "List item";
    if (["section", "article", "main", "aside"].includes(tag)) return "Section";
    if (["span", "label", "strong", "em", "small", "b", "i"].includes(tag)) return "Text";
    if (getComputedStyle(el).backgroundImage.includes("url(")) return "Image block";
    if (el.children.length === 0 && hasText()) return "Text";
    if (r.width >= innerWidth * 0.9 && r.height >= 200) return "Section";
    if (el.children.length > 1) return "Group";
    return "Box";
  }

  function note(el: Element): string | undefined {
    const tag = el.tagName.toLowerCase();
    if (tag === "iframe")
      return "This part is loaded from another website, so its inside can't be inspected. You can still capture how it looks.";
    if (tag === "canvas")
      return "This is drawn with code, so the shapes and colours inside it can't be read one by one. You can still capture how it looks.";
    return undefined;
  }

  function info(el: Element) {
    const r = el.getBoundingClientRect();
    const h = el as HTMLElement;
    const text = (h.innerText ?? el.textContent ?? "").trim().replace(/\s+/g, " ");
    const path: string[] = [];
    for (let p = el.parentElement; p && p !== document.documentElement && path.length < 5; p = p.parentElement)
      path.unshift(label(p));
    return {
      path,
      label: label(el),
      note: note(el),
      tag: el.tagName.toLowerCase(),
      text: (text || el.getAttribute("alt") || el.getAttribute("aria-label") || "").slice(0, 120),
      width: Math.round(r.width),
      height: Math.round(r.height),
      hasParent: el !== document.body && !!el.parentElement && el.parentElement !== document.documentElement,
      hasChild: [...el.children].some(visible),
    };
  }

  function draw(box: HTMLElement, el: Element | null) {
    if (!el) return void (box.style.display = "none");
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      display: "block",
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }

  function pick(x: number, y: number): Element | null {
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    if (!el || el === host) return null;
    // Frames ignore the mouse while selecting (see frameStyle), so find the one under the cursor.
    for (const f of el.querySelectorAll("iframe")) {
      const r = f.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return f;
    }
    return el.closest("svg") ?? el; // treat an icon as one thing, not its inner paths
  }

  // Smart picking (the extension): a click on a card's title, icon or button picks the whole card.
  // A "card" is a self-contained box smaller than the screen that either looks separate (its own
  // background, border or shadow) or groups a picture with text (article, list item, figure, link).
  const CONTROL = "a,button,[role=button],label,summary,input,select,textarea";
  function looksSeparate(n: Element) {
    const s = getComputedStyle(n);
    const bg = (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") || s.backgroundImage !== "none";
    const border = (["Top", "Right", "Bottom", "Left"] as const).some((d) => parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== "none");
    return bg || border || s.boxShadow !== "none";
  }
  function isCard(n: Element) {
    const r = n.getBoundingClientRect();
    if (r.width < 40 || r.height < 40 || n.childElementCount === 0 || n.querySelectorAll("*").length < 2) return false;
    const tag = n.tagName.toLowerCase();
    const media = !!n.querySelector("img,picture,svg,video");
    const text = !!n.textContent?.trim();
    if (tag === "a") return media && text; // a link that wraps a picture and text is a card; a text link isn't
    if (n.matches(CONTROL)) return false;
    return looksSeparate(n) || (["article", "li", "figure"].includes(tag) && media && text);
  }
  function componentOf(el: Element): Element {
    const control = el.closest(CONTROL);
    const fallback = control && control !== document.body ? control : el; // text or icon inside a button → the button
    for (let n: Element | null = el, depth = 0; n && n !== document.body && depth < 8; n = n.parentElement, depth++) {
      const r = n.getBoundingClientRect();
      if (r.width >= innerWidth * 0.9 || r.height >= innerHeight * 0.9) break; // reached a whole section: stop climbing
      if (isCard(n)) return n;
    }
    return fallback;
  }
  // Alt (Option) + click always picks exactly what's under the pointer.
  const target = (el: Element | null, exact = false) => (el && opts?.smart && !exact && el.tagName.toLowerCase() !== "iframe" ? componentOf(el) : el);

  // Numbered outlines for everything kept in a multi-selection (the extension's list).
  let marked: Element[] = [];
  const markBoxes: HTMLElement[] = [];
  function drawMarks() {
    marked.forEach((el, i) => {
      const box = (markBoxes[i] ??= make("mark"));
      if (!box.firstChild) box.appendChild(document.createElement("b"));
      box.firstChild!.textContent = String(i + 1);
      draw(box, el.isConnected ? el : null);
    });
    for (const box of markBoxes.slice(marked.length)) box.style.display = "none";
  }

  function select(el: Element | null) {
    if (!el) return;
    selected = el;
    draw(selBox, el);
    emit({ type: "select", info: info(el) });
  }

  function step(dir: "next" | "prev") {
    if (!selected?.parentElement) return;
    const sibs = [...selected.parentElement.children].filter(visible);
    const i = sibs.indexOf(selected);
    if (sibs.length < 2) return;
    select(sibs[(i + (dir === "next" ? 1 : -1) + sibs.length) % sibs.length]);
  }

  // Mouse events over a frame go into the frame's own page, where we can't listen. While selecting,
  // frames let the mouse pass through to this page instead.
  const frameStyle = document.createElement("style");
  frameStyle.textContent = "iframe{pointer-events:none!important}";

  function updatePill() {
    pill.textContent = inspecting ? "Selecting · click anything" : "Select an element";
    pill.classList.toggle("on", inspecting);
    if (inspecting) document.documentElement?.appendChild(frameStyle);
    else frameStyle.remove();
    if (!inspecting) {
      hovered = null;
      draw(hoverBox, null);
      tip.style.display = "none";
    }
  }

  const api = {
    setInspecting(on: boolean) {
      inspecting = on;
      updatePill();
    },
    parent() {
      const p = selected?.parentElement;
      if (selected && selected !== document.body && p && p !== document.documentElement) select(p);
    },
    child() {
      const c = selected && [...selected.children].find(visible);
      if (c) select(c);
    },
    // Select by CSS address, for when Claude (not the mouse) picks the element.
    selectCss(css: string) {
      let el: Element | null = null;
      try {
        el = document.querySelector(css);
      } catch {}
      if (!el) return false;
      el.scrollIntoView({ block: "center", behavior: "instant" });
      select(el);
      return true;
    },
    next: () => step("next"),
    prev: () => step("prev"),
    clear() {
      selected = null;
      draw(selBox, null);
      emit({ type: "clear" });
    },
    showOverlay(on: boolean) {
      host.style.display = on ? "" : "none";
    },
    mark(els: Element[]) {
      marked = els;
      drawMarks();
    },
    get selected() {
      return selected;
    },
  };
  w.__pdi = api;

  pill.addEventListener("click", () => {
    api.setInspecting(!inspecting);
    emit({ type: "mode", inspecting });
  });

  addEventListener(
    "mousemove",
    (e) => {
      if (!inspecting) return;
      hovered = target(pick(e.clientX, e.clientY), e.altKey);
      draw(hoverBox, hovered);
      if (!hovered) return void (tip.style.display = "none");
      // Only the cheap parts here: this runs on every mouse move.
      const r = hovered.getBoundingClientRect();
      tip.textContent = `${label(hovered)} · ${Math.round(r.width)} × ${Math.round(r.height)}`;
      Object.assign(tip.style, {
        display: "block",
        left: `${Math.min(e.clientX + 14, innerWidth - 240)}px`,
        top: `${Math.min(e.clientY + 18, innerHeight - 32)}px`,
      });
    },
    true,
  );

  // While selecting, the site must not react to clicks (no navigation, no menus opening).
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"]) {
    addEventListener(
      type,
      (e) => {
        if (!inspecting || e.composedPath().includes(host)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const m = e as MouseEvent;
        if (type === "click") select(target(pick(m.clientX, m.clientY), m.altKey));
      },
      true,
    );
  }

  addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && selected) api.clear();
    },
    true,
  );

  const redraw = () => {
    draw(hoverBox, hovered);
    draw(selBox, selected);
    drawMarks();
  };
  addEventListener("scroll", redraw, true);
  addEventListener("resize", redraw);

  updatePill();
  emit({ type: "ready" }).then((r) => {
    const res = r as { inspecting?: boolean } | undefined;
    if (res?.inspecting) api.setInspecting(true);
  });
}
