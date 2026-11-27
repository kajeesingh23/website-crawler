"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const NAV = [
  { href: "/analyse", label: "Analyse Website" },
  { href: "/library", label: "Library" },
  { href: "/settings", label: "Settings" },
];

/** Highlights the current page; reading the address needs a loading boundary (see layout). */
export function Sidebar() {
  return <SidebarNav path={usePathname()} />;
}

export function SidebarNav({ path }: { path: string }) {
  return (
    <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <nav aria-label="Main" className="flex items-center gap-2 overflow-x-auto px-4 py-3 md:flex-col md:items-stretch md:gap-1 md:px-3 md:py-6">
        <Link href="/analyse" aria-label="Plax home" className="mr-2 shrink-0 md:mb-8 md:px-3">
          <Logo />
        </Link>
        {NAV.map(({ href, label }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-accent-soft font-medium text-ink" : "text-muted hover:bg-bg hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
