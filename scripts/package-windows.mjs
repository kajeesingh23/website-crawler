// Makes dist/Plax-Setup-<version>.exe with NSIS (makensis), from the files in the last Git commit:
// never your data/ library, database or keys. Runs wherever NSIS is installed; the release workflow
// builds it on GitHub's Windows machines.
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const stage = path.join(root, "dist", "windows", "app");
fs.rmSync(path.dirname(stage), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

execSync(`git archive --format=tar HEAD | tar -x -C "${stage}"`, { cwd: root, stdio: "inherit" });
fs.copyFileSync(path.join(root, "installer", "windows", "Plax.bat"), path.join(stage, "Plax.bat"));
execFileSync(process.execPath, [path.join(root, "scripts", "icons.mjs")], { stdio: "inherit" });

const makensis = ["makensis", "C:\\Program Files (x86)\\NSIS\\makensis.exe", "C:\\Program Files\\NSIS\\makensis.exe"].find((m) => {
  try {
    execFileSync(m, ["-VERSION"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (!makensis) throw new Error("NSIS isn't installed. Get it from https://nsis.sourceforge.io (Windows), or let the release workflow build the installer.");

const out = path.join(root, "dist", `Plax-Setup-${version}.exe`);
execFileSync(makensis, [
  "-V2",
  `-DVERSION=${version}`,
  `-DSRC=${stage}`,
  `-DICON=${path.join(root, "dist", "icons", "plax.ico")}`,
  `-DOUT=${out}`,
  path.join(root, "installer", "windows", "plax.nsi"),
], { stdio: "inherit" });
console.log(`Made ${path.relative(root, out)}`);
