// One-step start for people who downloaded Plax: installs what's missing the first time, builds the
// app and the Chrome extension, then runs Plax on this computer only (127.0.0.1) and opens it.
// Everything you save stays in the data/ folder next to this file.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 3000);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const say = (s) => console.log(`\n▸ ${s}`);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\n✖ "${cmd} ${args.join(" ")}" failed. Check your internet connection and run Plax again.`);
    process.exit(1);
  }
};

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`✖ Plax needs Node.js 22.18 or newer (you have ${process.versions.node}). Get the LTS version from https://nodejs.org and run Plax again.`);
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const marker = path.join(root, "node_modules", ".plax-ready");
if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8") !== version) {
  say("First start: installing Plax. This takes a few minutes, once.");
  run(npm, ["ci", "--no-audit", "--no-fund"]);
  say("Installing the browser Plax uses to analyse websites…");
  run(npx, ["playwright", "install", "chromium"]);
  say("Building the app and the Chrome extension…");
  run(npm, ["run", "build"]);
  run(npm, ["run", "extension:build"]);
  fs.writeFileSync(marker, version);
}

const busy = await new Promise((ok) => {
  const s = net.connect(port, "127.0.0.1", () => (s.end(), ok(true))).on("error", () => ok(false));
});
const url = `http://localhost:${port}`;
if (busy) {
  console.error(`✖ Something is already using port ${port}. If Plax is already running, open ${url}. Otherwise close the other program and try again.`);
  process.exit(1);
}

say(`Plax is starting at ${url}`);
console.log(`  Chrome extension folder (Load unpacked): ${path.join(root, "dist", "extension")}`);
console.log("  Your library is saved in:", path.join(root, "data"));
console.log("  Keep this window open while you use Plax. Close it to stop.\n");

const app = spawn(npm, ["run", "start", "--", "--port", String(port)], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
app.on("exit", (code) => process.exit(code ?? 0));
// Open the browser once the app answers.
for (let i = 0; i < 60; i++) {
  if (await fetch(url).then(() => true, () => false)) {
    const opener = { darwin: ["open", [url]], win32: ["cmd", ["/c", "start", "", url]] }[process.platform] ?? ["xdg-open", [url]];
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
