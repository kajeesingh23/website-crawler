import Link from "next/link";
import { Suspense } from "react";
import { filterOptions, listItems, type Query } from "@/lib/library";

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <Suspense fallback={null}>
      <Library searchParams={searchParams} />
    </Suspense>
  );
}

const EXAMPLES = ["Find buttons that follow the cursor", "Show all my dark navigation references", "Scroll-triggered interactions"];

async function Library({ searchParams }: Pick<PageProps<"/library">, "searchParams">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const query: Query = { q: one("q"), website: one("website"), category: one("category"), tag: one("tag"), from: one("from"), to: one("to") };
  const searching = Object.values(query).some(Boolean);
  const items = listItems(query);
  const opts = filterOptions();
  const select = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">Design Library</h1>
      <p className="mt-2 text-muted">Everything you’ve saved, searchable in your own words.</p>

      <form action="/library" className="mt-6 space-y-3">
        <label htmlFor="library-search" className="sr-only">
          Search your library
        </label>
        <input
          id="library-search"
          name="q"
          defaultValue={query.q}
          placeholder="Search your library, e.g. the animated card I saved from a portfolio website"
          className="w-full rounded-full border border-line bg-surface px-5 py-3 outline-none focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select name="website" defaultValue={query.website ?? ""} aria-label="Website" className={select}>
            <option value="">Any website</option>
            {opts.websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={query.category ?? ""} aria-label="Category" className={select}>
            <option value="">Any kind</option>
            {opts.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select name="tag" defaultValue={query.tag ?? ""} aria-label="Tag" className={select}>
            <option value="">Any tag</option>
            {opts.tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-muted">
            From <input type="date" name="from" defaultValue={query.from} className={select} />
          </label>
          <label className="flex items-center gap-1 text-sm text-muted">
            to <input type="date" name="to" defaultValue={query.to} className={select} />
          </label>
          <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg">
            Search
          </button>
          {searching && (
            <Link href="/library" className="text-sm text-accent hover:underline">
              Clear
            </Link>
          )}
        </div>
      </form>

      {!searching && (
        <p className="mt-4 text-sm text-muted">
          Try:{" "}
          {EXAMPLES.map((e, i) => (
            <span key={e}>
              {i > 0 && " · "}
              <Link href={`/library?q=${encodeURIComponent(e)}`} className="text-accent hover:underline">
                {e}
              </Link>
            </span>
          ))}
        </p>
      )}

      <p className="mt-8 text-sm text-muted">
        {items.length} {items.length === 1 ? "result" : "results"}
      </p>
      {items.length ? (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/library/${i.id}`} className="flex items-center gap-4 p-3 hover:bg-bg">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {i.thumbnail ? <img src={`/api/library/files/${i.thumbnail}`} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {i.favourite && <span className="text-amber-500">★ </span>}
                    {i.name}
                  </div>
                  <div className="truncate text-sm text-muted">{i.description ?? [i.category, i.site].filter(Boolean).join(" · ")}</div>
                  {i.tags.length > 0 && <div className="mt-1 truncate text-xs text-muted">{i.tags.join(" · ")}</div>}
                </div>
                <span className="shrink-0 text-xs text-muted">{{ animation: "Animation", component: "Component", design_system: "Design system" }[i.kind] ?? i.kind}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
          {searching ? "Nothing matches. Try fewer or different words." : "Nothing saved yet. Explore a website and save something you like."}
        </div>
      )}
    </div>
  );
}
