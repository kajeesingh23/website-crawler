"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Command, Snapshot } from "@/lib/inspector/session";

const NEXT_UP = [
  "Inspect design",
  "Explore animation",
  "View colours",
  "View typography",
  "Capture asset",
  "Recreate component",
  "Save to library",
];

export function Explorer({ initialUrl }: { initialUrl?: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const autoOpened = useRef(false);

  useEffect(() => {
    const es = new EventSource("/api/session/events");
    es.onmessage = (e) => setSnap(JSON.parse(e.data));
    return () => es.close();
  }, []);

  async function open(target: string) {
    setError(undefined);
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      if (!res.ok) setError((await res.json()).error);
    } catch {
      setError("The app isn't responding. Check that it's still running.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialUrl && !autoOpened.current) {
      autoOpened.current = true; // React runs effects twice in development; open only once
      void open(initialUrl);
    }
  }, [initialUrl]);

  const send = (command: Command) =>
    fetch("/api/session/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command }),
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    void open(url);
  }

  const isOpen = snap?.status === "open";
  const sel = snap?.selection;
  const problem = error ?? (snap?.status === "error" ? snap.message : undefined);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">Explore a website</h1>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="url" className="sr-only">
          Website link
        </label>
        <input
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a website link to explore..."
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-5 py-3 outline-none focus:border-accent"
          autoComplete="url"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Opening…" : "Explore Website"}
        </button>
      </form>

      {problem && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {problem}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <Status snap={snap} />
          {isOpen && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={() => send(snap.inspecting ? "inspect-off" : "inspect-on")}
                className={`rounded-full px-5 py-2.5 text-sm font-medium ${
                  snap.inspecting ? "bg-accent text-white" : "bg-ink text-bg"
                }`}
              >
                {snap.inspecting ? "Stop selecting" : "Start selecting"}
              </button>
              <button
                onClick={() => fetch("/api/session", { method: "DELETE" })}
                className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-muted"
              >
                Close website
              </button>
            </div>
          )}
          <ol className="mt-8 space-y-3 text-sm text-muted">
            <Step n={1} text="Paste a link above. The website opens in its own window, working exactly as it does for visitors." />
            <Step n={2} text="Press Start selecting (here or on the website), then move your cursor over anything." />
            <Step n={3} text="Click to pick it. Its details appear here. Press Esc on the website to clear." />
          </ol>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6" aria-live="polite">
          {sel ? (
            <>
              <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(var(--line)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                {sel.screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL preview, nothing to optimise
                  <img src={sel.screenshot} alt={`Preview of the selected ${sel.label.toLowerCase()}`} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-sm text-muted">Capturing preview…</span>
                )}
              </div>
              <div className="mt-5 flex items-baseline justify-between gap-4">
                <h2 className="text-2xl font-medium">{sel.label}</h2>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {sel.width} × {sel.height}
                </span>
              </div>
              {sel.text && <p className="mt-1 line-clamp-2 text-muted">“{sel.text}”</p>}
              {sel.note && <p className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">{sel.note}</p>}

              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                {sel.hasParent && <Chip onClick={() => send("parent")}>Select larger area</Chip>}
                {sel.hasChild && <Chip onClick={() => send("child")}>Select inside</Chip>}
                <Chip onClick={() => send("prev")}>Previous</Chip>
                <Chip onClick={() => send("next")}>Next</Chip>
                <Chip onClick={() => send("clear")}>Clear</Chip>
              </div>

              <div className="mt-8 border-t border-line pt-5">
                <h3 className="text-sm font-medium">Coming in the next phases</h3>
                <p className="mt-2 text-sm text-muted">{NEXT_UP.join(" · ")}</p>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
              <div className="font-medium">Nothing selected yet</div>
              <p className="mt-1 max-w-xs text-sm text-muted">
                Turn on selecting, hover over the website, and click anything you like.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Status({ snap }: { snap: Snapshot | null }) {
  if (!snap) return <p className="text-sm text-muted">Connecting…</p>;
  const lines: Record<Snapshot["status"], string> = {
    idle: "No website open yet.",
    opening: "Opening the website…",
    open: snap.inspecting ? "Selecting: hover and click on the website." : "Open in its own window.",
    closed: "The website window was closed. Explore a link to open it again.",
    error: "Couldn't open that website.",
  };
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`size-2 rounded-full ${
            snap.status === "open" ? (snap.inspecting ? "bg-accent" : "bg-green-500") : snap.status === "error" ? "bg-danger" : "bg-muted"
          }`}
        />
        {lines[snap.status]}
      </div>
      {snap.status === "open" && (
        <div className="mt-3">
          <div className="truncate font-medium">{snap.title || "Untitled page"}</div>
          <div className="truncate text-sm text-muted">{snap.url}</div>
        </div>
      )}
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg text-xs font-medium text-ink">{n}</span>
      {text}
    </li>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-full border border-line px-4 py-2 hover:border-muted">
      {children}
    </button>
  );
}
