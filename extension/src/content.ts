// Runs in the website's tab (an isolated copy of `window`, sharing the page's DOM). It reuses the
// app's own in-page readers, so the extension measures exactly what the app measures.
import { overlay, type ElementInfo, type PageEvent } from "../../src/lib/inspector/overlay";
import { extractDesign } from "../../src/lib/inspector/extract";
import { motionState } from "../../src/lib/inspector/motion";
import { snapshotElement } from "../../src/lib/inspector/snapshot";
import { pathOf } from "../../src/lib/inspector/path";
import { buildDocument } from "../../src/lib/recreate/document";
import type { Motion } from "../../src/lib/inspector/session";
import type { Capture, FromContent, ToContent } from "./shared";

type Api = {
  selected: Element | null;
  setInspecting(on: boolean): void;
  showOverlay(on: boolean): void;
  mark(els: Element[]): void;
  parent(): void;
  child(): void;
  next(): void;
  prev(): void;
};
const w = window as unknown as { __plax?: boolean; __pdi?: Api; __pdiEmit?: (ev: PageEvent) => unknown };

if (!w.__plax) {
  w.__plax = true;
  start();
}

function start() {
  const kept = new Map<string, Element>();
  let replacing = false; // "Larger area", "Inside", "Previous", "Next" replace the newest capture
  const send = (m: FromContent) => chrome.runtime.sendMessage(m).catch(() => undefined); // panel closed: nothing to tell

  w.__pdiEmit = (ev) => {
    if (ev.type === "mode") void send({ type: "plax:mode", on: ev.inspecting });
    if (ev.type === "select") void found(ev.info);
    return undefined;
  };
  overlay({ smart: true });
  const api = w.__pdi!;

  async function found(info: ElementInfo) {
    const el = api.selected;
    if (!el) return;
    const replace = replacing;
    replacing = false;
    let design = null;
    try {
      design = extractDesign(el);
    } catch {
      // unusual elements (e.g. inside closed parts of the page) still get a picture and a copy
    }
    const rest = motionState(el);
    // Extensions can't move the real mouse, so hover, focus and scroll-in are left to the app's Analyse Website.
    const motion: Motion = { running: rest.animations, scriptedIdle: false, transitions: rest.transitions, hover: null, focus: null, scroll: null, scrollTimelines: rest.scrollTimelines };
    const snap = snapshotElement(el);
    const host = location.hostname.replace(/^www\./, "");
    const capture: Capture = {
      id: crypto.randomUUID(),
      name: `${info.label} from ${host}`,
      url: location.href,
      pageTitle: document.title,
      label: info.label,
      tag: info.tag,
      text: info.text,
      crumbs: info.path,
      path: pathOf(el),
      width: info.width,
      height: info.height,
      note: info.note,
      design,
      motion,
      html: buildDocument(snap, design?.appearance.sitsOn ?? null, motion),
      truncated: snap.truncated,
      createdAt: new Date().toISOString(),
    };
    kept.set(capture.id, el);
    // The panel photographs the visible tab, so hide Plax's outlines and bring the element into view first.
    api.showOverlay(false);
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = el.getBoundingClientRect();
    try {
      await send({ type: "plax:found", capture, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, viewport: { width: innerWidth, height: innerHeight }, replace });
    } finally {
      api.showOverlay(true);
    }
  }

  chrome.runtime.onMessage.addListener((msg: ToContent, _sender, reply) => {
    if (msg.type === "plax:ping") reply({ ok: true });
    else if (msg.type === "plax:mode") api.setInspecting(msg.on);
    else if (msg.type === "plax:marks") api.mark(msg.ids.map((id) => kept.get(id)).filter((e): e is Element => !!e));
    else if (msg.type === "plax:step") {
      if (!api.selected) return;
      replacing = true;
      api[msg.step]();
      replacing = false; // found() has already read it if something new was selected
    }
  });

  addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      api.setInspecting(false);
      void send({ type: "plax:mode", on: false });
    },
    true,
  );
}
