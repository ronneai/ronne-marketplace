import type { Layout, Position } from "./types";

/** The draft file that holds the canvas's node positions. The packer leaves `.ronne/` out (011). */
export const LAYOUT_PATH = ".ronne/layout.json";

const LAYOUT_VERSION = 1;

/** The ring's smallest radius, and the room each node gets on it. */
const RING_MIN = 300;
const NODE_GAP = 300;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The stored position, if any: a name typed in the YAML can be anything, `constructor` included. */
const stored = (layout: Layout, name: string): Position | undefined =>
  Object.hasOwn(layout, name) ? layout[name] : undefined;

const isPosition = (value: unknown): value is Position =>
  value !== null &&
  typeof value === "object" &&
  Number.isFinite((value as Position).x) &&
  Number.isFinite((value as Position).y);

/**
 * The positions in `.ronne/layout.json`. A file that is missing, doesn't parse or is another
 * version gives none, and an entry that isn't a position is dropped: the canvas then places those
 * nodes itself, and the next move rewrites the file.
 */
export const readLayout = (text: string | undefined): Layout => {
  if (!text) return {};
  try {
    const file = JSON.parse(text) as { version?: unknown; nodes?: unknown };
    if (file?.version !== LAYOUT_VERSION || !file.nodes || typeof file.nodes !== "object")
      return {};
    return Object.fromEntries(
      Object.entries(file.nodes)
        .filter((entry): entry is [string, Position] => isPosition(entry[1]))
        .map(([name, { x, y }]) => [name, { x, y }]),
    );
  } catch {
    return {};
  }
};

/** `.ronne/layout.json` for these positions: names in order, so the same layout is the same file. */
export const writeLayout = (layout: Layout): string =>
  `${JSON.stringify(
    {
      version: LAYOUT_VERSION,
      nodes: Object.fromEntries(
        Object.keys(layout)
          .sort(byName)
          .map((name) => [name, layout[name]]),
      ),
    },
    null,
    2,
  )}\n`;

/**
 * The layout after the author moved nodes: whole pixels, and only for the dependencies still
 * there, so entries for removed ones go with the first move after.
 */
export const moveNodes = (
  layout: Layout,
  dependencies: readonly string[],
  moved: Readonly<Record<string, Position>>,
): Layout =>
  Object.fromEntries(
    dependencies
      .map((name) => [name, stored(moved, name) ?? stored(layout, name)] as const)
      .filter((entry): entry is readonly [string, Position] => entry[1] !== undefined)
      .map(([name, { x, y }]) => [name, { x: Math.round(x), y: Math.round(y) }]),
  );

/**
 * Where each dependency's node goes: where the author put it, or else on a ring around the draft's
 * node, which sits at the origin. The ring has a place for every dependency, in name order from
 * the top, and grows with their number, so nodes placed automatically never overlap each other.
 */
export const placeNodes = (
  dependencies: readonly string[],
  layout: Layout,
): Record<string, Position> => {
  const names = [...dependencies].sort(byName);
  const radius =
    names.length < 2
      ? RING_MIN
      : Math.max(RING_MIN, Math.round(NODE_GAP / (2 * Math.sin(Math.PI / names.length))));
  return Object.fromEntries(
    names.map((name, i) => {
      const angle = (2 * Math.PI * i) / names.length - Math.PI / 2;
      return [
        name,
        stored(layout, name) ?? {
          x: Math.round(radius * Math.cos(angle)),
          y: Math.round(radius * Math.sin(angle)),
        },
      ];
    }),
  );
};
