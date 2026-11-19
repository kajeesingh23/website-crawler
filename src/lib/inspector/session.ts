import { chromium, type Browser, type Page } from "playwright";
import { EventEmitter } from "node:events";
import { overlay, type ElementInfo, type PageEvent } from "./overlay.ts";
import { recordWebsite } from "../db.ts";
import { normaliseUrl } from "../url.ts";
import { extractDesign, type Design } from "./extract.ts";

export type Selection = ElementInfo & { id: number; screenshot?: string; design?: Design; designFailed?: boolean };

export type Snapshot = {
  status: "idle" | "opening" | "open" | "closed" | "error";
  url?: string;
  title?: string;
  message?: string;
  inspecting: boolean;
  selection: Selection | null;
};

export const COMMANDS = ["parent", "child", "next", "prev", "clear", "inspect-on", "inspect-off"] as const;
export type Command = (typeof COMMANDS)[number];

type Session = { browser?: Browser; page?: Page; snap: Snapshot; bus: EventEmitter; seq: number };

// Kept on globalThis so the browser survives dev-server hot reloads.
const g = globalThis as typeof globalThis & { __pdiSession?: Session };
const s: Session = (g.__pdiSession ??= {
  snap: { status: "idle", inspecting: false, selection: null },
  bus: new EventEmitter(),
  seq: 0,
});

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

export async function runCommand(cmd: Command) {
  const page = s.page;
  if (!page) throw new Error("Open a website first.");
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

export async function closeWebsite() {
  await s.browser?.close();
}
