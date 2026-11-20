"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { SystemData } from "@/lib/system/extract-system";
import { SECTIONS, designMd, filterSystem, type Section, type Selection } from "@/lib/system/design-md";
import { SystemView } from "@/components/SystemView";

type Collected = { id: string; system: SystemData; pageShot: string | null; shots: (string | null)[] };

const everything = (s: SystemData): Selection =>
  Object.fromEntries(SECTIONS.map((k) => [k, (s[k] as unknown[]).map((_, i) => i)])) as Selection;

export function DesignSystems() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<Collected | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  async function collect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setSaved(null);
    try {
      const res = await fetch("/api/design-systems", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const json = await res.json();
      if (!res.ok) return setError(json.error);
      setData(json);
      setSelection(everything(json.system));
      setName(`${json.system.title || new URL(json.system.url).hostname} design system`);
    } catch {
      setError("The app isn't responding. Check that it's still running.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (section: Section, i: number) =>
    setSelection((s) => ({ ...s, [section]: s[section]?.includes(i) ? s[section]!.filter((x) => x !== i) : [...(s[section] ?? []), i] }));
  const all = (section: Section, on: boolean) =>
    setSelection((s) => ({ ...s, [section]: on && data ? (data.system[section] as unknown[]).map((_, i) => i) : [] }));

  function download() {
    if (!data) return;
    const blob = new Blob([designMd(filterSystem(data.system, selection))], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "design.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    const res = await fetch("/api/design-systems/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: data.id, name, selection }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok) setSaved(json.id);
    else setError(json?.error ?? "Couldn't save. Is the app still running?");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">Collect a website’s design system</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Its colours, type, spacing, corners, shadows, layout, breakpoints, motion and real component examples, measured from the whole page.
        Each one stays an independent reference; nothing is merged into anything else.
      </p>

      <form onSubmit={collect} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="system-url" className="sr-only">
          Website link
        </label>
        <input
          id="system-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a website link to collect its design system..."
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-5 py-3 outline-none focus:border-accent"
        />
        <button type="submit" disabled={busy} className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60">
          {busy ? "Collecting…" : "Collect Design System"}
        </button>
      </form>
      {busy && (
        <p className="mt-3 text-sm text-muted" role="status">
          Reading the whole page in the background. This takes 10 to 30 seconds and doesn’t touch your Explore window.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-10 space-y-10">
          <div className="flex flex-wrap items-start gap-6 rounded-2xl border border-line bg-surface p-5">
            {data.pageShot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.pageShot} alt="The website's first screen" className="w-56 rounded-lg border border-line" />
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="text-xl font-medium">{data.system.title || "Untitled website"}</div>
                <div className="truncate text-sm text-muted">{data.system.url}</div>
              </div>
              <p className="text-sm text-muted">Untick anything you don’t want. Your choice applies to the download and to saving.</p>
              <button type="button" onClick={download} className="rounded-full border border-line px-4 py-2 text-sm hover:border-muted">
                Download design.md
              </button>
              {saved ? (
                <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">
                  Saved to your library.{" "}
                  <Link href={`/library/${saved}`} className="text-accent hover:underline">
                    Open it
                  </Link>
                </p>
              ) : (
                <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="system-name" className="sr-only">
                    Name
                  </label>
                  <input
                    id="system-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    className="min-w-0 flex-1 rounded-full border border-line bg-bg px-4 py-2 text-sm outline-none focus:border-accent"
                  />
                  <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg hover:opacity-90">
                    Save to library
                  </button>
                </form>
              )}
            </div>
          </div>
          <SystemView system={data.system} images={data.shots} selection={selection} onToggle={toggle} onAll={all} />
        </div>
      )}
    </div>
  );
}
