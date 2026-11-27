"use client";

import { useState } from "react";
import { MODES, buildPrompt, type Mode, type PromptInput } from "@/lib/export/prompt";
import { componentName, designTokens, reactWrapper, toTailwind } from "@/lib/export/code";

const FORMATS = { html: "HTML and CSS", tailwind: "Tailwind", tokens: "Design tokens (JSON)", react: "React" } as const;
type Format = keyof typeof FORMATS;

/** Build Prompt and code export for one capture or saved item. Everything here works without a Claude key. */
export function BuildPanel({ input, react, itemId }: { input: PromptInput & { html: string }; react?: string; itemId?: string }) {
  const [mode, setMode] = useState<Mode>("pixel");
  const [format, setFormat] = useState<Format>("html");
  const [claudeReact, setClaudeReact] = useState(react);
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  const slug = componentName(input.name);

  const prompt = buildPrompt(input, mode);
  const code: Record<Format, { text: string; file: string; type: string }> = {
    html: { text: input.html, file: `${slug}.html`, type: "text/html" },
    tailwind: { text: toTailwind(input.html), file: `${slug}.tailwind.html`, type: "text/html" },
    tokens: { text: JSON.stringify(designTokens(input.design, input.motion), null, 2), file: `${slug}.tokens.json`, type: "application/json" },
    react: { text: claudeReact ?? reactWrapper(input.html, input.name), file: `${slug}.tsx`, type: "text/plain" },
  };

  async function convert() {
    setState({ busy: true });
    const res = await fetch("/api/library/react", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: itemId }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok) {
      setClaudeReact(json.react);
      setState({});
    } else setState({ error: json?.error ?? "The app isn't responding. Check that it's still running." });
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="prompt-title">
        <h2 id="prompt-title" className="font-display text-3xl">
          Build a prompt
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">Paste it into Claude Code, Cursor, v0 or any AI tool. Written from what was measured; no AI used here.</p>
        <Choice label="What should the prompt ask for?" options={MODES} value={mode} onChange={setMode} />
        <Output text={prompt} file={`${slug}-${mode}-prompt.md`} type="text/markdown" />
      </section>

      <section aria-labelledby="code-title">
        <h2 id="code-title" className="font-display text-3xl">
          Code
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">Exported from the exact copy and the measurements.</p>
        <Choice label="Format" options={FORMATS} value={format} onChange={setFormat} />
        {format === "react" && !claudeReact && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn-ink">
            <span className="min-w-0 flex-1">This is the exact copy wrapped in a React component, made without AI. It looks right but isn&rsquo;t idiomatic React.</span>
            {itemId && (
              <button type="button" disabled={state.busy} onClick={convert} className="rounded-lg bg-ink px-4 py-2 font-medium text-bg disabled:opacity-60">
                {state.busy ? "Claude is converting… (up to a minute)" : "Convert to React with Claude"}
              </button>
            )}
          </div>
        )}
        {format === "react" && claudeReact && <p className="mb-3 text-sm text-muted">Written by Claude from the exact copy and the measurements. Check it before using it.</p>}
        {state.error && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {state.error}
          </p>
        )}
        <Output {...code[format]} />
      </section>
    </div>
  );
}

function Choice<K extends string>({ label, options, value, onChange }: { label: string; options: Record<K, string>; value: K; onChange: (k: K) => void }) {
  return (
    <fieldset className="mb-3">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(options) as [K, string][]).map(([k, text]) => (
          <label
            key={k}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              value === k ? "border-ink bg-ink text-bg" : "border-line hover:border-muted"
            }`}
          >
            <input type="radio" className="sr-only" checked={value === k} onChange={() => onChange(k)} />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Output({ text, file, type }: { text: string; file: string; type: string }) {
  const [copied, setCopied] = useState(false);
  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = file;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg bg-ink px-4 py-2 font-medium text-bg"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={download} className="rounded-lg border border-line px-4 py-2 hover:border-muted">
          Download {file.slice(file.lastIndexOf("."))}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? "Copied to the clipboard" : ""}
        </span>
      </div>
      <pre tabIndex={0} aria-label="Output" className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-bg p-4 font-mono text-xs">
        {text}
      </pre>
    </div>
  );
}
