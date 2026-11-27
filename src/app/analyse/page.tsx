import { Suspense } from "react";
import { getHomeData } from "@/lib/db";
import { Explorer } from "./Explorer";

export const metadata = { title: "Analyse Website" };

export default function AnalysePage({ searchParams }: PageProps<"/analyse">) {
  return (
    <Suspense fallback={null}>
      <WithLink searchParams={searchParams} />
    </Suspense>
  );
}

// "?url=…" (from the Library's websites) opens that website straight away.
async function WithLink({ searchParams }: Pick<PageProps<"/analyse">, "searchParams">) {
  const { url } = await searchParams;
  return <Explorer initialUrl={typeof url === "string" ? url : undefined} recent={getHomeData().recentWebsites} />;
}
