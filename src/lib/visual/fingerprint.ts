// fingerprintInPage and compareInPage run INSIDE a browser page (page.evaluate): self-contained.
// similarity() is plain code that compares two fingerprints.

export type Fingerprint = { hash: string; hist: number[] };

/** A picture's shape (64-bit difference hash) and colour mix (64-colour histogram). */
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
  const hist = new Array<number>(64).fill(0);
  for (let i = 0; i < p.length; i += 4) hist[(p[i] >> 6) * 16 + (p[i + 1] >> 6) * 4 + (p[i + 2] >> 6)]++;
  return { hash: BigInt(`0b${bits}`).toString(16).padStart(16, "0"), hist: hist.map((v) => Math.round((v / 1024) * 1000) / 1000) };
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

/** 0–1: half shape (hash bits that agree), half colour mix (histogram overlap). */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  const differing = (BigInt(`0x${a.hash}`) ^ BigInt(`0x${b.hash}`)).toString(2).replace(/0/g, "").length;
  const shape = 1 - differing / 64;
  const colour = a.hist.reduce((sum, v, i) => sum + Math.min(v, b.hist[i] ?? 0), 0);
  return Math.round((0.5 * shape + 0.5 * colour) * 100) / 100;
}
