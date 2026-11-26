// The Plax side panel: selection mode, the list of captures, and each capture's details.
// Built with DOM calls only (never innerHTML): page text ends up here, and this page has extension rights.
import type { Capture, FromContent, Rect, ToContent } from "./shared";
import { describeLayout } from "../../src/lib/inspector/describe";

// ---------- State ----------

type Op =
  | { t: "add"; id: string }
  | { t: "remove"; capture: Capture; at: number }
  | { t: "replace"; before: Capture; at: number }
  | { t: "clear"; captures: Capture[] }
  | { t: "move"; from: number; to: number };
type Session = { captures: Capture[]; undo: Op[]; analyses?: Record<string, string> }; // analyses: page address → visit id
type Settings = { app: string; token?: string; paired?: boolean };
type View = { name: "main" } | { name: "detail"; id: string; tab: "design" | "copy" } | { name: "settings" };

let session: Session = { captures: [], undo: [] };
let settings: Settings = { app: "http://localhost:3000" };
let saving: string | null = null; // id of the capture being saved
let view: View = { name: "main" };
let selecting = false;
let target: chrome.Tab | undefined; // the website tab this panel works on
let notice: { text: string; error?: boolean; allowAll?: boolean } | undefined;

const app = document.getElementById("app")!;
const UNDO_LIMIT = 30;

async function persist() {
  try {
    await chrome.storage.local.set({ session });
  } catch {
    notice = { text: "Plax's storage is full. Save or remove some selections, then try again.", error: true };
    render();
  }
}

/** Every change to the list goes through here, so it can be undone. */
function change(op: Op, apply: () => void) {
  apply();
  session.undo = [...session.undo, op].slice(-UNDO_LIMIT);
  void persist();
  void sendMarks();
  render();
}

function undo() {
  const op = session.undo.pop();
  if (!op) return;
  const list = session.captures;
  if (op.t === "add") session.captures = list.filter((c) => c.id !== op.id);
  if (op.t === "remove") list.splice(op.at, 0, op.capture);
  if (op.t === "replace") list.splice(op.at, 1, op.before);
  if (op.t === "clear") session.captures = op.captures;
  if (op.t === "move") list.splice(op.from, 0, ...list.splice(op.to, 1));
  void persist();
  void sendMarks();
  render();
}

// ---------- The website tab ----------

/** The active website tab in this window (when the panel is opened as a page, e.g. in tests: any window's). */
async function findTarget() {
  const own = await chrome.tabs.getCurrent().catch(() => undefined);
  const mine = (t: chrome.Tab) => t.id !== own?.id && !t.url?.startsWith(chrome.runtime.getURL(""));
  const here = (await chrome.tabs.query({ active: true, currentWindow: true })).filter(mine);
  target = here[0] ?? (await chrome.tabs.query({ active: true })).filter(mine)[0];
  render();
}

const toTab = (m: ToContent) => (target?.id === undefined ? Promise.reject(new Error("no tab")) : chrome.tabs.sendMessage(target.id, m));

/** Puts Plax's selection layer on the page if it isn't there yet. */
async function connectPage(): Promise<boolean> {
  if (target?.id === undefined) return false;
  try {
    await toTab({ type: "plax:ping" });
    return true;
  } catch {
    // not on the page yet
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: target.id }, files: ["content.js"] });
    return true;
  } catch {
    const restricted =
      !target.url || /^(chrome|edge|about|chrome-extension|devtools):/.test(target.url) || /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(target.url);
    notice = restricted
      ? { text: "Chrome doesn't let extensions work on this page. Open a website in this tab.", error: true }
      : {
          text: "Plax needs permission for this page. Click the Plax button in Chrome's toolbar once, or let Plax work on every website.",
          error: true,
          allowAll: true,
        };
    return false;
  }
}

async function setSelecting(on: boolean) {
  notice = undefined;
  if (on && !(await connectPage())) return render();
  await toTab({ type: "plax:mode", on }).catch(() => undefined);
  selecting = on;
  if (on) void sendMarks();
  render();
}

const sendMarks = () => toTab({ type: "plax:marks", ids: session.captures.map((c) => c.id) }).catch(() => undefined);

// ---------- Pictures ----------

