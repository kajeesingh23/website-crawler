"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Selection } from "@/lib/inspector/session";
import { FONTS, SHADOWS, applyOverrides, type CompareRow, type Overrides, type Recreation } from "@/lib/recreate/document";

type Version = Recreation & { source: "copy" | "claude" | "improve" | "edit"; compare: CompareRow[]; screenshot: string };

const LABEL: Record<Version["source"], string> = {
  copy: "Exact copy",
  claude: "Claude",
  improve: "Improved",
  edit: "Edited",
};

export function RecreatePanel({ sel }: { sel: Selection }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState(true);
  const [overrides, setOverrides] = useState<Overrides>({});
  const v = versions[current];

  async function run(action: Version["source"], instruction?: string) {
    setBusy(action);
    setError(undefined);
    try {
      const res = await fetch("/api/recreate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, current: v && { html: v.html, react: v.react }, instruction }),
      });
      const json = await res.json();
      if (json.notConnected) {
        setConnected(false);
        // Still give a result: the exact copy needs no AI.
        if (action === "claude" && !versions.length) return run("copy");
      }
      if (!res.ok) return setError(json.error);
      const next = [...versions, json.version as Version];
      setVersions(next);
      setCurrent(next.length - 1);
    } catch {
      setError("The app isn't responding. Check that it's still running.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">Recreate</h3>
          <p className="text-sm text-muted">Turn it into code you can reuse, check how close it is, and make it yours.</p>
        </div>
        {!versions.length && (
          <button
            type="button"
            disabled={!!busy || !sel.design}
            onClick={() => run("claude")}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Recreating…" : "Recreate This Component"}
          </button>
        )}
      </div>

      {busy && (
        <p className="mt-3 text-sm text-muted" role="status">
          {busy === "copy" ? "Making an exact copy and measuring it…" : "Claude is working on it. This can take a minute…"}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {!connected && (
        <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">
          Claude isn’t connected, so this is an exact copy made without AI. To get clean, reusable code, an improved match and
          changes by instruction, add <code className="font-mono">ANTHROPIC_API_KEY</code> to <code className="font-mono">.env.local</code>{" "}
          and restart the app.
        </p>
      )}

      {v && (
        <div className="mt-6 space-y-8">
          {versions.length > 1 && (
            <div role="tablist" aria-label="Versions" className="flex flex-wrap gap-2">
              {versions.map((x, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === current}
                  onClick={() => setCurrent(i)}
                  className={`rounded-full border px-3 py-1 text-sm ${i === current ? "border-ink bg-ink text-bg" : "border-line hover:border-muted"}`}
                >
                  {i + 1}. {LABEL[x.source]}
                </button>
              ))}
            </div>
          )}

          <SideBySide original={sel.screenshot} version={v} overrides={overrides} height={sel.height} />
          <Match v={v} />

          <div className="flex flex-wrap gap-2">
            {v.source === "copy" && connected && (
              <Action busy={busy === "claude"} onClick={() => run("claude")}>
                Recreate with Claude
              </Action>
            )}
            {connected && (
              <Action busy={busy === "improve"} onClick={() => run("improve")}>
                Improve the Match
              </Action>
            )}
          </div>

          <Studio sel={sel} overrides={overrides} onChange={setOverrides} />
          {connected && <Instruction busy={busy === "edit"} onSend={(text) => run("edit", text)} />}
          <Code v={v} overrides={overrides} />
          <SaveComponent key={current} v={v} overrides={overrides} />
        </div>
      )}
    </section>
  );
}

function Action({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm hover:border-muted disabled:opacity-60">
      {busy ? "Working…" : children}
    </button>
  );
}

function SideBySide({ original, version, overrides, height }: { original?: string; version: Version; overrides: Overrides; height: number }) {
  const [mode, setMode] = useState<"side" | "overlay">("side");
  const [mix, setMix] = useState(50);
  const frameHeight = Math.min(Math.max(height + 80, 160), 640);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        {(["side", "overlay"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 ${mode === m ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
          >
            {m === "side" ? "Side by side" : "Overlay"}
          </button>
        ))}
      </div>
      {mode === "side" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <figure>
            <figcaption className="mb-1 text-xs text-muted">Original website</figcaption>
            <div className="flex items-center justify-center overflow-hidden rounded-xl border border-line bg-bg p-4" style={{ height: frameHeight }}>
              {original ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={original} alt="The original" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-muted">No preview</span>
              )}
            </div>
          </figure>
          <figure>
            <figcaption className="mb-1 text-xs text-muted">Recreated (live, try hovering)</figcaption>
            {/* sandbox with no permissions: the recreation can never run scripts in this app */}
            <iframe
              title="Recreated component"
              sandbox=""
              srcDoc={applyOverrides(version.html, overrides)}
              className="w-full rounded-xl border border-line bg-white"
              style={{ height: frameHeight }}
            />
          </figure>
        </div>
      ) : (
        <div>
          <div className="relative grid place-items-center overflow-hidden rounded-xl border border-line bg-bg p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={version.screenshot} alt="Recreated" className="col-start-1 row-start-1 max-w-full" />
            {original && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={original} alt="Original" className="col-start-1 row-start-1 max-w-full" style={{ opacity: mix / 100 }} />
            )}
          </div>
          <label className="mt-2 flex items-center gap-3 text-xs text-muted">
            Recreated
            <input type="range" min={0} max={100} value={mix} onChange={(e) => setMix(Number(e.target.value))} className="flex-1" />
            Original
          </label>
          <p className="mt-1 text-xs text-muted">Both images are at their real size. Slide to see where they differ.</p>
        </div>
      )}
    </div>
  );
}

