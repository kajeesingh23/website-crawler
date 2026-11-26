import Link from "next/link";
import { Suspense } from "react";
import { FILTERS, filterOptions, libraryCounts, listCollections, listItems, listWebsites, type Filter, type Query } from "@/lib/library";
import { DesignSystems } from "./DesignSystems";
import { Board } from "./Board";

const TABS = {
  components: "Components",
  websites: "Websites",
  "design-systems": "Design Systems",
  assets: "Assets",
  collections: "Collections",
  variations: "Variations",
} as const;
type Tab = keyof typeof TABS;

export const metadata = { title: "Library" };

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <Suspense fallback={null}>
      <Library searchParams={searchParams} />
    </Suspense>
  );
}

async function Library({ searchParams }: Pick<PageProps<"/library">, "searchParams">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const tab: Tab = (one("tab") ?? "") in TABS ? (one("tab") as Tab) : "components";
  const filter = (one("filter") ?? "") in FILTERS ? (one("filter") as Filter) : "all";
  const query: Query = {
    filter,
    q: one("q"),
    collection: one("collection"),
    website: one("website"),
    category: one("category"),
    tag: one("tag"),
    from: one("from"),
    to: one("to"),
  };
  const counts = libraryCounts();
  const collections = listCollections();
  const board = { collections };

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="font-display text-4xl md:text-5xl">Library</h1>
      <p className="mt-2 text-sm text-muted">
        {counts.total} saved · {counts.components} components · {counts.animations} animations · {counts.assets} assets · {counts.designSystems} design
        systems · {counts.variations} variations · {counts.favourites} favourites
      </p>

      <nav aria-label="Library sections" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {(Object.entries(TABS) as [Tab, string][]).map(([key, label]) => (
          <Link
            key={key}
            href={key === "components" ? "/library" : `/library?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${tab === key ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "components" && (
          <Board
            {...board}
            options={filterOptions()}
            tab="components"
            // A collection or a website shows everything in it; otherwise this tab is components and animations.
            items={listItems({ ...query, kinds: query.collection || query.website ? undefined : ["component", "animation", "typography", "layout", "section"] })}
            total={counts.total - counts.designSystems - counts.assets}
            filters={(Object.entries(FILTERS) as [Filter, string][]).filter(([k]) => k !== "asset")}
            active={query}
          />
        )}
        {tab === "assets" && <Board {...board} tab="assets" items={listItems({ ...query, kinds: ["asset"] })} total={counts.assets} active={query} />}
        {tab === "variations" && (
          <Board {...board} tab="variations" items={listItems({ ...query, variations: true })} total={counts.variations} active={query} />
        )}
        {tab === "design-systems" && (
          <div className="space-y-12">
            <Board {...board} tab="design-systems" items={listItems({ ...query, kinds: ["design_system"] })} total={counts.designSystems} active={query} />
            <DesignSystems />
          </div>
        )}
        {tab === "websites" && <Websites />}
        {tab === "collections" && <Collections collections={collections} />}
      </div>
    </div>
  );
}

function Websites() {
  const sites = listWebsites();
  if (!sites.length) return <Empty text="Websites you analyse appear here, grouped with everything you saved from them." />;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {sites.map((w) => (
        <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{w.title || w.url}</div>
            <div className="truncate text-sm text-muted">{w.url}</div>
            <div className="mt-1 text-xs text-muted">
              {w.items} saved · {w.analyses} {w.analyses === 1 ? "session" : "sessions"} from the extension · last visited {w.lastSeen.slice(0, 10)}
            </div>
          </div>
          {w.items > 0 && (
            <Link href={`/library?website=${w.id}`} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-muted">
              Show saved items
            </Link>
          )}
          <Link href={`/analyse?url=${encodeURIComponent(w.url)}`} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-muted">
            Analyse again
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Collections({ collections }: { collections: { id: string; name: string; count: number }[] }) {
  if (!collections.length)
    return <Empty text="Group references into collections, like Premium Navigation. Create one from the Components tab, then add items to it." />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((c) => (
        <li key={c.id}>
          <Link href={`/library?collection=${c.id}`} className="flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-4 hover:border-muted">
            <span className="truncate font-medium">{c.name}</span>
            <span className="text-sm tabular-nums text-muted">{c.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">{text}</div>;
}