/** Photographs the visible tab and cuts out the element. Elements bigger than the screen get their visible part. */
async function photograph(windowId: number, rect: Rect, viewport: { width: number; height: number }) {
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
  const k = bitmap.width / viewport.width; // screen pixels per page pixel (retina, zoom)
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(viewport.width, rect.x + rect.width);
  const y1 = Math.min(viewport.height, rect.y + rect.height);
  if (x1 - x0 < 1 || y1 - y0 < 1) return {};
  const partial = x0 > rect.x + 1 || y0 > rect.y + 1 || x1 < rect.x + rect.width - 1 || y1 < rect.y + rect.height - 1;
  const [sw, sh] = [(x1 - x0) * k, (y1 - y0) * k];
  const fit = Math.min(1, 1600 / sw); // keeps stored pictures small
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(sw * fit)), Math.max(1, Math.round(sh * fit)));
  canvas.getContext("2d")!.drawImage(bitmap, x0 * k, y0 * k, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const screenshot = await new Promise<string>((done) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.readAsDataURL(blob);
  });
  return { screenshot, partial };
}

chrome.runtime.onMessage.addListener((msg: FromContent, sender, reply) => {
  if (msg.type === "plax:mode") {
    selecting = msg.on;
    render();
    return;
  }
  if (msg.type !== "plax:found" || !sender.tab) return;
  void (async () => {
    const capture = msg.capture;
    try {
      Object.assign(capture, await photograph(sender.tab!.windowId, msg.rect, msg.viewport));
    } catch {
      notice = { text: "The picture couldn't be taken (Chrome allows two a second). Everything else was captured.", error: true };
    }
    reply(); // the page can show its outlines again
    const list = session.captures;
    const newest = list.length - 1;
    if (msg.replace && newest >= 0 && list[newest].url === capture.url)
      change({ t: "replace", before: list[newest], at: newest }, () => list.splice(newest, 1, capture));
    else change({ t: "add", id: capture.id }, () => list.push(capture));
  })();
  return true; // replying later
});

chrome.tabs.onActivated.addListener(() => {
  if (selecting) void toTab({ type: "plax:mode", on: false }).catch(() => undefined);
  selecting = false;
  void findTarget();
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId !== target?.id) return;
  target = tab;
  // A new page in the same tab: put the selection layer back if selection was on.
  if (info.status === "complete" && selecting) void setSelecting(true);
  else render();
});

// ---------- The Plax app ----------

const APP_ADDRESS = /^http:\/\/localhost(:\d{1,5})?$/; // the extension may only talk to this computer

/** Calls the paired app. Throws with a message a person can act on. */
async function callApp(path: "pair" | "save", body: unknown) {
  let res: Response;
  try {
    res = await fetch(`${settings.app}/api/captures/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-plax-token": settings.token ?? "" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`The Plax app isn't answering at ${settings.app}. Start it (npm run dev in its folder), then try again.`);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (res.status === 403) {
    settings.paired = false;
    void chrome.storage.local.set({ settings });
  }
  if (!res.ok) throw new Error(json.error ?? `The Plax app answered with an error (${res.status}).`);
  return json;
}

async function connect(app: string, code: string) {
  app = app.trim().replace(/\/+$/, "");
  if (!APP_ADDRESS.test(app)) {
    notice = { text: "The app's address must be on this computer, like http://localhost:3000.", error: true };
    return render();
  }
  settings = { app, token: code.trim(), paired: false };
  try {
    await callApp("pair", {});
    settings.paired = true;
    notice = { text: "Connected. Saved selections now go to your Plax Library." };
  } catch (e) {
    notice = { text: (e as Error).message, error: true };
  }
  await chrome.storage.local.set({ settings });
  render();
}

async function save(c: Capture) {
  if (!settings.paired) {
    notice = { text: "Connect the extension to the Plax app first: open Settings here and paste the code from the app's Settings.", error: true };
    return render();
  }
  saving = c.id;
  notice = undefined;
  render();
  try {
    const analyses = (session.analyses ??= {});
    const { id } = await callApp("save", { analysisId: (analyses[c.url] ??= crypto.randomUUID()), capture: c });
    c.saved = { id: id!, at: new Date().toISOString() };
    notice = { text: `Saved “${c.name}” to your Library.` };
    await persist();
  } catch (e) {
    notice = { text: (e as Error).message, error: true };
  } finally {
    saving = null;
    render();
  }
}

const openInApp = (path: string) => void chrome.tabs.create({ url: `${settings.app}${path}` });

// ---------- Building the page ----------

type Child = Node | string | false | null | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "style") Object.assign(el.style, v);
    else if (k in el && k !== "list") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
