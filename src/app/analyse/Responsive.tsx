"use client";

import { useState } from "react";
import type { SizeResult } from "@/lib/inspector/responsive";

/** The selection at phone, tablet and desktop widths, with what changes highlighted. */
export function ResponsivePanel() {
  const [state, setState] = useState<{ busy?: boolean; sizes?: SizeResult[]; error?: string }>({});
  const run = async () => {
    setState({ busy: true });
    const res = await fetch("/api/responsive", { method: "POST" }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setState(res?.ok ? { sizes: json.sizes } : { error: json?.error ?? "The app isn't responding." });
  };
  const desktop = state.sizes?.find((s) => s.name === "Desktop");
  const differs = (s: SizeResult, key: "size" | "fontSize" | "padding" | "layout") => desktop?.found && s.found && s[key] !== desktop[key];

  return (
    <section className="mt-8 rounded-xl border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">Screen sizes</h3>
          <p className="text-sm text-muted">How it looks on a phone, a tablet and a desktop.</p>
        </div>
        <button type="button" onClick={run} disabled={state.busy} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-muted disabled:opacity-60">
          {state.busy ? "Checking…" : state.sizes ? "Check again" : "Check screen sizes"}
        </button>
      </div>
      {state.busy && (
        <p className="mt-3 text-sm text-muted" role="status">
          Opening the page at three widths in the background. Your website window isn’t touched.
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.sizes && (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {state.sizes.map((s) => (
              <figure key={s.name} className="overflow-hidden rounded-xl border border-line">
                <figcaption className="flex justify-between border-b border-line px-3 py-2 text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted tabular-nums">{s.width}px wide</span>
                </figcaption>
                <div className="flex h-44 items-center justify-center bg-bg p-3">
                  {s.screenshot ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.screenshot} alt={`At ${s.width}px`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="px-4 text-center text-sm text-muted">
                      {s.hidden ? "Hidden at this size" : s.found ? "No picture" : "Not found at this size (the page is built differently here)"}
                    </span>
                  )}
                </div>
                {s.found && !s.hidden && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-3 text-xs">
                    {(
                      [
                        ["Size", "size", s.size],
                        ["Text", "fontSize", `${s.fontSize}px`],
                        ["Inside space", "padding", s.padding],
                        ["Layout", "layout", s.layout],
                      ] as const
                    ).map(([label, key, value]) => (
                      <div key={key} className="contents">
                        <dt className="text-muted">{label}</dt>
                        <dd className={differs(s, key) ? "font-medium text-accent" : ""}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </figure>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Values that differ from desktop are highlighted. Pages that need a login show what a visitor sees.</p>
        </>
      )}
    </section>
  );
}
