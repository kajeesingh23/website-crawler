// Builds the Plax Chrome extension into dist/extension (load it unpacked from there).
// With --zip, also packs it as dist/plax-extension-<version>.zip, ready for the Chrome Web Store.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "extension");
// --test: a separate build for automated tests that starts with access to every site, because tests
// can't click Chrome's toolbar button (which is what grants access to a page in real use).
const testBuild = process.argv.includes("--test");
const out = path.join(root, "dist", testBuild ? "extension-test" : "extension");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["background", "content", "sidepanel"].map((n) => ({ in: path.join(src, "src", `${n}.ts`), out: n })),
  bundle: true,
  format: "iife",
  target: "chrome116",
  outdir: out,
  legalComments: "none",
  logLevel: "warning",
});

for (const f of ["sidepanel.html", "sidepanel.css", "icons"]) fs.cpSync(path.join(src, f), path.join(out, f), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(src, "manifest.json"), "utf8"));
if (testBuild) manifest.host_permissions.push("<all_urls>");
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ ...manifest, version }, null, 2));
console.log(`Built the Plax extension ${version} in ${path.relative(root, out)}`);

if (process.argv.includes("--zip")) {
  const zip = path.join(root, "dist", `plax-extension-${version}.zip`);
  fs.rmSync(zip, { force: true });
  // shortcut: uses the system `zip` (macOS, Linux, CI); on Windows, zip dist/extension by hand.
  execFileSync("zip", ["-qr", "-X", zip, "."], { cwd: out });
  console.log(`Packed ${path.relative(root, zip)}`);
}
