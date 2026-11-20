import Link from "next/link";
import { connection } from "next/server";
import { getHomeData } from "@/lib/db";
import { listCollections, listItems, type ItemCard } from "@/lib/library";

export default async function Home() {
  await connection(); // always show the library as it is right now
  const d = getHomeData();
  const all = listItems();
  const recent = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const favourites = all.filter((i) => i.favourite).slice(0, 6);
  const collections = listCollections().slice(0, 6);
  const stats = [
    ["Saved components", d.components],
    ["Saved animations", d.animations],
    ["Collections", d.collections],
    ["Websites explored", d.websites],
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <section className="py-6 md:py-12">
        <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">Your personal design library.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted">Discover, collect and reuse the details that make great websites.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/explore" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg hover:opacity-90">
            Explore a Website
          </Link>
          <Link href="/board" className="rounded-full border border-line bg-surface px-6 py-3 text-sm font-medium hover:border-muted">
            Open My Board
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-5">
            <div className="text-3xl font-medium tabular-nums">{n}</div>
            <div className="mt-1 text-sm text-muted">{label}</div>
          </div>
        ))}
      </section>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">Recently explored websites</h2>
          {d.recentWebsites.length ? (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {d.recentWebsites.map((w) => (
                <li key={w.url}>
                  <Link href={`/explore?url=${encodeURIComponent(w.url)}`} className="block px-5 py-4 hover:bg-bg">
                    <div className="truncate font-medium">{w.title || new URL(w.url).hostname}</div>
                    <div className="truncate text-sm text-muted">{w.url}</div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No websites yet" body="Websites you explore will appear here, so you can return to them in one click." />
          )}
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">Recently saved</h2>
          {recent.length ? (
            <Thumbs items={recent} />
          ) : (
            <Empty
              title="Start your collection"
              body="Select something you like on a website and save it. It will show up here and on My Board."
            />
          )}
        </section>
      </div>

      {(favourites.length > 0 || collections.length > 0) && (
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted">Favourites</h2>
            {favourites.length ? <Thumbs items={favourites} /> : <Empty title="No favourites yet" body="Star anything on My Board to keep it close." />}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted">Recent collections</h2>
            {collections.length ? (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {collections.map((c) => (
                  <li key={c.id}>
                    <Link href={`/board?collection=${c.id}`} className="flex justify-between px-5 py-3 hover:bg-bg">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="text-sm text-muted tabular-nums">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No collections yet" body="Group references on My Board, like Premium Navigation or Creative Animations." />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Thumbs({ items }: { items: ItemCard[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/library/${i.id}`} className="block overflow-hidden rounded-xl border border-line bg-surface hover:border-muted">
            <div className="flex h-20 items-center justify-center bg-bg p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.thumbnail ? <img src={`/api/library/files/${i.thumbnail}`} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : null}
            </div>
            <div className="truncate px-2 py-1.5 text-xs">{i.name}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-8">
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
