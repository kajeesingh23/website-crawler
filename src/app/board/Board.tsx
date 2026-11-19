"use client";

import Link from "next/link";
import { useState, useTransition, type DragEvent, type FormEvent } from "react";
import * as A from "@/app/actions";
import type { Filter, ItemCard } from "@/lib/library";

type Props = {
  items: ItemCard[];
  counts: { total: number; components: number; animations: number; assets: number; designSystems: number; favourites: number };
  collections: { id: string; name: string; count: number }[];
  filters: [Filter, string][];
  active: { filter: Filter; collection?: string; q?: string };
};

export const thumb = (t: string | null) => (t ? `/api/library/files/${t}` : undefined);
export const day = (sqlDate: string) => new Date(`${sqlDate.replace(" ", "T")}Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function Board({ items, counts, collections, filters, active }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const current = collections.find((c) => c.id === active.collection);

  const href = (patch: Partial<Props["active"]>) => {
    const p = new URLSearchParams();
    const next = { ...active, ...patch };
    if (next.filter && next.filter !== "all") p.set("filter", next.filter);
    if (next.collection) p.set("collection", next.collection);
    if (next.q) p.set("q", next.q);
    return `/board${p.size ? `?${p}` : ""}`;
  };
  const act = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setError(r.error);
      if (!r.error) after?.();
    });
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Reordering follows the board's own order, so it's off while search results are sorted by relevance.
  const canDrag = !active.q;
  const onDragOver = (e: DragEvent, id: string) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setDropAt({ id, place: e.clientX < r.left + r.width / 2 ? "before" : "after" });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragId && dropAt) {
      const [moving, target] = [dragId, dropAt];
      act(() => A.moveItem(moving, target.id, target.place));
    }
    setDragId(null);
    setDropAt(null);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">My Board</h1>
          <p className="mt-2 text-sm text-muted">
            {counts.total} saved · {counts.components} components · {counts.animations} animations · {counts.assets} assets · {counts.designSystems}{" "}
            design systems · {counts.favourites} favourites
          </p>
        </div>
        <form action="/board" className="flex w-full gap-2 sm:w-auto">
          {active.filter !== "all" && <input type="hidden" name="filter" value={active.filter} />}
          {active.collection && <input type="hidden" name="collection" value={active.collection} />}
          <label htmlFor="board-search" className="sr-only">
            Search your board
          </label>
          <input
            id="board-search"
            name="q"
            defaultValue={active.q}
            placeholder="Find the animated card from a portfolio site…"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-accent sm:w-80"
          />
        </form>
      </div>

      <nav aria-label="Filters" className="mt-6 flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <Link
            key={key}
            href={href({ filter: key })}
            aria-current={active.filter === key ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${active.filter === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
        {active.q && (
          <Link href={href({ q: undefined })} className="rounded-full px-3 py-1.5 text-sm text-accent hover:underline">
            Clear search “{active.q}”
          </Link>
        )}
      </nav>

      <div className="mt-6 grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <Collections collections={collections} current={current} href={href} act={act} />

        <div>
          {selected.length > 0 && (
            <SelectionBar selected={selected} collections={collections} current={current} act={act} clear={() => setSelected([])} />
          )}
          {error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {error}
            </p>
          )}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
              <div className="font-medium">{counts.total ? "Nothing matches here" : "Your board is waiting"}</div>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                {counts.total
                  ? "Try another filter or search, or pick a different collection."
                  : "Explore a website, select something you like, and save its animation or a recreated component. It appears here."}
              </p>
              {!counts.total && (
                <Link href="/explore" className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg">
                  Explore a Website
                </Link>
              )}
            </div>
          ) : (
            <ul className={`grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4 ${pending ? "opacity-70" : ""}`} onDragEnd={() => setDragId(null)}>
              {items.map((item) => (
                <li
                  key={item.id}
                  draggable={canDrag}
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(e) => onDragOver(e, item.id)}
                  onDragLeave={() => setDropAt(null)}
                  onDrop={onDrop}
                  className={`group relative rounded-2xl border bg-surface transition ${
                    selected.includes(item.id) ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-muted"
                  } ${dragId === item.id ? "opacity-40" : ""} ${
                    dropAt?.id === item.id ? (dropAt.place === "before" ? "shadow-[-4px_0_0_var(--accent)]" : "shadow-[4px_0_0_var(--accent)]") : ""
                  }`}
                >
                  <Card item={item} />
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.name}`}
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                    className={`absolute left-3 top-3 size-5 accent-[var(--accent)] ${selected.length ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
                  />
                  <button
                    type="button"
                    aria-label={item.favourite ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
                    aria-pressed={item.favourite}
                    onClick={() => act(() => A.setFavourite(item.id, !item.favourite))}
                    className={`absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-surface/90 text-lg ${
                      item.favourite ? "text-amber-500" : "text-muted opacity-0 focus:opacity-100 group-hover:opacity-100"
                    }`}
                  >
                    {item.favourite ? "★" : "☆"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canDrag && items.length > 1 && <p className="mt-3 text-xs text-muted">Drag cards to rearrange them.</p>}
        </div>
      </div>
    </div>
  );
}

function Card({ item }: { item: ItemCard }) {
  const src = thumb(item.thumbnail);
  return (
    <Link href={`/library/${item.id}`} className="block">
      <div className="flex max-h-72 min-h-36 items-center justify-center overflow-hidden rounded-t-2xl bg-bg p-3">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="max-h-64 max-w-full object-contain" loading="lazy" />
        ) : (
          <span className="text-sm text-muted">{item.category ?? "No preview"}</span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-medium">{item.name}</div>
          {item.moves && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px]" title="Has animation">
              Moves
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted">{[item.category, item.site].filter(Boolean).join(" · ")}</div>
        <div className="text-xs text-muted">{day(item.createdAt)}</div>
      </div>
    </Link>
  );
}

type Act = (fn: () => Promise<{ error?: string }>, after?: () => void) => void;

function Collections({
  collections,
  current,
  href,
  act,
}: {
  collections: Props["collections"];
  current?: Props["collections"][number];
  href: (p: Partial<Props["active"]>) => string;
  act: Act;
}) {
  const [name, setName] = useState("");
  const create = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) act(() => A.createCollection(name), () => setName(""));
  };
  return (
    <aside aria-label="Collections" className="space-y-1">
      <div className="mb-2 text-xs font-medium text-muted">Collections</div>
      <Link href={href({ collection: undefined })} className={`block rounded-lg px-3 py-1.5 text-sm ${!current ? "bg-accent-soft font-medium" : "hover:bg-bg"}`}>
        Everything
      </Link>
      {collections.map((c) => (
        <Link
          key={c.id}
          href={href({ collection: c.id })}
          className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${current?.id === c.id ? "bg-accent-soft font-medium" : "hover:bg-bg"}`}
        >
          <span className="truncate">{c.name}</span>
          <span className="text-muted tabular-nums">{c.count}</span>
        </Link>
      ))}
      <form onSubmit={create} className="pt-2">
        <label htmlFor="new-collection" className="sr-only">
          New collection name
        </label>
        <input
          id="new-collection"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="+ New collection"
          className="w-full rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-line focus:bg-surface"
        />
      </form>
      {current && (
        <div className="flex gap-3 px-3 pt-2 text-xs">
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => {
              const n = prompt("Rename collection", current.name);
              if (n?.trim()) act(() => A.renameCollection(current.id, n));
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="text-danger hover:underline"
            onClick={() => {
              if (confirm(`Delete the collection “${current.name}”? Its items stay in your library.`))
                act(() => A.deleteCollection(current.id), () => (window.location.href = href({ collection: undefined })));
            }}
          >
            Delete collection
          </button>
        </div>
      )}
    </aside>
  );
}

