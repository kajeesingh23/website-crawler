import { Suspense } from "react";
import { Explorer } from "./Explorer";

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <Suspense fallback={null}>
      <WithLink searchParams={searchParams} />
    </Suspense>
  );
}

// "?url=…" (from Home's recent websites) opens that website straight away.
async function WithLink({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const { url } = await searchParams;
  return <Explorer initialUrl={typeof url === "string" ? url : undefined} />;
}