const btn = (label: Child, onClick: () => void, cls = "btn", extra: Record<string, unknown> = {}) => h("button", { type: "button", className: cls, onClick, ...extra }, label);
const hostOf = (u?: string) => {
  try {
    return new URL(u ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function render() {
  const focusId = (document.activeElement as HTMLElement | null)?.dataset?.focus;
  app.replaceChildren(header(), view.name === "detail" ? detail(view) : view.name === "settings" ? settingsView() : main());
  if (focusId) (app.querySelector(`[data-focus="${CSS.escape(focusId)}"]`) as HTMLElement | null)?.focus(); // keyboard users keep their place
}

function header() {
  const logo = h("span", { className: "logo" }, h("img", { src: "icons/icon-32.png", alt: "" }), "plax");
  const title = view.name === "settings" && h("strong", { style: { marginRight: "auto" } }, "Settings");
  return h(
    "header",
    {},
    view.name === "main" ? logo : btn("← Back", () => ((view = { name: "main" }), render()), "btn ghost", { "data-focus": "back" }),
    title,
    h("span", { className: "status" }, h("span", { className: `dot${settings.paired ? " on" : ""}`, "aria-hidden": "true" }), settings.paired ? "Connected" : "Not connected"),
    view.name === "main" && btn("Settings", () => ((view = { name: "settings" }), render()), "btn ghost", { "data-focus": "settings" }),
  );
}

function noticeBox() {
  if (!notice) return null;
  const n = notice;
  return h(
    "div",
    { className: `notice${n.error ? " error" : ""}`, role: n.error ? "alert" : "status" },
    h("p", {}, n.text),
    n.allowAll && h("p", { style: { marginTop: "6px" } }, btn("Allow Plax on every website", allowAll, "link")),
  );
}

async function allowAll() {
  // Optional permission: asked only when the person chooses it, and can be taken back in Settings.
  const ok = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
  notice = ok ? { text: "Done. Plax can now work on any website you open." } : { text: "Permission wasn't given.", error: true };
  if (ok && view.name === "main") await setSelecting(true);
  else render();
}

function main() {
  const list = session.captures;
  const page = h(
    "section",
    { className: "card", "aria-label": "This page" },
    target?.url
      ? h("div", {}, h("div", { className: "truncate" }, h("strong", {}, target.title || hostOf(target.url))), h("div", { className: "muted small truncate" }, target.url))
      : h("p", { className: "muted" }, "Open a website in this tab to start."),
    btn(selecting ? "Stop selecting" : "Start selecting", () => void setSelecting(!selecting), `btn big ${selecting ? "accent" : "primary"}`, {
      "aria-pressed": String(selecting),
      "data-focus": "toggle",
      disabled: !target?.url,
    }),
    h(
      "p",
      { className: "muted small" },
      selecting
        ? "Hover to preview, click to add. Plax picks the whole component (a card rather than its title); hold Alt (Option) to pick exactly what's under the pointer. Press Esc to stop."
        : "Select as many parts of the page as you like: navigation, hero, buttons, cards.",
    ),
    selecting &&
      list.length > 0 &&
      h(
        "div",
        { className: "row", role: "group", "aria-label": "Adjust the newest selection" },
        btn("Larger area", () => void toTab({ type: "plax:step", step: "parent" }), "btn", { "data-focus": "parent" }),
        btn("Inside", () => void toTab({ type: "plax:step", step: "child" }), "btn", { "data-focus": "child" }),
        btn("Previous", () => void toTab({ type: "plax:step", step: "prev" }), "btn", { "data-focus": "prev" }),
        btn("Next", () => void toTab({ type: "plax:step", step: "next" }), "btn", { "data-focus": "next" }),
      ),
  );

  const toolbar = h(
    "div",
    { className: "row" },
    h("h2", { className: "grow", "aria-live": "polite" }, `${list.length} selected`),
    btn("Undo", undo, "btn", { disabled: !session.undo.length, "data-focus": "undo" }),
    btn(
      "Clear all",
      () => {
        if (list.length) change({ t: "clear", captures: list }, () => (session.captures = []));
      },
      "btn danger",
      { disabled: !list.length, "data-focus": "clear" },
    ),
  );

  const items = h(
    "ol",
    { className: "list", "aria-label": "Selections" },
    ...list.map((c, i) =>
      h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            className: "open",
            onClick: () => ((view = { name: "detail", id: c.id, tab: "design" }), render()),
            "data-focus": `open-${c.id}`,
            "aria-label": `Open ${i + 1}: ${c.name}`,
          },
          h("span", { className: "num", "aria-hidden": "true" }, String(i + 1)),
          h("span", { className: "thumb", style: c.screenshot ? { backgroundImage: `url("${c.screenshot}")` } : {} }),
          h(
            "span",
            { className: "grow" },
            h("span", { className: "truncate", style: { display: "block", fontWeight: "600" } }, c.name),
            h("span", { className: "muted small truncate", style: { display: "block" } }, `${c.label} · ${c.width} × ${c.height}${c.saved ? " · Saved" : ""}`),
          ),
        ),
        h(
          "span",
          { className: "tools" },
          btn("↑", () => move(i, i - 1), "btn icon ghost", { disabled: i === 0, "aria-label": `Move ${c.name} up`, "data-focus": `up-${c.id}` }),
          btn("↓", () => move(i, i + 1), "btn icon ghost", { disabled: i === list.length - 1, "aria-label": `Move ${c.name} down`, "data-focus": `down-${c.id}` }),
          btn("✕", () => change({ t: "remove", capture: c, at: i }, () => list.splice(i, 1)), "btn icon ghost", { "aria-label": `Remove ${c.name}` }),
        ),
      ),
    ),
  );

  return h("main", {}, noticeBox(), page, toolbar, list.length ? items : h("p", { className: "muted small" }, "Nothing selected yet."));
}

