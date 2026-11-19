import type { Design } from "./extract.ts";

type Layout = Design["layout"];

/** Says how an element arranges its contents, in words a designer would use. */
export function describeLayout(l: Layout): string {
  let text: string;
  if (l.display.includes("flex")) {
    const row = !l.direction.startsWith("column");
    const spread: Record<string, string> = {
      "space-between": "spread to the edges",
      "space-around": "spread out with space around each",
      "space-evenly": "spaced evenly",
      center: "centred",
      "flex-end": "pushed to the end",
      end: "pushed to the end",
    };
    const cross: Record<string, string> = {
      center: row ? "vertically centred" : "horizontally centred",
      "flex-start": row ? "lined up at the top" : "lined up on the left",
      start: row ? "lined up at the top" : "lined up on the left",
      "flex-end": row ? "lined up at the bottom" : "lined up on the right",
      end: row ? "lined up at the bottom" : "lined up on the right",
      baseline: "lined up on their text",
    };
    text = [
      row ? "Side by side" : "Stacked",
      spread[l.justify],
      cross[l.alignItems],
      l.gap > 0 && `${Math.round(l.gap)}px apart`,
      l.wrap === "wrap" && "wrapping onto new lines",
    ]
      .filter(Boolean)
      .join(", ");
  } else if (l.display.includes("grid")) {
    const cols = `${l.columns} column${l.columns === 1 ? "" : "s"}`;
    text = `Grid of ${cols}${l.rows > 1 ? ` and ${l.rows} rows` : ""}${l.gap > 0 ? `, ${Math.round(l.gap)}px apart` : ""}`;
  } else if (l.display.startsWith("inline")) {
    text = "Sits in line with the text around it";
  } else {
    text = "Stacks normally, top to bottom";
  }
  const position: Record<string, string> = {
    absolute: "Placed freely on top of the area around it",
    fixed: "Pinned to the screen while you scroll",
    sticky: "Sticks in place once you scroll to it",
  };
  return position[l.position] ? `${text}. ${position[l.position]}.` : `${text}.`;
}

const WEIGHTS: Record<string, string> = {
  "100": "Thin",
  "200": "Extra light",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "Semibold",
  "700": "Bold",
  "800": "Extra bold",
  "900": "Black",
};

export const weightName = (w: string) => (WEIGHTS[w] ? `${WEIGHTS[w]} (${w})` : w);
