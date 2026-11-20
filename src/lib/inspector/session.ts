import { chromium, type Browser, type Page } from "playwright";
import { EventEmitter } from "node:events";
import { overlay, type ElementInfo, type PageEvent } from "./overlay.ts";
import { recordWebsite } from "../db.ts";
import { normaliseUrl } from "../url.ts";
import { extractDesign, type Design } from "./extract.ts";
import { motionState, type Anim, type Declared } from "./motion.ts";
import { snapshotElement } from "./snapshot.ts";
import { pathOf } from "./responsive.ts";
import { diffStates, newAnimations, type Change } from "./describe.ts";

export type Selection = ElementInfo & {
  id: number;
  screenshot?: string;
  design?: Design;
  designFailed?: boolean;
  motion?: Motion;
  motionStatus?: "running" | "done" | "failed";
};

export type Snapshot = {
  status: "idle" | "opening" | "open" | "closed" | "error";
  url?: string;
  title?: string;
  message?: string;
  inspecting: boolean;
  selection: Selection | null;
};

export const COMMANDS = ["parent", "child", "next", "prev", "clear", "inspect-on", "inspect-off", "motion"] as const;
export type Command = (typeof COMMANDS)[number];

type Session = { browser?: Browser; page?: Page; snap: Snapshot; bus: EventEmitter; seq: number };

// Kept on globalThis so the browser survives dev-server hot reloads.
const g = globalThis as typeof globalThis & { __pdiSession?: Session };
const s: Session = (g.__pdiSession ??= {
  snap: { status: "idle", inspecting: false, selection: null },
  bus: new EventEmitter(),
  seq: 0,
});
// After a code update the kept selection may be missing newer fields; it is cheap to select again.
s.snap = { ...s.snap, selection: null };

function set(patch: Partial<Snapshot>) {
  s.snap = { ...s.snap, ...patch };
  s.bus.emit("change", s.snap);
}

export const getSnapshot = () => s.snap;

export function subscribe(fn: (snap: Snapshot) => void) {
  s.bus.on("change", fn);
  return () => void s.bus.off("change", fn);
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ERR_NAME_NOT_RESOLVED")) return "We couldn't find that website. Check the link for typos.";
  if (msg.includes("ERR_INTERNET_DISCONNECTED")) return "You seem to be offline.";
  if (msg.includes("Timeout")) return "The website took too long to load. Try again or try another page.";
  if (msg.includes("Executable doesn't exist"))
    return "The inspection browser isn't installed. Run `npx playwright install chromium` once, then try again.";
  return `The website couldn't be opened. (${msg.split("\n")[0]})`;
}

async function ensurePage(): Promise<Page> {
  if (s.page && !s.page.isClosed()) return s.page;
  const headless = process.env.PDI_HEADLESS === "1";
  if (!s.browser?.isConnected()) {
    s.browser = await chromium.launch({ headless });
    s.browser.on("disconnected", () => {
      s.browser = s.page = undefined;
      set({ status: "closed", selection: null, inspecting: false });
    });
  }
  // viewport: null lets the site fill the real window, so it looks the way it does for visitors.
  const context = await s.browser.newContext({ viewport: headless ? undefined : null });
  await context.exposeBinding("__pdiEmit", (_src, ev: PageEvent) => onPageEvent(ev));
  await context.addInitScript(overlay);
  const page = await context.newPage();
  page.on("close", () => {
    if (s.page === page) s.page = undefined;
    set({ status: "closed", selection: null, inspecting: false });
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) set({ url: f.url(), selection: null });
  });
  page.on("load", async () => {
    const title = await page.title().catch(() => "");
    set({ title });
    try {
      recordWebsite(page.url(), title);
    } catch (e) {
      console.error("Couldn't record website", e);
    }
  });
  return (s.page = page);
}

export async function openWebsite(raw: string) {
  const url = normaliseUrl(raw);
  set({ status: "opening", url, title: undefined, message: undefined, selection: null });
  try {
    const page = await ensurePage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.bringToFront();
    set({ status: "open", url: page.url(), title: await page.title() });
  } catch (e) {
    set({ status: "error", message: friendlyError(e) });
  }
}

