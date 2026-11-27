import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { dataDir } from "@/lib/db";
import { getPairing } from "@/lib/pairing";
import { Pairing } from "./Pairing";
import { Theme } from "./Theme";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-4xl md:text-5xl">Settings</h1>
      <Section title="Appearance" intro="Plax follows your computer's light or dark mode unless you pick one here.">
        <Theme />
      </Section>
      <Suspense fallback={null}>
        <Status />
      </Suspense>
    </div>
  );
}

async function Status() {
  await connection(); // read the environment at request time, not at build time
  const claude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const pairing = getPairing();
  return (
    <>
      <Section title="Browser extension" intro="Connect the Plax extension so it can save what you select straight into this Library.">
        <Pairing state={!pairing ? "none" : pairing.origin ? "paired" : "waiting"} origin={pairing?.origin ?? null} />
      </Section>
      <Section title="Claude" intro="Optional. Everything except AI recreation, AI edits and React conversion works without it.">
        <p className="text-sm">
          {claude ? (
            <span className="font-medium text-green-700 dark:text-green-400">A Claude key was found.</span>
          ) : (
            <>
              <span className="font-medium">No Claude key found.</span> To connect Claude, add{" "}
              <code className="font-mono">ANTHROPIC_API_KEY=…</code> to a file called <code className="font-mono">.env.local</code> in the app folder, then
              restart the app. (A sign-in made with <code className="font-mono">ant auth login</code> also works, but can&rsquo;t be checked from here.)
            </>
          )}
        </p>
      </Section>
      <Section title="Where your library lives" intro="Everything stays on this computer. Nothing is uploaded.">
        <p className="break-all font-mono text-sm">{dataDir}</p>
      </Section>
    </>
  );
}

function Section({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted">{intro}</p>
      {children}
    </section>
  );
}
