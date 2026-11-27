"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Design } from "@/lib/inspector/extract";
import { applyOverrides, type Overrides } from "@/lib/recreate/document";
import { RATIOS, applyContent, applyLayout, listEditable, type ContentEdits, type Editable, type Layout } from "@/lib/recreate/content";
import { Studio } from "@/app/analyse/Recreate";

const MAX_UPLOAD = 2_000_000;

/** Change a saved copy's look, text, pictures, size and layout, then keep it as a variation. */
export function Customise({ id, name, html, design, width }: { id: string; name: string; html: string; design?: Design; width: number }) {
  const [editable, setEditable] = useState<Editable | null>(null); // read on first open (needs the browser)
  if (!editable)
    return (
      <div className="rounded-xl border border-dashed border-line p-6">
        <p className="text-sm text-muted">Change colours, text, pictures, size and layout. Your changes are saved as a new variation; this original stays as it is.</p>
        <button type="button" onClick={() => setEditable(listEditable(html))} className="mt-4 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-bg">
          Start customising
        </button>
      </div>
    );
  return <Editor id={id} name={name} html={html} design={design} width={width} editable={editable} />;
}

function Editor({ id, name, html, design, width, editable }: { id: string; name: string; html: string; design?: Design; width: number; editable: Editable }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Overrides>({});
  const [edits, setEdits] = useState<ContentEdits>({});
  const [layout, setLayout] = useState<Layout>({});
  const [title, setTitle] = useState(`${name} (variation)`.slice(0, 120));
  const [state, setState] = useState<{ busy?: boolean; error?: string; saved?: string }>({});
  const result = applyLayout(applyOverrides(applyContent(html, edits), overrides), layout);
  const changed =
    Object.keys(overrides).length + Object.keys(edits.texts ?? {}).length + Object.keys(edits.images ?? {}).length + Object.values(layout).filter((v) => v !== undefined && v !== "").length > 0;

  const setText = (i: number, v: string) => setEdits((e) => ({ ...e, texts: { ...e.texts, [i]: v } }));
  const setImage = (i: number, patch: { src?: string; fit?: string; alt?: string }) =>
    setEdits((e) => ({ ...e, images: { ...e.images, [i]: { ...e.images?.[i], ...patch } } }));
  const num = (v: string) => (v === "" ? undefined : Number(v));

  function upload(i: number, file?: File) {
    if (!file) return;
    if (file.size > MAX_UPLOAD) return setState({ error: "Pictures can be up to 2 MB." });
    const reader = new FileReader();
    reader.onload = () => setImage(i, { src: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch("/api/library/variations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name: title, html: result, width: layout.width ?? width, changes: { overrides, texts: edits.texts, layout } }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok) return setState({ error: json?.error ?? "Couldn't save. Is the app still running?" });
    setState({ saved: json.id });
    router.refresh(); // shows the new variation in this page's list
  }

  const input = "w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        {/* no permissions: the copy can never run scripts in the app */}
        <iframe title={`Preview of ${title}`} sandbox="" srcDoc={result} className="h-[28rem] w-full rounded-xl border border-line bg-white" />
        <p className="mt-2 text-xs text-muted">Live preview. The original is never changed.</p>
      </div>

      <div className="space-y-6">
        <Group title="Look">
          <Studio design={design} overrides={overrides} onChange={setOverrides} narrow />
        </Group>

        {editable.texts.length > 0 && (
          <Group title="Text">
            {editable.texts.map((t, i) => (
              <label key={i} className="block text-sm">
                <span className="sr-only">Text {i + 1}</span>
                <input value={edits.texts?.[i] ?? t} maxLength={500} onChange={(e) => setText(i, e.target.value)} className={input} />
              </label>
            ))}
          </Group>
        )}

        {editable.images.length > 0 && (
          <Group title="Pictures">
            {editable.images.map((img, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-line p-3 text-sm">
                <div className="font-medium">Picture {i + 1}</div>
                <label className="block">
                  <span className="text-muted">Web address</span>
                  <input
                    defaultValue={img.src.startsWith("data:") ? "" : img.src}
                    placeholder="https://…"
                    onBlur={(e) => e.target.value && setImage(i, { src: e.target.value.trim() })}
                    className={input}
                  />
                </label>
                <label className="block">
                  <span className="text-muted">Or upload one (up to 2 MB)</span>
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" onChange={(e) => upload(i, e.target.files?.[0])} className="block w-full text-sm" />
                </label>
                <label className="block">
                  <span className="text-muted">Description for screen readers</span>
                  <input defaultValue={img.alt} maxLength={200} onBlur={(e) => setImage(i, { alt: e.target.value })} className={input} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-muted">How it fills its box</span>
                  <select value={edits.images?.[i]?.fit ?? img.fit} onChange={(e) => setImage(i, { fit: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1">
                    <option value="">Original</option>
                    <option value="cover">Fill and crop</option>
                    <option value="contain">Fit inside</option>
                    <option value="fill">Stretch</option>
                    <option value="none">Actual size</option>
                  </select>
                </label>
              </div>
            ))}
          </Group>
        )}

        <Group title="Size and layout">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label htmlFor="layout-width-px" className="text-muted">Width (px)</label>
              <input id="layout-width-px" type="number" min={1} max={4000} placeholder={String(Math.round(width))} value={layout.width ?? ""} onChange={(e) => setLayout({ ...layout, width: num(e.target.value) })} className={input} />
            </div>
            <div>
              <label htmlFor="layout-height-px" className="text-muted">Height (px)</label>
              <input id="layout-height-px" type="number" min={1} max={4000} placeholder="Auto" value={layout.height ?? ""} onChange={(e) => setLayout({ ...layout, height: num(e.target.value) })} className={input} />
            </div>
            <div>
              <label htmlFor="layout-shape" className="text-muted">Shape</label>
              <select id="layout-shape" value={layout.ratio ?? ""} onChange={(e) => setLayout({ ...layout, ratio: e.target.value as Layout["ratio"] })} className={input}>
                {Object.entries(RATIOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="layout-arrange-items" className="text-muted">Arrange items</label>
              <select id="layout-arrange-items" value={layout.direction ?? ""} onChange={(e) => setLayout({ ...layout, direction: (e.target.value || undefined) as Layout["direction"] })} className={input}>
                <option value="">Original</option>
                <option value="row">Side by side</option>
                <option value="column">Stacked</option>
              </select>
            </div>
            <div>
              <label htmlFor="layout-space-between-px" className="text-muted">Space between (px)</label>
              <input id="layout-space-between-px" type="number" min={0} max={400} placeholder="Original" value={layout.gap ?? ""} onChange={(e) => setLayout({ ...layout, gap: num(e.target.value) })} className={input} />
            </div>
            <div>
              <label htmlFor="layout-align-items" className="text-muted">Align items</label>
              <select id="layout-align-items" value={layout.align ?? ""} onChange={(e) => setLayout({ ...layout, align: (e.target.value || undefined) as Layout["align"] })} className={input}>
                <option value="">Original</option>
                <option value="flex-start">Start</option>
                <option value="center">Centre</option>
                <option value="flex-end">End</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
          </div>
        </Group>

        {state.saved ? (
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm" role="status">
            Saved as a variation.{" "}
            <Link href={`/library/${state.saved}`} className="font-medium text-accent hover:underline">
              Open it
            </Link>
          </p>
        ) : (
          <form onSubmit={save} className="space-y-2 border-t border-line pt-5">
            <label htmlFor="variation-name" className="text-sm font-medium">
              Name
            </label>
            <input id="variation-name" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={input} />
            <button
              type="submit"
              disabled={!changed || state.busy || !title.trim()}
              className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {state.busy ? "Saving…" : "Save as variation"}
            </button>
            {!changed && <p className="text-xs text-muted">Change something first.</p>}
            {state.error && (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}
