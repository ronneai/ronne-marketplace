import { readFileSync } from "node:fs";
import { ITEM_TYPES } from "@ronneai/core";
import { describe, expect, it } from "vitest";

// Checks WCAG 2.2 AA contrast for every documented text/background pair, reading the real values
// from tokens.css, so the check can't drift from the CSS.
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

const block = (selector: string): Record<string, string> => {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

// [foreground, background, minimum]: 4.5 for text, 3 for non-text UI (focus rings).
const PAIRS: [string, string, number][] = [
  ["fg", "canvas", 4.5],
  ["fg", "surface", 4.5],
  ["muted", "canvas", 4.5],
  ["muted", "surface", 4.5],
  // White labels on Deep teal: primary buttons and accent badges (owner decision, 2026-09-28).
  ["on-accent", "accent-strong", 4.5],
  ["link", "canvas", 4.5],
  ["link", "surface", 4.5],
  // The header's current item: link-coloured text on the tint (feature 009's navigation fix).
  ["link", "tint", 4.5],
  ["focus", "canvas", 3],
  ["focus", "surface", 3],
  // Code previews (the New item page's starter files).
  ["code-fg", "code-bg", 4.5],
  ["code-muted", "code-bg", 4.5],
  // Syntax colours in the code viewer and editor (044): on the surface, and on the tint of the
  // line the cursor is on.
  ...["comment", "key", "string", "constant", "keyword"].flatMap(
    (kind): [string, string, number][] => [
      [`syntax-${kind}`, "surface", 4.5],
      [`syntax-${kind}`, "tint", 4.5],
    ],
  ),
  // Errors and warnings (owner's style-guide mock, 2026-09-28): text on every background it
  // appears on, labels on a red fill, and fills and borders at 3:1 for non-text.
  ["error-text", "canvas", 4.5],
  ["error-text", "surface", 4.5],
  ["error-text", "error-subtle", 4.5],
  ["on-error", "error", 4.5],
  ["error", "canvas", 3],
  ["error", "surface", 3],
  ["warning-text", "canvas", 4.5],
  ["warning-text", "surface", 4.5],
  ["warning-text", "warning-subtle", 4.5],
  ["warning", "canvas", 3],
  ["warning", "surface", 3],
  // Item type badges (054): the label on its fill.
  ...ITEM_TYPES.map((type): [string, string, number] => [
    `type-${type}`,
    `type-${type}-subtle`,
    4.5,
  ]),
];

describe.each([
  ["light", ':root,\n[data-theme="light"]'],
  ["dark", '[data-theme="dark"]'],
])("%s theme", (_name, selector) => {
  const tokens = block(selector);

  it.each(PAIRS)("%s on %s meets %s:1", (fg, bg, minimum) => {
    const [a, b] = [tokens[fg], tokens[bg]];
    expect(a, `--${fg}`).toBeDefined();
    expect(b, `--${bg}`).toBeDefined();
    expect(contrast(a as string, b as string)).toBeGreaterThanOrEqual(minimum);
  });
});

it("has only the light and dark themes: no OS-following block", () => {
  expect(css).not.toContain('[data-theme="system"]');
  expect(css).not.toContain("prefers-color-scheme");
});
