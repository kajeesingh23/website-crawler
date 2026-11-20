// fingerprintInPage and compareInPage run INSIDE a browser page (page.evaluate): self-contained.
// similarity() is plain code that compares two fingerprints.

export type Fingerprint = { hash: string; fg: number[]; bg: number[] }; // shape bits, foreground and background colour

/** A picture's shape (64-bit difference hash), its main foreground colour and its background colour. */
export async function fingerprintInPage(dataUrl: string): Promise<Fingerprint> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  c.width = 9;
  c.height = 8;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 9, 8);
  ctx.drawImage(img, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const grey = (x: number, y: number) => {
    const i = (y * 9 + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += grey(x, y) > grey(x + 1, y) ? "1" : "0";

  c.width = c.height = 32;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 32, 32);
  ctx.drawImage(img, 0, 0, 32, 32);
  const p = ctx.getImageData(0, 0, 32, 32).data;
  // The corners show the background; everything clearly different from it is foreground.
  const at = (i: number) => [p[i], p[i + 1], p[i + 2]];
  const corners = [0, 31 * 4, 31 * 32 * 4, (32 * 32 - 1) * 4].map(at);
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, c) => s + c[k], 0) / 4));
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < p.length; i += 4) {
    const [r, g, b] = at(i);
    if (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 48) continue;
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    n++;
  }
  const fg = n ? sum.map((v) => Math.round(v / n)) : bg;
  return { hash: BigInt(`0b${bits}`).toString(16).padStart(16, "0"), fg, bg };
}

/** How alike two pictures look pixel by pixel, 0–100, after scaling both to the same box. */
export async function compareInPage([a, b]: [string, string]): Promise<number> {
  const load = async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  };
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = 160;
  const h = Math.max(1, Math.min(640, Math.round((w * ia.naturalHeight) / Math.max(1, ia.naturalWidth))));
  const pixels = (img: HTMLImageElement) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const pa = pixels(ia);
  const pb = pixels(ib);
  let diff = 0;
  for (let i = 0; i < pa.length; i += 4) diff += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
  return Math.round((1 - diff / ((pa.length / 4) * 3 * 255)) * 100);
}

/** 0–1: 40% shape (hash bits that agree), 40% foreground colour, 20% background colour. */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  const differing = (BigInt(`0x${a.hash}`) ^ BigInt(`0x${b.hash}`)).toString(2).replace(/0/g, "").length;
  const shape = 1 - differing / 64;
  const near = (x: number[], y: number[]) => 1 - Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / Math.hypot(255, 255, 255);
  return Math.round((0.4 * shape + 0.4 * near(a.fg, b.fg) + 0.2 * near(a.bg, b.bg)) * 100) / 100;
}
