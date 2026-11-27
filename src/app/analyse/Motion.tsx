"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Interaction, Motion } from "@/lib/inspector/session";
import type { Anim, Declared, Keyframe } from "@/lib/inspector/motion";
import {
  PROP_NAMES,
  bezierOf,
  describeMovement,
  duration,
  easingName,
  movementBetween,
  type Change,
} from "@/lib/inspector/describe";

// Only these are replayed on the preview; anything else from the website is ignored.
const PLAYABLE = new Set(["transform", "translate", "scale", "rotate", "opacity", "filter"]);
const COLOUR_PROPS = new Set(["color", "background-color", "border-color", "outline-color"]);
const camel = (p: string) => p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** `untested`: captured with the extension, which can't hover, focus or scroll the element. */
export function MotionPanel({ motion, image, untested }: { motion: Motion; image?: string; untested?: boolean }) {
  const nothing =
    !motion.running.length &&
    !motion.scriptedIdle &&
    !motion.hover?.changes.length &&
    !motion.hover?.animations.length &&
    !motion.focus?.changes.length &&
    !motion.scroll?.changes.length &&
    !motion.scroll?.animations.length &&
    !motion.scroll?.scripted &&
    !motion.scrollTimelines.length;

  return (
    <div className="space-y-10">
      <p className="inline-block rounded-lg bg-accent-soft px-3 py-1 text-xs font-medium">Observed on the page, not guessed</p>

      {untested && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn-ink">
          Captured with the browser extension, so hover, focus and scroll-in weren&rsquo;t tested (extensions can&rsquo;t move your mouse). To test them, open
          the page in Analyse Website.
        </p>
      )}

      {nothing && (
        <p className="text-muted">
          {untested ? "Nothing moves on its own." : `No movement found. It doesn’t animate on its own, on hover${motion.focus ? ", on focus" : ""}${motion.scroll ? " or when scrolled into view" : ""}.`}
          {motion.transitions.length > 0 && " It is set up to change smoothly, though, so something else on the page may trigger it."}
        </p>
      )}

      {(motion.running.length > 0 || motion.scriptedIdle) && (
        <Moment title="Moving on its own">
          {motion.running.map((a, n) => (
            <AnimCard key={`${a.key}-${n}`} a={a} image={image} />
          ))}
          {motion.scriptedIdle && <Scripted />}
        </Moment>
      )}

      <InteractionBlock title="When you hover" i={motion.hover} transitions={motion.transitions} image={image} />
      <InteractionBlock title="When it’s focused (keyboard)" i={motion.focus} transitions={motion.transitions} image={image} />
      {motion.scroll && (
        <InteractionBlock title="When it scrolls into view" i={motion.scroll} transitions={motion.transitions} image={image}>
          {motion.scroll.scripted && <Scripted />}
        </InteractionBlock>
      )}
      {motion.scrollTimelines.length > 0 && (
        <Moment title="Linked to scrolling">
          <p className="text-sm">It moves along with the scroll position: {motion.scrollTimelines.join("; ")}.</p>
        </Moment>
      )}

      {motion.transitions.length > 0 && (
        <Moment title="Set up to change smoothly">
          <ul className="space-y-1 text-sm">
            {motion.transitions.map((t, i) => (
              <li key={i}>
                <span className="text-muted">{t.part}:</span> {PROP_NAMES[t.prop] ?? t.prop} over {duration(t.duration)}
                {t.delay > 0 && ` after ${duration(t.delay)}`}, {easingName(t.easing).toLowerCase()}
              </li>
            ))}
          </ul>
        </Moment>
      )}

      {!untested && <p className="text-xs text-muted">Clicks aren’t tested, so the website never navigates away while you explore.</p>}
    </div>
  );
}

