// Makes dist/Plax-<version>.dmg (Mac only): Plax.app plus an Applications shortcut to drag it onto.
// The app holds the files from the last Git commit (never your data/ library, database or keys).
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (process.platform !== "darwin") throw new Error("The DMG can only be made on a Mac.");
const root = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const stage = path.join(root, "dist", "mac");
const contents = path.join(stage, "Plax.app", "Contents");
const res = path.join(contents, "Resources");
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(res, "app"), { recursive: true });
fs.mkdirSync(path.join(contents, "MacOS"));

execSync(`git archive --format=tar HEAD | tar -x -C "${path.join(res, "app")}"`, { cwd: root });
fs.writeFileSync(path.join(res, "version"), version);
execFileSync("node", [path.join(root, "scripts", "icons.mjs")], { stdio: "inherit" });
fs.copyFileSync(path.join(root, "dist", "icons", "plax.icns"), path.join(res, "plax.icns"));
fs.copyFileSync(path.join(root, "installer", "mac", "Plax"), path.join(contents, "MacOS", "Plax"));
fs.chmodSync(path.join(contents, "MacOS", "Plax"), 0o755);
fs.writeFileSync(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Plax</string>
  <key>CFBundleDisplayName</key><string>Plax</string>
  <key>CFBundleIdentifier</key><string>app.plax.desktop</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Plax</string>
  <key>CFBundleIconFile</key><string>plax</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict></plist>
`);
fs.symlinkSync("/Applications", path.join(stage, "Applications"));
fs.writeFileSync(path.join(stage, "START HERE.txt"), `Plax ${version}: your personal design library. It runs only on your computer.

1. Drag Plax onto Applications.
2. Install Node.js (the LTS version) from https://nodejs.org if you don't have it.
3. Open Plax from Applications. The first time, macOS says it can't check the app:
   click Done, open System Settings > Privacy & Security, scroll down and click "Open Anyway".
   (On older macOS: right-click Plax > Open.)
4. A Terminal window opens. The first start installs everything (a few minutes, once),
   then Plax opens in your browser. Keep that window open while you use Plax.

Your library is saved in ~/Library/Application Support/Plax/data. Updating Plax keeps it.
The Chrome extension's folder is shown in the Terminal window (use it with "Load unpacked").
`);

const dmg = path.join(root, "dist", `Plax-${version}.dmg`);
fs.rmSync(dmg, { force: true });
execFileSync("hdiutil", ["create", "-volname", `Plax ${version}`, "-srcfolder", stage, "-format", "UDZO", "-ov", dmg], { stdio: "inherit" });
console.log(`Made ${path.relative(root, dmg)}`);
