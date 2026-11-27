"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { Asset, Colour, Design } from "@/lib/inspector/extract";
import { describeLayout, weightName } from "@/lib/inspector/describe";

// Values come from someone else's website: only ever link to real web addresses.
const webUrl = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : undefined);
const imageSrc = (u?: string) => (u && /^(https?:\/\/|data:image\/)/i.test(u) ? u : undefined);
const rgba = (c: Colour) => `${c.hex}${Math.round(c.alpha * 255).toString(16).padStart(2, "0")}`;
const n = (v: number) => `${Math.round(v * 10) / 10}`;

export function Inspector({ design, sample }: { design: Design; sample: string }) {
  return (
    <div className="mt-8 space-y-10">
      <p className="text-xs text-muted">Everything below is measured from the live page. Click a colour to copy it.</p>
      <AppearanceSection a={design.appearance} />
      <TypographySection t={design.typography} text={design.appearance.text} sample={sample} fonts={design.fonts} />
      <LayoutSection l={design.layout} />
      <ColoursSection palette={design.palette} />
      <AssetsSection assets={design.assets} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-4 font-display text-2xl">{title}</h3>
      {children}
    </section>
  );
}

function Swatch({ c, label }: { c: Colour; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(c.hex).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${c.hex}`}
      className="flex items-center gap-3 rounded-xl border border-line p-2 pr-4 text-left transition-colors hover:border-muted"
    >
      <span
        className="size-10 shrink-0 rounded-lg border border-line bg-[repeating-conic-gradient(var(--line)_0_25%,transparent_0_50%)] bg-[length:10px_10px]"
        aria-hidden
      >
        <span className="block size-full rounded-[7px]" style={{ background: rgba(c) }} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="font-mono text-sm">
          {copied ? "Copied" : c.hex}
          {!copied && c.alpha < 1 && <span className="text-muted"> · {Math.round(c.alpha * 100)}%</span>}
        </span>
      </span>
    </button>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="truncate">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function AppearanceSection({ a }: { a: Design["appearance"] }) {
  const sample: CSSProperties = {
    background: a.gradient ?? (a.background ? rgba(a.background) : a.sitsOn ? rgba(a.sitsOn) : undefined),
    borderRadius: a.radius,
    boxShadow: a.shadow ?? undefined,
    border: a.border ? `${a.border.width}px ${a.border.style} ${rgba(a.border.colour)}` : undefined,
    opacity: a.opacity,
  };
  return (
    <Section title="Appearance">
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex h-28 w-40 shrink-0 items-center justify-center rounded-xl bg-bg p-4">
          <div className="size-full" style={sample} aria-label="Shape, colour, corners and shadow of the selection" />
        </div>
        <div className="flex flex-wrap gap-2">
          {a.background ? <Swatch c={a.background} label="Background" /> : a.sitsOn && <Swatch c={a.sitsOn} label="Transparent, shows" />}
          <Swatch c={a.text} label="Text" />
          {a.border && <Swatch c={a.border.colour} label="Border" />}
        </div>
      </div>
      <Facts
        rows={[
          ["Corners", a.radius === "0px" ? "Square" : a.radius],
          ["Border", a.border ? `${n(a.border.width)}px ${a.border.style}` : "None"],
          ["Shadow", a.shadow ? <code className="font-mono text-xs">{a.shadow}</code> : "None"],
          ...(a.gradient ? [["Gradient", <code key="g" className="font-mono text-xs">{a.gradient}</code>] as [string, ReactNode]] : []),
          ...(a.opacity < 1 ? [["Opacity", `${Math.round(a.opacity * 100)}%`] as [string, ReactNode]] : []),
        ]}
      />
    </Section>
  );
}

function TypographySection({
  t,
  text,
  sample,
  fonts,
}: {
  t: Design["typography"];
  text: Colour;
  sample: string;
  fonts: Design["fonts"];
}) {
  const shown = Math.min(t.size, 56);
  const lineHeight = t.lineHeight === "normal" ? undefined : parseFloat(t.lineHeight) / t.size;
  const tracking = t.letterSpacing === "normal" ? undefined : parseFloat(t.letterSpacing) / t.size;
  return (
    <Section title="Typography">
      <div
        className="overflow-hidden rounded-xl border border-line p-5"
        style={{
          fontFamily: t.stack,
          fontSize: shown,
          fontWeight: t.weight,
          fontStyle: t.italic ? "italic" : undefined,
          lineHeight,
          letterSpacing: tracking === undefined ? undefined : `${tracking}em`,
          textTransform: t.transform as CSSProperties["textTransform"],
          textDecorationLine: t.decoration ?? undefined,
          textAlign: t.align as CSSProperties["textAlign"],
          color: rgba(text),
        }}
      >
        <div className="line-clamp-3">{sample || "The quick brown fox jumps over the lazy dog"}</div>
      </div>
      <p className="mt-2 text-xs text-muted">
        {shown < t.size && `Shown smaller than the real ${n(t.size)}px. `}
        {t.webFont && "This font was loaded by the website; if it isn't on your computer, the preview uses a similar one."}
      </p>
      <Facts
        rows={[
          ["Font", `${t.family}${t.webFont ? " (web font)" : ""}`],
          ["Size", `${n(t.size)}px`],
          ["Weight", weightName(t.weight)],
          ["Line height", lineHeight ? `${n(lineHeight)} × size (${t.lineHeight})` : "Normal"],
          ["Letter spacing", tracking !== undefined ? `${t.letterSpacing} (${n(tracking)}em)` : "Normal"],
          ["Alignment", t.align],
          ...(t.transform ? [["Case", t.transform] as [string, ReactNode]] : []),
          ...(t.decoration ? [["Decoration", t.decoration] as [string, ReactNode]] : []),
          ...(fonts.length > 1 ? [["Fonts inside", fonts.map((f) => f.family).join(", ")] as [string, ReactNode]] : []),
        ]}
      />
    </Section>
  );
}

function LayoutSection({ l }: { l: Design["layout"] }) {
  return (
    <Section title="Layout">
      <p className="text-lg">{describeLayout(l)}</p>
      <BoxModel l={l} />
      <Facts
        rows={[
          ["Size", `${l.width} × ${l.height}px`],
          ...(l.minWidth !== "auto" && l.minWidth !== "0px" ? [["Smallest width", l.minWidth] as [string, ReactNode]] : []),
          ...(l.maxWidth !== "none" ? [["Largest width", l.maxWidth] as [string, ReactNode]] : []),
        ]}
      />
    </Section>
  );
}

/** Outside space → border → inside space → content, like a set of nested frames. */
function BoxModel({ l }: { l: Design["layout"] }) {
  const ring = (vals: number[], label: string, cls: string, inner: ReactNode) => {
    const v = (i: number) => (vals[i] ? n(vals[i]) : "–");
    return (
      <div className={`relative rounded-xl border border-dashed border-line px-10 py-7 ${cls}`}>
        <span className="absolute left-3 top-1.5 text-[11px] text-muted">{label}</span>
        <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-xs tabular-nums">{v(0)}</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs tabular-nums">{v(1)}</span>
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-xs tabular-nums">{v(2)}</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs tabular-nums">{v(3)}</span>
        {inner}
      </div>
    );
  };
  return (
    <div className="mt-5 max-w-md">
      {ring(
        l.margin,
        "Outside space",
        "bg-orange-400/5",
        ring(
          l.border,
          "Border",
          "bg-surface",
          ring(
            l.padding,
            "Inside space",
            "bg-emerald-400/10",
            <div className="rounded-md bg-accent-soft px-3 py-2 text-center text-xs tabular-nums">
              {l.width} × {l.height}
            </div>,
          ),
        ),
      )}
    </div>
  );
}

function ColoursSection({ palette }: { palette: Design["palette"] }) {
  if (!palette.length) return null;
  return (
    <Section title="Colours in this selection">
      <div className="flex flex-wrap gap-2">
        {palette.map((c) => (
          <Swatch key={`${c.hex}${c.alpha}`} c={c} label={c.uses.join(", ")} />
        ))}
      </div>
    </Section>
  );
}

const KIND: Record<Asset["kind"], string> = {
  image: "Image",
  svg: "Icon or SVG",
  background: "Background image",
  video: "Video",
};

function AssetsSection({ assets }: { assets: Asset[] }) {
  return (
    <Section title="Assets">
      {assets.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {assets.map((a, i) => (
              <AssetCard key={i} a={a} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Images and icons belong to their creators. Check the licence before reusing them.</p>
        </>
      ) : (
        <p className="text-sm text-muted">No images, icons or videos inside this selection.</p>
      )}
    </Section>
  );
}

function AssetCard({ a }: { a: Asset }) {
  const [copied, setCopied] = useState(false);
  const src = a.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg)}` : a.kind !== "video" ? imageSrc(a.url) : undefined;
  const link = webUrl(a.url);
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex aspect-[4/3] items-center justify-center bg-[repeating-conic-gradient(var(--line)_0_25%,transparent_0_50%)] bg-[length:12px_12px] p-3">
        {src ? (
          // Shown as an image, so nothing inside an SVG can ever run in this app.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={a.alt ?? KIND[a.kind]} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-sm text-muted">{KIND[a.kind]}</span>
        )}
      </div>
      <div className="space-y-1 p-3 text-xs">
        <div className="font-medium">{KIND[a.kind]}</div>
        <div className="text-muted tabular-nums">
          {a.width} × {a.height}
          {a.alt && ` · “${a.alt}”`}
        </div>
        <div className="flex gap-3 pt-1">
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Open original
            </a>
          )}
          {a.svg && (
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={async () => {
                await navigator.clipboard.writeText(a.svg!).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied" : "Copy SVG"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