function SelectionBar({
  selected,
  collections,
  current,
  act,
  clear,
}: {
  selected: string[];
  collections: Props["collections"];
  current?: Props["collections"][number];
  act: Act;
  clear: () => void;
}) {
  const [target, setTarget] = useState("");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
      <span className="font-medium">{selected.length} selected</span>
      {collections.length > 0 && (
        <>
          <label htmlFor="move-to" className="sr-only">
            Collection
          </label>
          <select id="move-to" value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1">
            <option value="">Choose a collection…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!target}
            onClick={() => act(() => A.addToCollection(target, selected), clear)}
            className="rounded-full border border-line px-3 py-1 hover:border-muted disabled:opacity-50"
          >
            Add to collection
          </button>
        </>
      )}
      {current && (
        <button type="button" onClick={() => act(() => A.removeFromCollection(current.id, selected), clear)} className="rounded-full border border-line px-3 py-1 hover:border-muted">
          Remove from “{current.name}”
        </button>
      )}
      {selected.length >= 2 && selected.length <= 4 ? (
        <Link href={`/board/compare?ids=${selected.join(",")}`} className="rounded-full border border-line px-3 py-1 hover:border-muted">
          Compare
        </Link>
      ) : (
        <span className="text-xs text-muted">Select 2–4 to compare</span>
      )}
      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete ${selected.length} item${selected.length > 1 ? "s" : ""} for good? This removes their screenshots and code and can't be undone.`))
            act(() => A.deleteItems(selected), clear);
        }}
        className="rounded-full border border-line px-3 py-1 text-danger hover:border-danger"
      >
        Delete
      </button>
      <button type="button" onClick={clear} className="ml-auto text-muted hover:text-ink">
        Clear selection
      </button>
    </div>
  );
}