function Match({ v }: { v: Version }) {
  const [all, setAll] = useState(false);
  const hits = v.compare.filter((r) => r.match).length;
  const rows = all ? v.compare : v.compare.filter((r) => !r.match);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-lg">
          Matches <strong className="font-medium">{hits} of {v.compare.length}</strong> measured properties
        </p>
        {v.confidence !== undefined && <p className="text-sm text-muted">Claude’s own estimate: {v.confidence}% close</p>}
      </div>
      <p className="text-xs text-muted">Both sides are measured the same way, on real rendered pages. It’s not a pixel-perfect guarantee.</p>
      {rows.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 font-normal">Property</th>
              <th className="py-1 font-normal">Original</th>
              <th className="py-1 font-normal">Recreated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="py-1.5 pr-3">
                  <span aria-hidden className={r.match ? "text-green-600" : "text-danger"}>
                    {r.match ? "✓" : "✕"}
                  </span>{" "}
                  {r.label}
                </td>
                <td className="py-1.5 pr-3 font-mono text-xs">{r.original}</td>
                <td className="py-1.5 font-mono text-xs">{r.recreated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => setAll(!all)} className="text-sm text-accent hover:underline">
        {all ? "Show only differences" : "Show every property"}
      </button>
      {v.notes && <p className="text-sm">{v.notes}</p>}
      {v.unknowns.length > 0 && (
        <div className="rounded-xl bg-bg p-4 text-sm">
          <div className="mb-1 font-medium">Couldn’t be observed, so it’s a best guess</div>
          <ul className="list-disc space-y-0.5 pl-5 text-muted">
            {v.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Studio({ sel, overrides, onChange }: { sel: Selection; overrides: Overrides; onChange: (o: Overrides) => void }) {
  const a = sel.design?.appearance;
  const set = (patch: Overrides) => onChange({ ...overrides, ...patch });
  const slider = (key: "typeScale" | "space" | "radiusScale" | "speed", label: string, min: number, max: number, hint: (n: number) => string) => (
    <label className="grid grid-cols-[8rem_1fr_4rem] items-center gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <input type="range" min={min} max={max} step={0.05} value={overrides[key] ?? 1} onChange={(e) => set({ [key]: Number(e.target.value) })} />
      <span className="text-right tabular-nums">{hint(overrides[key] ?? 1)}</span>
    </label>
  );
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="font-medium">Customise</h4>
        {Object.keys(overrides).length > 0 && (
          <button type="button" onClick={() => onChange({})} className="text-sm text-accent hover:underline">
            Back to original
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Background</span>
            <input type="color" value={overrides.bg ?? a?.background?.hex ?? a?.sitsOn?.hex ?? "#ffffff"} onChange={(e) => set({ bg: e.target.value })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Text colour</span>
            <input type="color" value={overrides.text ?? a?.text.hex ?? "#000000"} onChange={(e) => set({ text: e.target.value })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Font</span>
            <select value={overrides.font ?? ""} onChange={(e) => set({ font: e.target.value || undefined })} className="rounded-lg border border-line bg-surface px-2 py-1">
              <option value="">Original ({sel.design?.typography.family})</option>
              {Object.keys(FONTS).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Shadow</span>
            <select value={overrides.shadow ?? ""} onChange={(e) => set({ shadow: e.target.value || undefined })} className="rounded-lg border border-line bg-surface px-2 py-1">
              <option value="">Original</option>
              {Object.keys(SHADOWS).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-3">
          {slider("typeScale", "Text size", 0.5, 2, pct)}
          {slider("space", "Spacing", 0, 3, pct)}
          {slider("radiusScale", "Corner roundness", 0, 4, pct)}
          {slider("speed", "Animation length", 0.25, 3, (n) => `${Math.round(n * 100) / 100}×`)}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Changes show live on the recreated side and are included when you copy or save.</p>
    </div>
  );
}

function Instruction({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onSend(text.trim());
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="claude-change" className="sr-only">
        Change with Claude
      </label>
      <input
        id="claude-change"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        placeholder="Tell Claude what you want to change..."
        className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-accent"
      />
      <button type="submit" disabled={busy} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60">
        {busy ? "Changing…" : "Change it"}
      </button>
    </form>
  );
}

function Code({ v, overrides }: { v: Version; overrides: Overrides }) {
  const [tab, setTab] = useState<"html" | "react">("html");
  const [copied, setCopied] = useState(false);
  const code = tab === "html" ? applyOverrides(v.html, overrides) : (v.react ?? "");
  return (
    <details className="rounded-xl border border-line">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Code</summary>
      <div className="border-t border-line p-4">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <button type="button" onClick={() => setTab("html")} className={tab === "html" ? "font-medium" : "text-muted"}>
            HTML and CSS
          </button>
          {v.react && (
            <button type="button" onClick={() => setTab("react")} className={tab === "react" ? "font-medium" : "text-muted"}>
              React
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(code).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="ml-auto text-accent hover:underline"
          >
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
        <pre className="max-h-96 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs">{code}</pre>
      </div>
    </details>
  );
}

function SaveComponent({ v, overrides }: { v: Version; overrides: Overrides }) {
  const [name, setName] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/library/components", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, html: v.html, react: v.react, overrides, notes: v.notes, confidence: v.confidence, unknowns: v.unknowns, compare: v.compare, source: v.source }),
    }).catch(() => null);
    if (res?.ok) setState({ ok: true });
    else setState({ error: (await res?.json().catch(() => null))?.error ?? "Couldn't save. Is the app still running?" });
  }
  if (state.ok) return <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">Saved to your library, with its code.</p>;
  return (
    <form onSubmit={save} className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row">
      <label htmlFor="component-name" className="sr-only">
        Component name
      </label>
      <input
        id="component-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        placeholder="Name this component, e.g. Calm studio card"
        className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-accent"
      />
      <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg hover:opacity-90">
        Save component
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-danger sm:basis-full">
          {state.error}
        </p>
      )}
    </form>
  );
}
