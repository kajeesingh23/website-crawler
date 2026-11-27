"use client";

import { useState, useTransition } from "react";
import { createPairingCode, removePairing } from "./actions";

type Props = { state: "none" | "waiting" | "paired"; origin: string | null };

export function Pairing({ state, origin }: Props) {
  const [code, setCode] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const make = () => start(async () => setCode(await createPairingCode()));

  return (
    <div className="space-y-4 text-sm">
      <p aria-live="polite">
        {state === "paired" && (
          <>
            <span className="font-medium text-green-700 dark:text-green-400">Connected.</span> The extension can save to your Library.
          </>
        )}
        {state === "waiting" && !code && <span className="font-medium">A code was made but the extension hasn&rsquo;t used it yet.</span>}
        {state === "none" && !code && <span className="font-medium">Not connected.</span>}
      </p>

      {code ? (
        <div className="space-y-2 rounded-lg bg-accent-soft p-4">
          <p>
            Copy this code into the Plax extension: open its side panel, choose <strong>Settings</strong>, paste it and press <strong>Connect</strong>. It&rsquo;s
            shown only once.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-surface px-3 py-2 font-mono">{code}</code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(code).catch(() => undefined);
                setCopied(true);
              }}
              className="rounded-lg bg-ink px-4 py-2 font-medium text-bg"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={make} className="rounded-lg bg-ink px-4 py-2 font-medium text-bg disabled:opacity-60">
            {state === "none" ? "Connect the extension" : "Make a new code"}
          </button>
          {state !== "none" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => removePairing())}
              className="rounded-lg border border-line px-4 py-2 text-danger hover:border-danger disabled:opacity-60"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
      {state === "paired" && origin && <p className="text-xs text-muted">Paired extension: {origin}</p>}
      <p className="text-xs text-muted">
        The code only works from this computer, and only for the captures the extension saves. A new code disconnects the previous one.
      </p>
    </div>
  );
}