function onPageEvent(ev: PageEvent) {
  switch (ev.type) {
    case "ready":
      return { inspecting: s.snap.inspecting }; // keeps selection mode on across page changes
    case "mode":
      return set({ inspecting: ev.inspecting });
    case "clear":
      return set({ selection: null });
    case "select": {
      const id = ++s.seq;
      set({ selection: { ...ev.info, id } });
      void capture(id); // not awaited: the page is still waiting on this callback
    }
  }
}

type PdiWindow = { __pdi: { selected: Element; showOverlay(v: boolean): void } };

// Only update the selection if the user hasn't picked something else meanwhile.
function patchSelection(id: number, patch: Partial<Selection>) {
  if (s.snap.selection?.id === id) set({ selection: { ...s.snap.selection, ...patch } });
}

/** Reads the selected element's design, then takes a screenshot of just that element. */
async function capture(id: number) {
  const page = s.page;
  if (!page) return;
  const handle = await page.evaluateHandle(() => (window as unknown as PdiWindow).__pdi.selected).catch(() => null);
  const el = handle?.asElement();
  try {
    if (!el) return;
    try {
      patchSelection(id, { design: await el.evaluate(extractDesign) });
    } catch {
      patchSelection(id, { designFailed: true });
    }
    await page.evaluate(() => (window as unknown as PdiWindow).__pdi.showOverlay(false));
    const png = await el
      .screenshot({ timeout: 5_000 })
      .finally(() => page.evaluate(() => (window as unknown as PdiWindow).__pdi.showOverlay(true)));
    patchSelection(id, { screenshot: `data:image/png;base64,${png.toString("base64")}` });
  } catch {
    // Element vanished or is off-screen: the selection still works, just without a preview.
  } finally {
    await handle?.dispose().catch(() => undefined);
  }
}

/** Selects the first element matching a CSS address. Returns false when nothing matches. */
export async function selectBySelector(css: string): Promise<boolean> {
  const page = s.page;
  if (!page) throw new Error("Open a website first.");
  const result = await page
    .evaluate((c) => {
      const api = (window as unknown as { __pdi?: { selectCss?(c: string): boolean } }).__pdi;
      return typeof api?.selectCss === "function" ? api.selectCss(c) : "outdated";
    }, css)
    .catch(() => false);
  if (result === "outdated") throw new Error("This page was opened before an app update. Close the website and explore it again.");
  return result;
}

export async function runCommand(cmd: Command) {
  const page = s.page;
  if (!page) throw new Error("Open a website first.");
  if (cmd === "motion") {
    const sel = s.snap.selection;
    if (!sel) throw new Error("Select something first.");
    if (sel.motionStatus !== "running") void exploreMotion(sel.id); // takes a few seconds; results arrive live
    return;
  }
  if (cmd === "inspect-on" || cmd === "inspect-off") {
    const on = cmd === "inspect-on";
    set({ inspecting: on });
    if (on) await page.bringToFront();
  }
  await page
    .evaluate(([c, on]) => {
      const api = (window as unknown as { __pdi?: Record<string, (v?: boolean) => void> }).__pdi;
      if (!api) return;
      if (c.startsWith("inspect")) api.setInspecting(on as boolean);
      else api[c as string]();
    }, [cmd, s.snap.inspecting] as const)
    .catch(() => undefined); // page mid-navigation: the "ready" handshake restores the mode
}

export type Interaction = { changes: Change[]; animations: Anim[] };

export type Motion = {
  running: Anim[]; // already moving while nobody touches it
  scriptedIdle: boolean; // moves, but not through an animation the browser can describe
  transitions: Declared[]; // smooth changes the element is set up for
  hover: Interaction | null;
  focus: Interaction | null; // null: can't be focused
  scroll: (Interaction & { scripted: boolean }) | null; // null: visible from the start, so it can't be tested
  scrollTimelines: string[];
};

const MOVE_PROPS = ["transform", "translate", "scale", "rotate", "opacity"];

/**
 * Watches the selected element: at rest, hovered, focused and scrolled into view.
 * Everything reported was seen happening on the page. Clicks are never tested, so the site can't navigate away.
 */
