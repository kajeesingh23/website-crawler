// Build Prompt and code export, from a real element measured in Chromium.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { extractDesign, type Design } from "../src/lib/inspector/extract.ts";
import { snapshotElement } from "../src/lib/inspector/snapshot.ts";
import { motionState } from "../src/lib/inspector/motion.ts";
import { buildDocument } from "../src/lib/recreate/document.ts";
import type { Motion } from "../src/lib/inspector/session.ts";
import { MODES, buildPrompt, type Mode, type PromptInput } from "../src/lib/export/prompt.ts";
import { componentName, designTokens, plainCss, reactWrapper, toTailwind, twClass } from "../src/lib/export/code.ts";

const CARD = `<!doctype html><body style="margin:0;background:#f4f4f2">
  <style>@keyframes pulse{from{opacity:1}to{opacity:.4}} .dot{animation:pulse 1.2s ease-in-out infinite alternate}</style>
  <article id="card" style="width:280px;background:#ffffff;color:#1a1a1a;border-radius:14px;padding:16px 20px;display:flex;flex-direction:column;gap:12px;
    font:500 15px/1.4 Georgia, serif;box-shadow:0 4px 12px rgba(0,0,0,.1);transition:transform .25s cubic-bezier(.2,.8,.2,1)">
    <h3 style="margin:0;font-size:22px">Calm \`studio\` \${x}</h3><span class="dot" style="width:8px;height:8px;border-radius:50%;background:#4f3bf5"></span>
  </article></body>`;

let input: PromptInput;
before(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(CARD);
    const el = page.locator("#card");
    const design = (await el.evaluate(extractDesign)) as Design;
    const rest = await el.evaluate(motionState);
    const motion: Motion = { running: rest.animations, scriptedIdle: false, transitions: rest.transitions, hover: null, focus: null, scroll: null, scrollTimelines: [] };
    const html = buildDocument(await el.evaluate(snapshotElement), design.appearance.sitsOn, motion);
    input = { name: "Calm studio card", label: "Card", url: "https://studio.example/", text: "Calm studio", width: 280, height: 90, design, motion, html, motionTested: false };
  } finally {
    await browser.close();
  }
});

test("every prompt mode is built from the measured values, the same way every time", () => {
  for (const mode of Object.keys(MODES) as Mode[]) {
    const p = buildPrompt(input, mode);
    assert.equal(p, buildPrompt(input, mode), `${mode} is deterministic`);
    assert.match(p, new RegExp(`^# ${MODES[mode]}: Calm studio card`), mode);
    assert.match(p, /https:\/\/studio\.example\//, `${mode} names the source`);
  }
  const pixel = buildPrompt(input, "pixel");
  assert.match(pixel, /#ffffff/i);
  assert.match(pixel, /14px/, "corner radius");
  assert.match(pixel, /Georgia/);
  assert.match(pixel, /```html[\s\S]*Calm/, "the exact copy is attached");
  assert.match(pixel, /pulse/, "the running animation is described");
  assert.match(pixel, /weren't tested/, "says honestly what wasn't observed");
  assert.match(buildPrompt(input, "editable"), /props/);
  assert.match(buildPrompt(input, "tokens"), /"\$type": "color"/);
  assert.match(buildPrompt(input, "animation"), /reduced-motion/);
  assert.match(buildPrompt(input, "animation"), /cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/, "the measured easing");
  assert.match(buildPrompt(input, "responsive"), /Measured only at one width/);
  const sized = buildPrompt({ ...input, sizes: [{ name: "Phone", width: 375, found: true, size: "280 × 90", layout: "Stacks top to bottom" }] }, "responsive");
  assert.match(sized, /Phone \(375px\): 280 × 90; Stacks top to bottom/);
  assert.match(buildPrompt({ ...input, design: null, html: undefined }, "pixel"), /design couldn't be read/, "works without a design too");
});

test("adjustable studio values become plain CSS again", () => {
  assert.equal(plainCss("calc(16px * var(--pdi-space, 1))"), "16px");
  assert.equal(plainCss("var(--pdi-bg, rgb(255, 255, 255))"), "rgb(255, 255, 255)");
  assert.equal(plainCss("calc(0.25s * var(--pdi-speed, 1)), calc(1s * var(--pdi-speed, 1))"), "0.25s, 1s");
  assert.equal(plainCss("var(--pdi-shadow, rgba(0, 0, 0, 0.1) 0px 4px 12px 0px)"), "rgba(0, 0, 0, 0.1) 0px 4px 12px 0px");
});

test("Tailwind export: every inline style becomes a class", () => {
  assert.equal(twClass("display", "flex"), "flex");
  assert.equal(twClass("flex-direction", "column"), "flex-col");
  assert.equal(twClass("padding-top", "calc(16px * var(--pdi-space, 1))"), "pt-[16px]");
  assert.equal(twClass("color", "var(--pdi-text, rgb(26, 26, 26))"), "text-[rgb(26,26,26)]");
  assert.equal(twClass("font-family", '&quot;Georgia&quot;, serif'), "font-[Georgia,serif]");
  assert.equal(twClass("mix-blend-mode", "multiply"), "[mix-blend-mode:multiply]");
  const tw = toTailwind(input.html!);
  assert.doesNotMatch(tw, / style="/, "no inline styles left");
  assert.doesNotMatch(tw, /--pdi-/, "no studio variables left");
  assert.match(tw, /class="[^"]*rounded-tl-\[14px\][^"]*"/, "the root got its classes");
  assert.match(tw, /animations aren't Tailwind classes/, "says what it can't convert");
});

test("design tokens and the React wrapper", () => {
  const t = designTokens(input.design, input.motion);
  assert.equal(t.color.background.$value, "#ffffff");
  assert.equal(t.radius.default.$value, "14px");
  assert.deepEqual(t.font.family.$value, ["Georgia", "serif"]);
  assert.deepEqual(Object.values(t.space).map((s) => s.$value), ["12px", "16px", "20px"]);
  assert.ok(Object.values(t.duration).some((d) => d.$value === "250ms"));
  assert.equal(componentName("Calm studio card!"), "CalmStudioCard");
  assert.equal(componentName("123"), "Component");
  const react = reactWrapper(input.html!, "Calm studio card");
  assert.match(react, /^\/\/ Made without AI/);
  assert.match(react, /export default function CalmStudioCard\(\)/);
  assert.match(react, /Calm \\`studio\\` \\\$\{x\}/, "backticks and ${ in the page text can't break the code");
  assert.doesNotMatch(react, /body \{/, "the preview page's body styles stay out");
});
