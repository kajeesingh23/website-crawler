// Makes dist/plax-<version>.zip: a copy of Plax anyone can download, unzip and double-click to start.
// Built with `git archive` from the last commit, so only files in Git go in: never your data/ library,
// screenshots, database, .env keys or uncommitted work.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });

const guide = path.join(dist, "START HERE.txt");
fs.writeFileSync(guide, `Plax ${version}: your personal design library. It runs only on your computer.

1. Install Node.js (the LTS version) from https://nodejs.org if you don't have it.
2. Start Plax:
   - Mac: right-click "Start Plax.command" and choose Open (the first time; after that, double-click).
   - Windows: double-click "Start Plax.bat".
   The first start installs everything and takes a few minutes. Plax then opens in your browser.
   Keep the window that appears open while you use Plax.
3. Add the Chrome extension (optional, once):
   open chrome://extensions, turn on Developer mode, click "Load unpacked"
   and choose the "dist/extension" folder inside this folder.
   To connect it, in Plax go to Settings > Connect the extension and paste the code into the extension.

Everything you save stays in the "data" folder here. Keep that folder if you move or update Plax.
`);

const zip = path.join(dist, `plax-${version}.zip`);
fs.rmSync(zip, { force: true });
execFileSync("git", ["archive", "--format=zip", `--prefix=plax-${version}/`, `--add-file=${guide}`, "-o", zip, "HEAD"], { cwd: root });
fs.rmSync(guide);
console.log(`Packed ${path.relative(root, zip)} from commit ${execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim()}`);