async function exploreMotion(id: number) {
  const page = s.page;
  if (!page) return;
  patchSelection(id, { motion: undefined, motionStatus: "running" });
  const handle = await page.evaluateHandle(() => (window as unknown as PdiWindow).__pdi.selected).catch(() => null);
  const el = handle?.asElement();
  try {
    if (!el) throw new Error("Selection is gone");
    const photo = () => el.evaluate(motionState);
    const wait = (ms: number) => page.waitForTimeout(ms);
    // Not Playwright's scrollIntoViewIfNeeded: it waits for movement to stop, and a looping animation never does.
    await el.evaluate((e) => e.scrollIntoView({ block: "nearest", behavior: "instant" }));
    // A screen corner outside the element, to rest the mouse on.
    const away = async () => {
      const b = await el.boundingBox();
      const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
      const corners = [[w - 2, h - 2], [2, h - 2], [w - 2, 2], [2, 2]];
      const free = corners.find(([x, y]) => !b || x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) ?? corners[0];
      await page.mouse.move(free[0], free[1]);
    };
    // The click that selected it leaves the mouse on top of it; start from a true resting state.
    await away();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await wait(400);

    const rest = await photo();
    await wait(400);
    const rest2 = await photo();
    // Long enough for the slowest declared transition to finish (capped so it never feels stuck).
    const settle = Math.min(1500, Math.max(200, ...rest.transitions.map((t) => t.duration + t.delay))) + 100;

    let hover: Interaction | null = null;
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await wait(settle);
      const hovered = await photo();
      hover = { changes: diffStates(rest2, hovered), animations: newAnimations(rest2, hovered) };
      await away();
      await wait(settle);
    }

    let focus: Interaction | null = null;
    if (await el.evaluate((e) => e.matches("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])"))) {
      await el.focus();
      await wait(settle);
      const focused = await photo();
      focus = { changes: diffStates(rest2, focused), animations: newAnimations(rest2, focused) };
      await el.evaluate((e) => (e as HTMLElement).blur());
      await wait(settle);
    }

    // Scroll it just out of view below the screen, then back in, and watch what happens.
    let scroll: Motion["scroll"] = null;
    const hidden = await el.evaluate((e) => {
      const top = e.getBoundingClientRect().top + scrollY;
      if (top - innerHeight - 20 < 0) return false;
      scrollTo({ top: top - innerHeight - 20, behavior: "instant" });
      return true;
    });
    if (hidden) {
      await wait(500);
      const before = await photo();
      await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
      await wait(120);
      const entering = await photo();
      await wait(1300);
      const after = await photo();
      scroll = {
        changes: diffStates(before, after),
        animations: newAnimations(before, entering, after),
        scripted: entering.animations.length === 0 && diffStates(entering, after, MOVE_PROPS).length > 0,
      };
    } else {
      await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
    }

    patchSelection(id, {
      motionStatus: "done",
      motion: {
        running: rest.animations,
        scriptedIdle: rest.animations.length === 0 && diffStates(rest, rest2, MOVE_PROPS).length > 0,
        transitions: rest.transitions,
        hover,
        focus,
        scroll,
        scrollTimelines: rest.scrollTimelines,
      },
    });
  } catch {
    patchSelection(id, { motionStatus: "failed" });
  } finally {
    await handle?.dispose().catch(() => undefined);
  }
}

/** A frozen copy of the current selection, plus what was already measured about it. */
export async function captureForRecreation() {
  const page = s.page;
  const sel = s.snap.selection;
  if (!page || !sel) throw new Error("Select something first.");
  if (!sel.design) throw new Error("Its design is still being read. Try again in a moment.");
  const handle = await page.evaluateHandle(() => (window as unknown as PdiWindow).__pdi.selected).catch(() => null);
  const el = handle?.asElement();
  try {
    if (!el) throw new Error("The selected element is gone. Select it again.");
    return { sel: { ...sel, design: sel.design }, url: s.snap.url, snapshot: await el.evaluate(snapshotElement) };
  } finally {
    await handle?.dispose().catch(() => undefined);
  }
}

/** Where the selection lives: the page's address and a CSS address for the element. */
export async function selectionAddress() {
  const page = s.page;
  if (!page || !s.snap.selection || !s.snap.url) throw new Error("Select something first.");
  const handle = await page.evaluateHandle(() => (window as unknown as PdiWindow).__pdi.selected).catch(() => null);
  const el = handle?.asElement();
  try {
    if (!el) throw new Error("The selected element is gone. Select it again.");
    return { url: s.snap.url, path: await el.evaluate(pathOf) };
  } finally {
    await handle?.dispose().catch(() => undefined);
  }
}

export async function closeWebsite() {
  await s.browser?.close();
}
