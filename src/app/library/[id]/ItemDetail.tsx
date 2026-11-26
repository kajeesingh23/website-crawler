"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import * as A from "@/app/actions";
import type { ItemDetail } from "@/lib/library";
import type { Design } from "@/lib/inspector/extract";
import type { Motion } from "@/lib/inspector/session";
import { Inspector } from "@/app/analyse/Inspector";
import { MotionPanel } from "@/app/analyse/Motion";
import { day, thumb } from "@/app/library/Board";
import { SystemView } from "@/components/SystemView";
import type { SystemData } from "@/lib/system/extract-system";

const webUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : undefined);

export function ItemDetailView({ item, collections }: { item: ItemDetail; collections: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<{ error?: string; id?: string }>, after?: (id?: string) => void) =>
    start(async () => {
      const r = await fn();
      setError(r.error);
      if (!r.error) after?.(r.id);
    });

  const design = item.observed.design as Design | undefined;
  const motion = item.observed.motion as Motion | undefined;
  const system = item.observed.system as SystemData | undefined;
  const inferred = item.inferred as { source?: string; confidence?: number; unknowns?: string[]; notes?: string; compare?: { match: boolean }[] };
  const latest = item.versions[0];
  const source = webUrl(item.sourceUrl);

  return (
    <div className={`mx-auto max-w-5xl space-y-10 ${pending ? "opacity-80" : ""}`}>
      <div>
        <Link href="/library" className="text-sm text-muted hover:text-ink">
          ← Library
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="item-name" className="sr-only">
              Name
            </label>
            <input
              id="item-name"
              defaultValue={item.name}
              maxLength={120}
              onBlur={(e) => e.target.value.trim() !== item.name && act(() => A.renameItem(item.id, e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-full rounded-lg bg-transparent font-display text-4xl tracking-tight outline-none focus:bg-surface md:text-5xl"
            />
            <p className="mt-1 text-sm text-muted">
              {item.kind === "design_system" ? "Design system" : [item.kind === "animation" ? "Animation" : "Component", item.category].filter(Boolean).join(" · ")} · saved {day(item.createdAt)}
              {source && (
                <>
                  {" · from "}
                  <a href={source} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {item.site ?? new URL(source).hostname}
                  </a>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-pressed={item.favourite}
            onClick={() => act(() => A.setFavourite(item.id, !item.favourite))}
            className={`rounded-lg border px-4 py-2 text-sm ${item.favourite ? "border-amber-400 text-amber-600" : "border-line hover:border-muted"}`}
          >
            {item.favourite ? "★ Favourite" : "☆ Add to favourites"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <Preview item={item} />
      {item.description && <p className="text-lg">{item.description}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => act(() => A.duplicateItem(item.id), (id) => id && router.push(`/library/${id}`))} className="rounded-lg border border-line px-4 py-2 hover:border-muted">
          Duplicate
        </button>
        {latest?.codePath &&
          latest.files.map((f) => (
            <a key={f} href={`/api/library/files/${latest.codePath}/${f}?download`} className="rounded-lg border border-line px-4 py-2 hover:border-muted">
              Export {f}
            </a>
          ))}
        <AddToCollection itemId={item.id} inCollections={item.collections} collections={collections} act={act} />
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete “${item.name}” for good? This removes its screenshot and code and can't be undone.`)) act(() => A.deleteItems([item.id]), () => router.push("/library"));
          }}
          className="ml-auto rounded-lg border border-line px-4 py-2 text-danger hover:border-danger"
        >
          Delete
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Notes</span>
          <textarea
            defaultValue={item.notes ?? ""}
            maxLength={5000}
            rows={4}
            placeholder="Why you saved it, where you'd use it…"
            onBlur={(e) => e.target.value !== (item.notes ?? "") && act(() => A.setNotes(item.id, e.target.value))}
            className="w-full rounded-xl border border-line bg-surface p-3 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tags</span>
          <input
            defaultValue={item.tags.join(", ")}
            placeholder="hover, dark, portfolio"
            onBlur={(e) => e.target.value !== item.tags.join(", ") && act(() => A.setTags(item.id, e.target.value))}
            className="w-full rounded-xl border border-line bg-surface p-3 outline-none focus:border-accent"
          />
          <span className="mt-1 block text-xs text-muted">Separate with commas. Tags make it easier to find later.</span>
        </label>
      </section>

      {system && (
        <Block title="Design system">
          <SystemView system={system} images={system.examples.map((e) => e.image && `/api/library/files/design-systems/${item.id}/${e.image}`)} />
        </Block>
      )}

      {motion && (
        <Block title="Animation">
          <MotionPanel motion={motion} image={thumb(item.thumbnail)} />
        </Block>
      )}

      {item.kind === "component" && (inferred.source || inferred.unknowns?.length) && (
        <Block title="How it was recreated">
          <p className="text-sm">
            {inferred.source === "copy" ? "An exact copy made from the measurements, without AI." : "Recreated with Claude."}
            {inferred.compare && ` It matched ${inferred.compare.filter((r) => r.match).length} of ${inferred.compare.length} measured properties when saved.`}
            {inferred.confidence !== undefined && ` Claude estimated it ${inferred.confidence}% close.`}
          </p>
          {inferred.notes && <p className="mt-2 text-sm text-muted">{inferred.notes}</p>}
          {!!inferred.unknowns?.length && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {inferred.unknowns.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          )}
        </Block>
      )}

      {(item.code.html || item.code.react) && <Code html={item.code.html} react={item.code.react} />}

      {design && (
        <Block title="Design, as measured">
          <Inspector design={design} sample="" />
        </Block>
      )}

      <Similar id={item.id} />

      {item.versions.length > 0 && (
        <Block title="Version history">
          <ol className="space-y-2 text-sm">
            {item.versions.map((v) => (
              <li key={v.version} className="flex flex-wrap gap-x-3 rounded-xl border border-line p-3">
                <span className="font-medium">Version {v.version}</span>
                <span className="text-muted">{day(v.createdAt)}</span>
                {v.note && <span>{v.note}</span>}
                <span className="text-muted">{v.files.join(", ")}</span>
              </li>
            ))}
          </ol>
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 font-display text-3xl">{title}</h2>
      {children}
    </section>
  );
}

function Preview({ item }: { item: ItemDetail }) {
  const src = thumb(item.thumbnail);
  if (item.code.html)
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <figure>
          <figcaption className="mb-1 text-xs text-muted">Original website</figcaption>
          <div className="flex h-80 items-center justify-center overflow-hidden rounded-xl border border-line bg-bg p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt="The original" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-muted">No screenshot</span>}
          </div>
        </figure>
        <figure>
          <figcaption className="mb-1 text-xs text-muted">Your component (live, try hovering)</figcaption>
          {/* sandbox with no permissions: saved code can never run scripts in this app */}
          <iframe title={item.name} sandbox="" srcDoc={item.code.html} className="h-80 w-full rounded-xl border border-line bg-white" />
        </figure>
      </div>
    );
  return (
    <div className="flex max-h-[32rem] min-h-64 items-center justify-center overflow-hidden rounded-xl border border-line bg-bg p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={item.name} className="max-h-[30rem] max-w-full object-contain" /> : <span className="text-muted">No preview</span>}
    </div>
  );
}

function AddToCollection({
  itemId,
  inCollections,
  collections,
  act,
}: {
  itemId: string;
  inCollections: string[];
  collections: { id: string; name: string }[];
  act: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const available = collections.filter((c) => !inCollections.includes(c.id));
  const member = collections.filter((c) => inCollections.includes(c.id));
  if (!collections.length)
    return (
      <Link href="/library" className="rounded-lg border border-line px-4 py-2 hover:border-muted">
        Create a collection in your Library
      </Link>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      {member.map((c) => (
        <span key={c.id} className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs">
          {c.name}
          <button type="button" aria-label={`Remove from ${c.name}`} onClick={() => act(() => A.removeFromCollection(c.id, [itemId]))} className="ml-1.5 text-muted hover:text-ink">
            ×
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <select
          aria-label="Add to collection"
          value=""
          onChange={(e) => e.target.value && act(() => A.addToCollection(e.target.value, [itemId]))}
          className="rounded-lg border border-line bg-surface px-3 py-2"
        >
          <option value="">Add to collection…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

function Code({ html, react }: { html?: string; react?: string }) {
  const [tab, setTab] = useState<"html" | "react">(html ? "html" : "react");
  const [copied, setCopied] = useState(false);
  const code = (tab === "html" ? html : react) ?? "";
  return (
    <Block title="Code">
      <div className="mb-3 flex items-center gap-3 text-sm">
        {html && (
          <button type="button" onClick={() => setTab("html")} className={tab === "html" ? "font-medium" : "text-muted"}>
            HTML and CSS
          </button>
        )}
        {react && (
          <button type="button" onClick={() => setTab("react")} className={tab === "react" ? "font-medium" : "text-muted"}>
            React
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="ml-auto text-accent hover:underline"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto rounded-xl bg-bg p-4 font-mono text-xs">{code}</pre>
    </Block>
  );
}

type SimilarCard = { id: string; name: string; thumbnail: string | null; score: number; site: string | null };

/** Items that look like this one, by shape and colour of their screenshots. */
function Similar({ id }: { id: string }) {
  const [state, setState] = useState<{ busy?: boolean; items?: SimilarCard[]; error?: string }>({});
  const load = async () => {
    setState({ busy: true });
    const res = await fetch(`/api/library/similar?id=${encodeURIComponent(id)}`).catch(() => null);
    const json = await res?.json().catch(() => null);
    setState(res?.ok ? { items: json.items } : { error: json?.error ?? "Couldn't compare pictures." });
  };
  return (
    <Block title="Looks similar">
      {!state.items && (
        <button type="button" onClick={load} disabled={state.busy} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-muted disabled:opacity-60">
          {state.busy ? "Comparing pictures…" : "Find items that look like this"}
        </button>
      )}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.items && !state.items.length && <p className="text-sm text-muted">Nothing else in your library has a picture to compare with yet.</p>}
      {state.items && state.items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {state.items.map((i) => (
            <li key={i.id}>
              <Link href={`/library/${i.id}`} className="block overflow-hidden rounded-xl border border-line bg-surface hover:border-muted">
                <div className="flex h-24 items-center justify-center bg-bg p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {i.thumbnail && <img src={thumb(i.thumbnail)} alt="" className="max-h-full max-w-full object-contain" />}
                </div>
                <div className="p-2 text-xs">
                  <div className="truncate font-medium">{i.name}</div>
                  <div className="text-muted">{Math.round(i.score * 100)}% alike{i.site ? ` · ${i.site}` : ""}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Compares the shape and colours of the screenshots, so it finds look-alikes, not meaning.</p>
    </Block>
  );
}
