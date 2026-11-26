import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Old addresses from before Plax keep working (bookmarks, links in notes). Query strings carry over.
  async redirects() {
    return [
      { source: "/", destination: "/analyse", permanent: false },
      { source: "/explore", destination: "/analyse", permanent: true },
      { source: "/board", destination: "/library", permanent: true },
      { source: "/board/compare", destination: "/library/compare", permanent: true },
      { source: "/design-systems", destination: "/library?tab=design-systems", permanent: true },
    ];
  },
};

export default nextConfig;
