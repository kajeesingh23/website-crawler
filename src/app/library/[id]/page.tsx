import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getItem, listCollections } from "@/lib/library";
import { ItemDetailView } from "./ItemDetail";

export default function ItemPage({ params }: PageProps<"/library/[id]">) {
  return (
    <Suspense fallback={null}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/library/[id]">, "params">) {
  const item = getItem((await params).id);
  if (!item) notFound();
  return <ItemDetailView item={item} collections={listCollections()} />;
}