function Moment({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-3 font-medium">{title}</h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Scripted() {
  return (
    <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">
      Something here moves through the website’s own code, so its exact timing can’t be read. Watch it on the website.
    </p>
  );
}

/** The transition the website declared for this change, if any (falls back to "all"). */
function timingFor(prop: string, part: string, transitions: Declared[]) {
  return (
    transitions.find((t) => t.part === part && t.prop === prop) ??
    transitions.find((t) => t.part === part && t.prop === "all") ?? { duration: 0, delay: 0, easing: "linear" }
  );
}

function InteractionBlock({
  title,
  i,
  transitions,
  image,
  children,
}: {
  title: string;
  i: Interaction | null;
  transitions: Declared[];
  image?: string;
  children?: ReactNode;
}) {
  if (!i || (!i.changes.length && !i.animations.length && !children)) return null;
  const whole = i.changes.filter((c) => c.part === "Whole element" && PLAYABLE.has(c.prop));
  const timing = whole[0] ? timingFor(whole[0].prop, "Whole element", transitions) : undefined;
  return (
    <Moment title={title}>
      {whole.length > 0 && timing && (
        <Player
          image={image}
          keyframes={[
            Object.fromEntries(whole.map((c) => [camel(c.prop), c.from])),
            Object.fromEntries(whole.map((c) => [camel(c.prop), c.to])),
          ]}
          duration={timing.duration || 300}
          easing={timing.easing}
          loop
          note={timing.duration ? undefined : "It changes instantly; the preview slows it down so you can see it."}
        />
      )}
      <ChangeList changes={i.changes} transitions={transitions} />
      {i.animations.map((a, n) => (
        <AnimCard key={`${a.key}-${n}`} a={a} image={image} />
      ))}
      {children}
    </Moment>
  );
}

function ChangeList({ changes, transitions }: { changes: Change[]; transitions: Declared[] }) {
  // Movement and fading read better as one sentence per part.
  const parts = [...new Set(changes.map((c) => c.part))];
  return (
    <ul className="space-y-2 text-sm">
      {parts.map((part) => {
        const mine = changes.filter((c) => c.part === part);
        const t = mine.find((c) => c.prop === "transform");
        const o = mine.find((c) => c.prop === "opacity");
        const motionText = describeMovement(movementBetween(t?.from, t?.to), o ? [parseFloat(o.from), parseFloat(o.to)] : undefined);
        const rest = mine.filter((c) => c.prop !== "transform" && c.prop !== "opacity");
        const timing = mine[0] && timingFor(mine[0].prop, part, transitions);
        return (
          <li key={part} className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted">
              {part}
              {timing && timing.duration > 0 && ` · ${duration(timing.duration)}, ${easingName(timing.easing).toLowerCase()}`}
            </div>
            {motionText && <div className="mt-1">{motionText}</div>}
            {rest.map((c) => (
              <div key={c.prop} className="mt-1 flex flex-wrap items-center gap-2">
                <span>{PROP_NAMES[c.prop] ?? c.prop}</span>
                {COLOUR_PROPS.has(c.prop) ? (
                  <>
                    <Chip value={c.from} /> → <Chip value={c.to} />
                  </>
                ) : (
                  <code className="font-mono text-xs text-muted">
                    {c.from} → {c.to}
                  </code>
                )}
              </div>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className="size-4 rounded border border-line" style={{ background: value }} />
      {value}
    </span>
  );
}

function AnimCard({ a, image }: { a: Anim; image?: string }) {
  const first = a.keyframes[0];
  const last = a.keyframes.at(-1);
  const summary = describeMovement(
    movementBetween(first?.transform as string | undefined, last?.transform as string | undefined),
    first?.opacity !== undefined && last?.opacity !== undefined ? [Number(first.opacity), Number(last.opacity)] : undefined,
  );
  const kind = { "css-animation": "CSS animation", "css-transition": "Transition", script: "Scripted animation" }[a.kind];
  const repeats = a.iterations === "infinite" ? "repeats forever" : a.iterations === 1 ? "plays once" : `plays ${a.iterations} times`;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">{a.name}</div>
        <div className="text-xs text-muted">
          {kind} · {a.part}
        </div>
      </div>
      {summary && <p className="mt-1">{summary}</p>}
      <p className="mt-1 text-sm text-muted">
        {duration(a.duration)}, {repeats}
        {a.delay > 0 && `, starts after ${duration(a.delay)}`}
        {a.direction !== "normal" && `, ${a.direction}`}
      </p>
      {a.keyframes.some((k) => Object.keys(k).some((p) => PLAYABLE.has(p))) && (
        <div className="mt-3">
          <Player
            image={image}
            keyframes={a.keyframes}
            duration={a.duration}
            easing={a.easing}
            iterations={a.iterations}
            direction={a.direction}
          />
        </div>
      )}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted">Keyframes</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-bg p-3 font-mono">{JSON.stringify(a.keyframes, null, 2)}</pre>
      </details>
    </div>
  );
}

/** Replays observed movement on the screenshot, with play, pause, replay and speed. */
function Player({
  image,
  keyframes,
  duration: ms,
  easing,
  iterations = 1,
  direction = "normal",
  loop = false,
  note,
}: {
  image?: string;
  keyframes: Keyframe[];
  duration: number;
  easing: string;
  iterations?: number | "infinite";
  direction?: string;
  loop?: boolean;
  note?: string;
}) {
  const target = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const frames = keyframes.map((k) =>
    Object.fromEntries(Object.entries(k).filter(([p]) => PLAYABLE.has(p) || p === "offset" || p === "easing")),
  );
  const key = JSON.stringify([frames, ms, easing, iterations, direction, loop]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const timing: KeyframeAnimationOptions = {
      duration: Math.max(ms, 1),
      iterations: loop || iterations === "infinite" ? Infinity : iterations,
      direction: (loop ? "alternate" : direction) as PlaybackDirection,
      endDelay: loop ? 600 : 0,
      fill: "both",
    };
    let a: Animation;
    try {
      a = el.animate(JSON.parse(key)[0], { ...timing, easing });
    } catch {
      a = el.animate(JSON.parse(key)[0], timing); // unusual easing the browser can't replay: use a steady speed
    }
    anim.current = a;
    setPlaying(true);
    return () => a.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every input
  }, [key]);

  const toggle = () => {
    const a = anim.current;
    if (!a) return;
    if (a.playState === "running") a.pause();
    else a.play();
    setPlaying(a.playState === "running");
  };
  const replay = () => {
    const a = anim.current;
    if (!a) return;
    a.currentTime = 0;
    a.play();
    setPlaying(true);
  };
  const changeSpeed = (v: number) => {
    setSpeed(v);
    anim.current?.updatePlaybackRate(v);
  };

  return (
    <div className="rounded-xl border border-line">
      <div className="flex h-40 items-center justify-center overflow-hidden bg-bg p-6">
        <div ref={target} className="flex max-h-full max-w-full items-center justify-center">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="max-h-28 max-w-full object-contain" />
          ) : (
            <div className="size-16 rounded-lg bg-accent" />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-sm">
        <button type="button" onClick={toggle} className="rounded-lg border border-line px-3 py-1 hover:border-muted">
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={replay} className="rounded-lg border border-line px-3 py-1 hover:border-muted">
          Replay
        </button>
        <div role="group" aria-label="Speed" className="flex rounded-lg border border-line p-0.5">
          {[0.25, 0.5, 1, 2].map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={speed === v}
              onClick={() => changeSpeed(v)}
              className={`rounded-lg px-2.5 py-0.5 text-xs ${speed === v ? "bg-ink text-bg" : "text-muted"}`}
            >
              {v}×
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <Curve easing={easing} />
          {duration(ms)} · {easingName(easing)}
        </span>
      </div>
      {note && <p className="border-t border-line px-3 py-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

/** The easing as a small curve: time goes right, progress goes up. */
function Curve({ easing }: { easing: string }) {
  const b = bezierOf(easing);
  if (!b) return null;
  const [x1, y1, x2, y2] = b;
  const p = (x: number, y: number) => `${2 + x * 20} ${22 - y * 20}`;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="overflow-visible">
      <rect x="2" y="2" width="20" height="20" fill="none" stroke="var(--line)" />
      <path d={`M${p(0, 0)} C${p(x1, y1)} ${p(x2, y2)} ${p(1, 1)}`} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}
