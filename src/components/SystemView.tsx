"use client";

import type { ReactNode } from "react";
import type { SystemData } from "@/lib/system/extract-system";
import { guessRoles, type Section } from "@/lib/system/design-md";
import { duration, easingName, weightName } from "@/lib/inspector/describe";

type Props = {
  system: SystemData;
  images: (string | null | undefined)[]; // one per example
  selection?: Partial<Record<Section, number[]>>; // when given, every item gets a tick box
  onToggle?: (section: Section, index: number) => void;
  onAll?: (section: Section, on: boolean) => void;
};

/** A collected design system, shown visually. With a selection, you choose what to keep. */
export function SystemView({ system: s, images, selection, onToggle, onAll }: Props) {
  const roles = guessRoles(s.colours);
  const pick = (section: Section, i: number, children: ReactNode, label: string) =>
    selection ? (
      <label key={`${section}-${i}`} className={`relative block cursor-pointer rounded-xl transition ${selection[section]?.includes(i) ? "" : "opacity-40"}`}>
        <input
          type="checkbox"
          aria-label={`Keep ${label}`}
          checked={selection[section]?.includes(i) ?? false}
          onChange={() => onToggle?.(section, i)}
          className="absolute right-2 top-2 z-10 size-4 accent-[var(--accent)]"
        />
        {children}
      </label>
    ) : (
      <div key={`${section}-${i}`}>{children}</div>
    );
  const head = (section: Section, title: string, count: number, note?: ReactNode) => (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-3xl">
        {title} <span className="text-base text-muted">{count}</span>
      </h2>
      {note}
      {selection && count > 0 && (
        <span className="flex gap-3 text-xs">
          <button type="button" className="text-accent hover:underline" onClick={() => onAll?.(section, true)}>
            Keep all
          </button>
          <button type="button" className="text-accent hover:underline" onClick={() => onAll?.(section, false)}>
            Keep none
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-12">
      <section>
        {head("colours", "Colours", s.colours.length)}
        {(roles.background || roles.accent) && (
          <p className="mb-3 text-sm text-muted">
            Likely roles (a guess from how often and where each is used):{" "}
            {[roles.background && `background ${roles.background}`, roles.text && `text ${roles.text}`, roles.accent && `accent ${roles.accent}`].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {s.colours.map((c, i) =>
            pick(
              "colours",
              i,
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="h-16" style={{ background: c.hex, opacity: c.alpha }} />
                <div className="p-2 text-xs">
                  <div className="font-mono">{c.hex}</div>
                  <div className="text-muted">
                    {c.uses.join(", ")} · {c.count}×
                  </div>
                </div>
              </div>,
              c.hex,
            ),
          )}
        </div>
      </section>

      <section>
        {head("type", "Typography", s.type.length, <span className="text-sm text-muted">{s.fonts.map((f) => f.family).join(" + ")}</span>)}
        <div className="space-y-2">
          {s.type.map((t, i) =>
            pick(
              "type",
              i,
              <div className="rounded-xl border border-line bg-surface p-4 pr-10">
                <div
                  className="truncate"
                  style={{
                    fontFamily: `"${t.family}", system-ui`,
                    fontSize: Math.min(t.size, 56),
                    fontWeight: t.weight,
                    lineHeight: t.lineHeight === "normal" ? undefined : parseFloat(t.lineHeight) / t.size,
                    textTransform: t.transform as never,
                  }}
                >
                  {t.sample || "The quick brown fox"}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {t.size}px · {weightName(t.weight)} · line {t.lineHeight} · {t.family} · on {t.tags.join(", ")} · {t.count}×
                </div>
              </div>,
              `${t.size}px ${t.family}`,
            ),
          )}
        </div>
      </section>

      <div className="grid gap-12 md:grid-cols-2">
        <section>
          {head("spacing", "Spacing", s.spacing.length)}
          <div className="space-y-1.5">
            {s.spacing.map((x, i) =>
              pick(
                "spacing",
                i,
                <div className="flex items-center gap-3 pr-8 text-xs">
                  <span className="w-12 text-right tabular-nums">{x.value}px</span>
                  <span className="h-3 rounded bg-accent" style={{ width: Math.min(x.value, 240) }} />
                  <span className="text-muted">{x.count}×</span>
                </div>,
                `${x.value}px spacing`,
              ),
            )}
          </div>
        </section>
        <section>
          {head("radii", "Corners", s.radii.length)}
          <div className="grid grid-cols-3 gap-3">
            {s.radii.map((r, i) =>
              pick(
                "radii",
                i,
                <div className="flex flex-col items-center gap-2 p-2 text-xs">
                  <div className="size-16 border-2 border-ink bg-accent-soft" style={{ borderRadius: r.value }} />
                  <span className="font-mono">{r.value}</span>
                </div>,
                `${r.value} corners`,
              ),
            )}
          </div>
          <div className="mt-8">{head("shadows", "Shadows", s.shadows.length)}</div>
          <div className="grid grid-cols-2 gap-4">
            {s.shadows.map((x, i) =>
              pick(
                "shadows",
                i,
                <div className="p-3">
                  <div className="h-16 rounded-xl bg-surface" style={{ boxShadow: x.value }} />
                  <div className="mt-2 truncate font-mono text-[11px] text-muted">{x.value}</div>
                </div>,
                "shadow",
              ),
            )}
          </div>
        </section>
      </div>

      <section>
        {head("examples", "Components", s.examples.length)}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {s.examples.map((e, i) =>
            pick(
              "examples",
              i,
              <figure className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex h-36 items-center justify-center bg-bg p-3">
                  {images[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[i]!} alt={e.label} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted">No picture</span>
                  )}
                </div>
                <figcaption className="p-2 text-xs">
                  <span className="font-medium capitalize">{e.kind}</span> · “{e.label}” · {e.width} × {e.height}
                </figcaption>
              </figure>,
              `${e.kind} ${e.label}`,
            ),
          )}
        </div>
      </section>

      <div className="grid gap-12 md:grid-cols-2">
        <section>
          <h2 className="mb-4 font-display text-3xl">Layout</h2>
          <ul className="space-y-1 text-sm">
            <li>
              {s.layout.flex} flexible rows or columns, {s.layout.grid} grids
            </li>
            {s.layout.gridColumns.length > 0 && <li>Grids of {s.layout.gridColumns.map((g) => `${g.columns} columns`).join(", ")}</li>}
            {s.layout.contentWidths.length > 0 && <li>Content width {s.layout.contentWidths.map((w) => `${w.value}px`).join(", ")}</li>}
          </ul>
          <div className="mt-6">{head("breakpoints", "Breakpoints", s.breakpoints.length)}</div>
          <div className="flex flex-wrap gap-2">
            {s.breakpoints.map((b, i) => pick("breakpoints", i, <span className="block rounded-lg border border-line px-3 py-1 pr-8 text-sm tabular-nums">{b}px</span>, `${b}px`))}
          </div>
          {s.unreadableStylesheets > 0 && (
            <p className="mt-2 text-xs text-muted">
              {s.unreadableStylesheets} stylesheet{s.unreadableStylesheets > 1 ? "s" : ""} came from other websites and couldn’t be read, so some breakpoints may be missing.
            </p>
          )}
        </section>
        <section>
          {head("transitions", "Motion", s.transitions.length)}
          <div className="space-y-2">
            {s.transitions.map((t, i) =>
              pick(
                "transitions",
                i,
                <div className="rounded-xl border border-line p-3 pr-10 text-sm">
                  {t.prop} over {duration(t.duration)} · {easingName(t.easing).toLowerCase()}
                  <span className="text-muted"> · {t.count}×</span>
                </div>,
                `${t.prop} transition`,
              ),
            )}
          </div>
          {s.keyframes.length > 0 && <p className="mt-3 text-sm text-muted">Named animations: {s.keyframes.join(", ")}</p>}
        </section>
      </div>

      <p className="text-xs text-muted">
        Read from {s.scanned} parts of the page{s.truncated ? " (very long page: only the first 4,000 were read)" : ""}.
      </p>
    </div>
  );
}
