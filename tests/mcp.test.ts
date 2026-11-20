// The MCP server, started and called by a real MCP client, against a throwaway library.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

process.env.PDI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pdi-mcp-"));
const { saveComponent, saveItem } = await import("../src/lib/db.ts");
const L = await import("../src/lib/library.ts");

const design = {
  appearance: { background: { hex: "#111111", alpha: 1 }, sitsOn: null, text: { hex: "#ffffff", alpha: 1 }, border: null, radius: "999px", shadow: null, gradient: null, opacity: 1 },
  typography: { family: "Inter", stack: "Inter, sans-serif", size: 15, weight: "600", lineHeight: "22.5px", letterSpacing: "normal", align: "center", decoration: null, transform: null, italic: false, webFont: true },
  layout: { width: 140, height: 44, padding: [12, 24, 12, 24], margin: [0, 0, 0, 0], border: [0, 0, 0, 0], display: "inline-flex", position: "static", direction: "row", justify: "center", alignItems: "center", wrap: "nowrap", gap: 8, columns: 0, rows: 0, minWidth: "auto", maxWidth: "none" },
  palette: [{ hex: "#111111", alpha: 1, count: 1, uses: ["background"] }],
  fonts: [{ family: "Inter", webFont: true }],
  assets: [{ kind: "svg", svg: "<svg/>", width: 16, height: 16 }],
  motion: { moving: 0, smooth: 1 },
};
const motion = {
  running: [], scriptedIdle: false, scrollTimelines: [], focus: null, scroll: null,
  transitions: [{ part: "Whole element", prop: "transform", duration: 200, delay: 0, easing: "ease-out" }],
  hover: { animations: [], changes: [{ part: "Whole element", prop: "transform", from: "none", to: "matrix(1, 0, 0, 1, 0, -2)" }] },
};
let button = "";
let client: Client;

before(async () => {
  button = saveComponent({
    name: "Magnetic button", html: "<!doctype html><html><body><button class=\"pdi-root\">Go</button></body></html>",
    react: "export function MagneticButton() { return <button>Go</button>; }",
    observed: { design, motion }, inferred: { source: "claude", confidence: 80 },
    png: Buffer.from("89504e470d0a1a0a", "hex"), // a PNG signature is enough for a preview
    category: "Button", tags: ["button", "hover", "cursor"], description: "Button that lifts on hover",
  });
  saveItem({ kind: "animation", name: "Scroll reveal", observed: { motion }, tags: ["scroll"] });
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["mcp/server.ts"], env: { ...process.env, PDI_DATA_DIR: process.env.PDI_DATA_DIR! } as Record<string, string>, stderr: "ignore" }));
});
after(async () => {
  await client?.close();
  fs.rmSync(process.env.PDI_DATA_DIR!, { recursive: true, force: true });
});

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { type: string; text?: string; data?: string }[]; isError?: boolean };
  return { ...r, text: r.content.find((c) => c.type === "text")?.text ?? "", json: () => JSON.parse(r.content[0].text!) };
};

test("Claude can find, open and reuse what's in the library", { timeout: 30_000 }, async () => {
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "add_to_collection", "compare_items", "find_similar", "get_animation", "get_assets", "get_code", "get_design_tokens",
    "get_item", "get_preview", "list_collections", "save_variation", "search_library", "update_item",
  ]);
  assert.ok(tools.filter((t) => t.name.startsWith("get_") || t.name.startsWith("search")).every((t) => t.annotations?.readOnlyHint), "reading tools are marked read-only");

  const found = (await call("search_library", { query: "Retrieve the magnetic button I saved" })).json();
  assert.equal(found[0].id, button);

  const it = (await call("get_item", { id: button })).json();
  assert.deepEqual([it.tokens.colours.background, it.tokens.typography.weight, it.tokens.spacing.inside], ["#111111", "Semibold (600)", "12px 24px 12px 24px"]);
  assert.deepEqual(it.motion.onHover, ["Whole element: Moves up 2px over 200ms, starts fast, slows down (ease-out)"]);

  assert.match((await call("get_code", { id: button, format: "react" })).text, /export function MagneticButton/);
  assert.match((await call("get_animation", { id: button })).text, /Moves up 2px/);
  assert.match((await call("get_design_tokens", { id: button })).text, /"corners": "999px"/);
  assert.match((await call("get_assets", { id: button })).text, /Check the licence/);
  const preview = await call("get_preview", { id: button });
  assert.equal(preview.content[1].type, "image");
  assert.equal((await call("compare_items", { ids: [button, L.listItems({ q: "scroll reveal" })[0].id] })).json().length, 2);

  const nope = await call("get_item", { id: "not-a-real-id" });
  assert.ok(nope.isError);
  assert.match(nope.text, /search_library/);
});

test("changes need the user's go-ahead and never alter the original", { timeout: 30_000 }, async () => {
  const unconfirmed = await call("save_variation", { source_id: button, name: "Navy button", html: "<html></html>", what_changed: "Navy" });
  assert.ok(unconfirmed.isError, "refused without confirmed: true");
  assert.equal(L.listItems().length, 2);

  const saved = (await call("save_variation", {
    source_id: button, name: "Navy button", html: "<!doctype html><html><body><button class=\"pdi-root\" style=\"background:#0b1f3a\">Go</button></body></html>",
    what_changed: "Dark navy background", confirmed: true,
  })).json();
  const v = L.getItem(saved.id)!;
  assert.deepEqual([v.name, v.tags.includes("variation"), v.code.html?.includes("#0b1f3a")], ["Navy button", true, true]);
  assert.equal(L.getItem(button)!.code.html?.includes("#0b1f3a"), false, "original unchanged");

  assert.ok((await call("update_item", { id: button, notes: "Use on portfolio", confirmed: true })).text.includes("updated"));
  assert.equal(L.getItem(button)!.notes, "Use on portfolio");

  const col = (await call("add_to_collection", { ids: [button, saved.id], new_collection_name: "Buttons", confirmed: true })).json();
  assert.deepEqual((await call("list_collections")).json().map((c: { name: string; count: number }) => [c.name, c.count]), [["Buttons", 2]]);
  assert.ok((await call("add_to_collection", { ids: [button], collection_id: "00000000-0000-0000-0000-000000000000", confirmed: true })).isError);
  assert.ok(col.collection_id);
});
