import Link from "next/link";
import { connection } from "next/server";
import { getHomeData } from "@/lib/db";

export default async function Home() {
  await connection(); // always show the library as it is right now
  const d = getHomeData();
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
          <Empty
            title="Start your collection"
            body="Select something you like on a website and save it. It will show up here and on My Board."
          />
        </section>
      </div>
    </div>
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
