"use client";

import { useSyncExternalStore } from "react";

const CHOICES = [
  ["system", "Match my computer"],
  ["light", "Light"],
  ["dark", "Dark"],
] as const;
type Choice = (typeof CHOICES)[number][0];

const read = (): Choice => {
  const t = localStorage.getItem("plax-theme");
  return t === "light" || t === "dark" ? t : "system";
};
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));

function choose(t: Choice) {
  if (t === "system") {
    localStorage.removeItem("plax-theme");
    delete document.documentElement.dataset.theme;
  } else {
    localStorage.setItem("plax-theme", t);
    document.documentElement.dataset.theme = t;
  }
  listeners.forEach((fn) => fn());
}

export function Theme() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Choice);
  return (
    <fieldset>
      <legend className="sr-only">Appearance</legend>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              theme === value ? "border-ink bg-ink text-bg" : "border-line hover:border-muted"
            }`}
          >
            <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => choose(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
