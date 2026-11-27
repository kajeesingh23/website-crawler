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

const ext = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const fromExt = { ...base, path: "/api/captures/save", origin: ext, secFetchSite: "none", secFetchMode: "cors" };

test("the paired extension may save captures, and nothing else", () => {
  const paired = { origin: ext, tokenValid: true };
  assert.equal(refuse(fromExt, paired), null);
  assert.match(refuse({ ...fromExt, path: "/api/session" }, paired)!, /paired Plax extension/, "only the captures API");
  assert.match(refuse({ ...fromExt, path: "/api/library/files/screenshots/x.png", method: "GET" }, paired)!, /paired Plax extension/);
  assert.match(refuse(fromExt, { origin: ext, tokenValid: false })!, /paired Plax extension/, "wrong or old code");
  assert.match(refuse(fromExt, null)!, /paired Plax extension/, "nothing paired");
  assert.match(refuse({ ...fromExt, origin: "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba" }, paired)!, /paired Plax extension/, "another extension");
  assert.match(refuse({ ...fromExt, host: "evil.example:3000" }, paired)!, /this computer/, "DNS rebinding still refused");
});

test("a new code is tied to the first extension that uses it", () => {
  const waiting = { origin: null, tokenValid: true };
  assert.equal(refuse({ ...fromExt, path: "/api/captures/pair" }, waiting), null);
  assert.match(refuse(fromExt, waiting)!, /paired Plax extension/, "must pair before saving");
});
