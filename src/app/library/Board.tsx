"use client";

import Link from "next/link";
import { useState, useTransition, type DragEvent, type FormEvent } from "react";
import * as A from "@/app/actions";
import type { Filter, ItemCard, Query } from "@/lib/library";

type Props = {
  tab: "components" | "assets" | "variations" | "design-systems";
  items: ItemCard[];
  total: number;
  collections: { id: string; name: string; count: number }[];
  filters?: [Filter, string][];
  options?: { websites: { id: string; name: string }[]; categories: string[]; tags: string[] };
  active: Query;
};

const TAB_EMPTY: Record<Props["tab"], string> = {
  components: "Analyse a website, select something you like, and save it. It appears here.",
  assets: "Images, icons and illustrations you save from a website appear here.",
  variations: "Customise a saved component and save it as a variation. The original never changes.",
  "design-systems": "Collect a website's colours, type and spacing below, then save it.",
};

export const thumb = (t: string | null) => (t ? `/api/library/files/${t}` : undefined);
export const day = (sqlDate: string) => new Date(`${sqlDate.replace(" ", "T")}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); // same on server and browser

const KEYS = ["filter", "collection", "q", "website", "category", "tag", "from", "to"] as const;

export function Board({ tab, items, total, collections, filters, options, active }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const current = collections.find((c) => c.id === active.collection);
  const searching = KEYS.some((k) => k !== "filter" && active[k]);

  const href = (patch: Partial<Query>) => {
    const p = new URLSearchParams();
    if (tab !== "components") p.set("tab", tab);
    const next = { ...active, ...patch };
    for (const k of KEYS) if (next[k] && !(k === "filter" && next[k] === "all")) p.set(k, String(next[k]));
    return `/library${p.size ? `?${p}` : ""}`;
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
  const select = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

  return (
    <div>
      <form action="/library" className="space-y-3">
        {tab !== "components" && <input type="hidden" name="tab" value={tab} />}
        {active.filter && active.filter !== "all" && <input type="hidden" name="filter" value={active.filter} />}
        {active.collection && <input type="hidden" name="collection" value={active.collection} />}
        <label htmlFor="board-search" className="sr-only">
          Search your library
        </label>
        <input
          id="board-search"
          name="q"
          defaultValue={active.q}
          placeholder="Search in your own words, e.g. the animated card from a portfolio site"
          className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        {options && (
          <div className="flex flex-wrap items-center gap-2">
            <select name="website" defaultValue={active.website ?? ""} aria-label="Website" className={select}>
              <option value="">Any website</option>
              {options.websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select name="category" defaultValue={active.category ?? ""} aria-label="Kind of element" className={select}>
              <option value="">Any kind</option>
              {options.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select name="tag" defaultValue={active.tag ?? ""} aria-label="Tag" className={select}>
              <option value="">Any tag</option>
              {options.tags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm text-muted">
              From <input type="date" name="from" defaultValue={active.from} className={select} />
            </label>
            <label className="flex items-center gap-1 text-sm text-muted">
              to <input type="date" name="to" defaultValue={active.to} className={select} />
            </label>
            <button type="submit" className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-bg">
              Search
            </button>
          </div>
        )}
      </form>

      <nav aria-label="Filters" className="mt-4 flex flex-wrap gap-2">
        {filters?.map(([key, label]) => (
          <Link
            key={key}
            href={href({ filter: key })}
            aria-current={active.filter === key ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm ${active.filter === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
        {searching && (
          <Link href={href({ q: undefined, website: undefined, category: undefined, tag: undefined, from: undefined, to: undefined })} className="rounded-lg px-3 py-1.5 text-sm text-accent hover:underline">
            {active.q ? `Clear search “${active.q}”` : "Clear filters"}
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
            <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
              <div className="font-medium">{total ? "Nothing matches here" : "Nothing here yet"}</div>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                {total ? "Try another filter or search, or pick a different collection." : TAB_EMPTY[tab]}
              </p>
              {!total && tab === "components" && (
                <Link href="/analyse" className="mt-5 inline-block rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-bg">
                  Analyse Website
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
                  className={`group relative rounded-xl border bg-surface transition ${
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
        <div className="truncate text-xs text-muted">{[item.variantOf ? "Variation" : item.category, item.site].filter(Boolean).join(" · ")}</div>
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
  href: (p: Partial<Query>) => string;
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
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
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
            className="rounded-lg border border-line px-3 py-1 hover:border-muted disabled:opacity-50"
          >
            Add to collection
          </button>
        </>
      )}
      {current && (
        <button type="button" onClick={() => act(() => A.removeFromCollection(current.id, selected), clear)} className="rounded-lg border border-line px-3 py-1 hover:border-muted">
          Remove from “{current.name}”
        </button>
      )}
      {selected.length >= 2 && selected.length <= 4 ? (
        <Link href={`/library/compare?ids=${selected.join(",")}`} className="rounded-lg border border-line px-3 py-1 hover:border-muted">
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
        className="rounded-lg border border-line px-3 py-1 text-danger hover:border-danger"
      >
        Delete
      </button>
      <button type="button" onClick={clear} className="ml-auto text-muted hover:text-ink">
        Clear selection
      </button>
    </div>
  );
}
