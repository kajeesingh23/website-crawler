import type { Design } from "../../src/lib/inspector/extract";
import type { Motion } from "../../src/lib/inspector/session";

/** One thing selected on a page, with everything measured about it. Kept in chrome.storage.local. */
export type Capture = {
  id: string;
  name: string;
  url: string;
  pageTitle: string;
  label: string; // plain-language kind, e.g. "Card", "Button"
  tag: string;
  text: string;
  crumbs: string[]; // ancestors in plain language
  path: string; // CSS address on the page
  width: number;
  height: number;
  note?: string;
  design: Design | null;
  motion: Motion; // from the extension: what runs on its own and declared transitions (hover isn't tested)
  html: string; // exact copy, as a standalone page
  truncated: boolean;
  screenshot?: string; // PNG data URL, cropped to the element
  partial?: boolean; // taller or wider than the screen, so only the visible part is pictured
  createdAt: string;
  saved?: { id: string; at: string };
};

export type Rect = { x: number; y: number; width: number; height: number };

/** Page → panel. */
export type FromContent =
  | { type: "plax:mode"; on: boolean }
  | { type: "plax:found"; capture: Capture; rect: Rect; viewport: { width: number; height: number }; replace: boolean };

/** Panel → page. */
export type ToContent =
  | { type: "plax:ping" }
  | { type: "plax:mode"; on: boolean }
  | { type: "plax:marks"; ids: string[] }
  | { type: "plax:step"; step: "parent" | "child" | "next" | "prev" };
