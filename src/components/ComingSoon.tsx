import Link from "next/link";

/** Honest placeholder for sections built in later phases. */
export function ComingSoon({ title, intro, phase }: { title: string; intro: string; phase: number }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">{title}</h1>
      <p className="mt-3 text-lg text-muted">{intro}</p>
      <div className="mt-8 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
        <div className="font-medium">Arrives in Phase {phase}</div>
        <p className="mt-1 text-sm text-muted">Meanwhile, explore a website and try selecting things you like.</p>
        <Link href="/explore" className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg">
          Explore a Website
        </Link>
      </div>
    </div>
  );
}