function move(from: number, to: number) {
  const list = session.captures;
  if (to < 0 || to >= list.length) return;
  change({ t: "move", from, to }, () => list.splice(to, 0, ...list.splice(from, 1)));
}

function detail(v: Extract<View, { name: "detail" }>) {
  const c = session.captures.find((x) => x.id === v.id);
  if (!c) {
    view = { name: "main" };
    return main();
  }
  const tabs = [
    ["design", "Design"],
    ["copy", "Live copy"],
  ] as const;
  return h(
    "main",
    {},
    noticeBox(),
    h(
      "section",
      { className: "card" },
      h("div", { className: "preview" }, c.screenshot ? h("img", { src: c.screenshot, alt: `Picture of the selected ${c.label.toLowerCase()}` }) : h("span", { className: "muted" }, "No picture")),
      c.partial && h("p", { className: "muted small" }, "It's bigger than the screen, so the picture shows the part that was visible."),
      h("label", { className: "small muted", htmlFor: "name" }, "Name"),
      h("input", {
        id: "name",
        className: "text",
        value: c.name,
        maxLength: 120,
        onChange: (e: Event) => {
          c.name = (e.target as HTMLInputElement).value.trim() || c.name;
          void persist();
        },
      }),
      h("p", { className: "muted small truncate" }, [c.label, `${c.width} × ${c.height}`, hostOf(c.url)].join(" · ")),
      c.note && h("p", { className: "notice error small" }, c.note),
      c.saved
        ? h("div", { className: "row" }, h("span", { className: "grow" }, "✓ Saved to your Library"), btn("Open in Library", () => openInApp(`/library/${c.saved!.id}`), "btn", { "data-focus": "open-app" }))
        : btn(saving === c.id ? "Saving…" : "Save to Library", () => void save(c), "btn big accent", { disabled: saving === c.id, "data-focus": "save" }),
    ),
    h(
      "div",
      { role: "tablist", "aria-label": "Details" },
      ...tabs.map(([key, label]) =>
        h(
          "button",
          { type: "button", role: "tab", "aria-selected": String(v.tab === key), "data-focus": `tab-${key}`, onClick: () => ((view = { ...v, tab: key }), render()) },
          label,
        ),
      ),
    ),
    h("section", { role: "tabpanel", className: "card" }, v.tab === "design" ? designFacts(c) : liveCopy(c)),
  );
}

