import { Explorer } from "./Explorer";

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const { url } = await searchParams;
  return <Explorer initialUrl={typeof url === "string" ? url : undefined} />;
}
