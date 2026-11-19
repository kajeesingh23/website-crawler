import { Suspense } from "react";
import { FILTERS, libraryCounts, listCollections, listItems, type Filter } from "@/lib/library";
import { Board } from "./Board";

export default function BoardPage({ searchParams }: PageProps<"/board">) {
  return (
    <Suspense fallback={null}>
      <BoardData searchParams={searchParams} />
    </Suspense>
  );
}

async function BoardData({ searchParams }: Pick<PageProps<"/board">, "searchParams">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const filter = (one(sp.filter) as Filter) in FILTERS ? (one(sp.filter) as Filter) : "all";
  const collection = one(sp.collection);
  const q = one(sp.q);
  return (
    <Board
      items={listItems({ filter, collection, q })}
      counts={libraryCounts()}
      collections={listCollections()}
      filters={Object.entries(FILTERS) as [Filter, string][]}
      active={{ filter, collection, q }}
    />
  );
}
