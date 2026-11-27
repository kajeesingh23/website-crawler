/** The Plax mark (two stacked layers: the original and your version) and wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 64 64" aria-hidden className="size-7 shrink-0">
        <rect width="64" height="64" rx="14" className="fill-ink" />
        <rect x="14" y="14" width="26" height="26" rx="6" fill="none" stroke="#8f80ff" strokeWidth="4" />
        <rect x="24" y="24" width="26" height="26" rx="6" fill="#4f3bf5" />
      </svg>
      <span className="font-display text-xl leading-none">plax</span>
    </span>
  );
}
