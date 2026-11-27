// Draws the Plax logo (src/app/icon.svg) as installer icons: dist/icons/plax.ico for Windows and,
// on a Mac, dist/icons/plax.icns. Rendered with Playwright, so no design tool is needed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "icons");
const svg = fs.readFileSync(path.join(root, "src", "app", "icon.svg"), "utf8");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const png = async (size) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  return page.screenshot({ omitBackground: true });
};

// .ico: one 256px PNG inside the standard header (Windows Vista and later read PNG icons).
const big = await png(256);
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2); // type: icon
head.writeUInt16LE(1, 4); // one image
head.writeUInt16LE(1, 10); // colour planes
head.writeUInt16LE(32, 12); // bits per pixel
head.writeUInt32LE(big.length, 14);
head.writeUInt32LE(22, 18); // image starts after this header
fs.writeFileSync(path.join(out, "plax.ico"), Buffer.concat([head, big])); // width/height bytes 0 = 256

if (process.platform === "darwin") {
  const set = path.join(out, "plax.iconset");
  fs.mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), await png(s));
    fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), await png(s * 2));
  }
  execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(out, "plax.icns")]);
  fs.rmSync(set, { recursive: true });
}
await browser.close();
console.log(`Made the Plax icons in ${path.relative(root, out)}`);