function designFacts(c: Capture) {
  const d = c.design;
  if (!d) return h("p", { className: "muted" }, "This element's design couldn't be read. Its picture and copy were still captured.");
  const colour = (x: { hex: string; alpha: number } | null) => (x ? `${x.hex}${x.alpha < 1 ? ` at ${Math.round(x.alpha * 100)}%` : ""}` : "None");
  const t = d.typography;
  const m = c.motion;
  const rows: [string, string][] = [
    ["Background", colour(d.appearance.background ?? d.appearance.sitsOn)],
    ["Text colour", colour(d.appearance.text)],
    ["Font", `${t.family}, ${Math.round(t.size)}px, weight ${t.weight}`],
    ["Line height", t.lineHeight],
    ["Layout", describeLayout(d.layout)],
    ["Inside space", d.layout.padding.map((n) => `${Math.round(n)}`).join(" ") + " px"],
    ["Corners", d.appearance.radius],
    ["Shadow", d.appearance.shadow ?? "None"],
    ["Motion", m.running.length || m.transitions.length ? `${m.running.length} running on its own, ${m.transitions.length} smooth changes set up` : "Nothing running on its own"],
  ];
  return h(
    "div",
    { style: { display: "grid", gap: "10px" } },
    h("dl", { className: "facts" }, ...rows.flatMap(([k, val]) => [h("dt", {}, k), h("dd", {}, val)])),
    d.palette.length > 0 &&
      h(
        "div",
        {},
        h("h2", {}, "Colours"),
        h("div", { className: "swatches" }, ...d.palette.slice(0, 16).map((p) => h("span", { className: "swatch", title: p.hex, style: { background: p.hex } }))),
      ),
    h("p", { className: "muted small" }, "Hover and scroll effects aren't tested here: extensions can't move your mouse. Analyse Website in the Plax app tests them."),
  );
}

function liveCopy(c: Capture) {
  return h(
    "div",
    { style: { display: "grid", gap: "6px" } },
    // No permissions at all: the copy can't run scripts or reach this panel.
    h("iframe", { className: "live", title: `Live copy of ${c.name}`, sandbox: "", srcdoc: c.html }),
    h(
      "p",
      { className: "muted small" },
      `An exact copy made from what was measured${c.truncated ? " (very large, so only its first 600 parts)" : ""}. Links don't go anywhere and the website's scripts are removed.`,
    ),
  );
}

function settingsView() {
  const app = h("input", { id: "app-address", className: "text", value: settings.app, autocomplete: "off", spellcheck: false });
  const code = h("input", { id: "pair-code", className: "text", placeholder: "plax-…", autocomplete: "off", spellcheck: false });
  return h(
    "main",
    {},
    noticeBox(),
    h(
      "form",
      {
        className: "card",
        "aria-label": "Connect to the Plax app",
        onSubmit: (e: Event) => {
          e.preventDefault();
          void connect(app.value, code.value);
        },
      },
      h("h2", {}, "Plax app"),
      h(
        "p",
        { className: "muted small" },
        settings.paired
          ? `Connected to ${settings.app}. Saved selections go to its Library.`
          : "To save selections to your Library, start the Plax app, open its Settings, choose Connect the extension, and paste the code here.",
      ),
      h("label", { className: "small muted", htmlFor: "app-address" }, "App address"),
      app,
      h("label", { className: "small muted", htmlFor: "pair-code" }, settings.paired ? "New code (only to reconnect)" : "Code from the app"),
      code,
      h(
        "div",
        { className: "row" },
        h("button", { type: "submit", className: "btn primary" }, settings.paired ? "Reconnect" : "Connect"),
        settings.paired &&
          btn("Disconnect", async () => {
            settings = { app: settings.app };
            await chrome.storage.local.set({ settings });
            notice = { text: "Disconnected. Selections stay here until you clear them." };
            render();
          }),
        btn("Open Plax", () => openInApp("/library"), "btn ghost"),
      ),
    ),
    h(
      "section",
      { className: "card" },
      h("h2", {}, "Websites"),
      h(
        "p",
        { className: "muted small" },
        "By default Plax only works on a page after you click its toolbar button there. You can let it work on every website instead, and take that back here.",
      ),
      h(
        "div",
        { className: "row" },
        btn("Allow on every website", allowAll),
        btn("Only when I click Plax", async () => {
          await chrome.permissions.remove({ origins: ["<all_urls>"] }).catch(() => false);
          notice = { text: "Plax now works only on pages where you click its toolbar button." };
          render();
        }),
      ),
    ),
  );
}

// ---------- Start ----------

void (async () => {
  const stored = await chrome.storage.local.get(["session", "settings"]);
  if (stored.session) session = stored.session as Session;
  if (stored.settings) settings = stored.settings as Settings;
  await findTarget();
})();
