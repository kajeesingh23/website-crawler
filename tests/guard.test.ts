import { test } from "node:test";
import assert from "node:assert/strict";
import { refuse } from "../src/lib/guard.ts";

const base = { method: "POST", path: "/api/session", host: "localhost:3000", origin: "http://localhost:3000", secFetchSite: "same-origin", secFetchMode: "cors" };

test("the app's own pages get through", () => {
  assert.equal(refuse(base), null);
  assert.equal(refuse({ ...base, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }), null);
  assert.equal(refuse({ ...base, method: "GET", origin: null, secFetchSite: null, secFetchMode: null }), null, "tools like curl on this computer");
  assert.equal(refuse({ ...base, method: "GET", path: "/board", origin: null, secFetchSite: "cross-site", secFetchMode: "navigate" }), null, "following a link to the app");
});

test("other websites, devices and tricks are refused", () => {
  assert.match(refuse({ ...base, origin: "https://evil.example" })!, /other websites/);
  assert.match(refuse({ ...base, origin: "null" })!, /other websites/, "sandboxed frames");
  assert.match(refuse({ ...base, method: "GET", path: "/api/library/files/screenshots/x.png", origin: null, secFetchSite: "cross-site", secFetchMode: "no-cors" })!, /other websites/);
  assert.match(refuse({ ...base, host: "192.168.0.84:3000", origin: "http://192.168.0.84:3000" })!, /this computer/, "another device on the network");
  assert.match(refuse({ ...base, host: "evil.example:3000", origin: "http://evil.example:3000" })!, /this computer/, "DNS rebinding");
  assert.match(refuse({ ...base, host: null })!, /this computer/);
});
