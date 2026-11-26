import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getItem, type ItemDetail } from "@/lib/library";
import type { Colour, Design } from "@/lib/inspector/extract";
import type { Motion } from "@/lib/inspector/session";
import { describeLayout, describeMovement, movementBetween, weightName } from "@/lib/inspector/describe";

export default function ComparePage({ searchParams }: PageProps<"/library/compare">) {
  return (
    <Suspense fallback={null}>
      <Compare searchParams={searchParams} />
    </Suspense>
  );
}

const swatch = (c?: Colour | null) =>
  c ? (
    <span className="inline-flex items-center gap-2 font-mono text-xs">
      <span className="size-4 rounded border border-line" style={{ background: c.hex }} />
      {c.hex}
    </span>
  ) : (
    "—"
  );

const hover = (m?: Motion) => {
  const changes = m?.hover?.changes ?? [];
  if (!changes.length) return m ? "Nothing changes" : "Not explored";
  const t = changes.find((c) => c.prop === "transform");
  const move = t ? describeMovement(movementBetween(t.from, t.to)) : "";
  const others = changes.filter((c) => c.prop !== "transform").length;
  return [move, others ? `${others} other change${others > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
};

async function Compare({ searchParams }: Pick<PageProps<"/library/compare">, "searchParams">) {
  const raw = (await searchParams).ids;
  const items = (typeof raw === "string" ? raw.split(",") : []).slice(0, 4).map(getItem).filter((i): i is ItemDetail => !!i);
  if (items.length < 2)
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-4xl">Compare</h1>
        <p className="mt-3 text-muted">Select 2 to 4 items in your Library, then press Compare.</p>
        <Link href="/library" className="mt-5 inline-block text-accent hover:underline">
          Back to Library
        </Link>
      </div>
    );

  const d = (i: ItemDetail) => i.observed.design as Design | undefined;
  const m = (i: ItemDetail) => i.observed.motion as Motion | undefined;
  const rows: [string, (i: ItemDetail) => ReactNode][] = [
    ["Website", (i) => i.site ?? "—"],
    ["Kind", (i) => (i.kind === "design_system" ? "Design system" : [i.kind === "animation" ? "Animation" : "Component", i.category].filter(Boolean).join(" · "))],
    ["Background", (i) => swatch(d(i)?.appearance.background ?? d(i)?.appearance.sitsOn)],
    ["Text colour", (i) => swatch(d(i)?.appearance.text)],
    ["Font", (i) => d(i)?.typography.family ?? "—"],
    ["Size and weight", (i) => (d(i) ? `${d(i)!.typography.size}px · ${weightName(d(i)!.typography.weight)}` : "—")],
    ["Corners", (i) => d(i)?.appearance.radius ?? "—"],
    ["Shadow", (i) => (d(i) ? (d(i)!.appearance.shadow ? "Yes" : "None") : "—")],
    ["Layout", (i) => (d(i) ? describeLayout(d(i)!.layout) : "—")],
    ["On hover", (i) => hover(m(i))],
    ["Moves on its own", (i) => (m(i) ? m(i)!.running.map((a) => a.name).join(", ") || "No" : "Not explored")],
    ["Scroll reveal", (i) => (m(i)?.scroll?.changes.length ? "Yes" : m(i) ? "No" : "Not explored")],
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/library" className="text-sm text-muted hover:text-ink">
        ← Library
      </Link>
      <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">Compare</h1>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] table-fixed text-left text-sm">
          <thead>
            <tr>
              <th className="w-40" />
              {items.map((i) => (
                <th key={i.id} className="p-2 align-top font-normal">
                  <Link href={`/library/${i.id}`} className="block">
                    <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-line bg-bg p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {i.thumbnail ? <img src={`/api/library/files/${i.thumbnail}`} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-muted">No preview</span>}
                    </div>
                    <div className="mt-2 truncate font-medium">{i.name}</div>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label} className="border-t border-line">
                <th scope="row" className="p-2 font-normal text-muted">
                  {label}
                </th>
                {items.map((i) => (
                  <td key={i.id} className="p-2 align-top">
                    {cell(i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
