import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Touch rules (feature 067, from 032's "Phones and tablets"), checked over components/ and
// features/: every text field and select uses the shared classes, which make them 16px on a coarse
// pointer, so iOS Safari doesn't zoom the page when one gets focus.
const SRC = new URL("./", import.meta.url).pathname;
const ROOTS = ["components", "features"].map((d) => join(SRC, d));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });

/** Each `<input`, `<select` or `<textarea` element's opening tag, up to its own `>`. */
export const openingTags = (source: string): string[] => {
  const tags: string[] = [];
  for (const match of source.matchAll(/<(input|select|textarea)\b/g)) {
    let depth = 0;
    let end = match.index;
    for (let i = match.index; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
};

// Not typed into, so the keyboard never opens: no zoom to prevent.
const NOT_TEXT = /type=["{]?["']?(checkbox|radio|file|hidden|range|color)\b/;
const SHARED = /\b(inputClasses|selectClasses|touchFieldClasses)\b/;

/** A field that doesn't use the shared classes, and why that's fine. Keep this short. */
const EXCEPTIONS: Record<string, string> = {};

export const offenders = (file: string, source: string) =>
  openingTags(source)
    .filter((tag) => !NOT_TEXT.test(tag) && !SHARED.test(tag))
    .map((tag) => `${relative(SRC, file)}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`)
    .filter((entry) => !Object.keys(EXCEPTIONS).some((key) => entry.startsWith(key)));

describe("touch rules", () => {
  it("finds the form controls", () => {
    expect(
      ROOTS.flatMap(files).flatMap((f) => openingTags(readFileSync(f, "utf8"))).length,
    ).toBeGreaterThan(20);
  });

  it("every text field and select uses inputClasses or selectClasses (16px on touch)", () => {
    expect(ROOTS.flatMap(files).flatMap((f) => offenders(f, readFileSync(f, "utf8")))).toEqual([]);
  });

  it("catches a bare field and lets a checkbox through", () => {
    expect(offenders("x.tsx", '<input className="h-8 text-xs" name="q" />')).toHaveLength(1);
    expect(offenders("x.tsx", '<input type="checkbox" className="size-4" />')).toEqual([]);
    expect(offenders("x.tsx", '<input className={cn(inputClasses, "h-8")} />')).toEqual([]);
  });
});
