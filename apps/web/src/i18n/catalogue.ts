import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

/** A message file: nested objects ending in ICU message strings. */
export type Catalogue = { [key: string]: string | Catalogue };

/** `{ a: { b: "x" } }` → `{ "a.b": "x" }`. */
export const flatten = (catalogue: Catalogue, prefix = ""): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(catalogue)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
};

/**
 * `overlay` over `base`: every key of `base` is there, with the overlay's text where it has some.
 * This is how a language that misses a message shows English instead of a raw key.
 */
export const mergeWithFallback = (base: Catalogue, overlay: Catalogue): Catalogue => {
  const out: Catalogue = {};
  for (const [key, value] of Object.entries(base)) {
    const other = overlay[key];
    if (typeof value === "string")
      out[key] = typeof other === "string" && other !== "" ? other : value;
    else
      out[key] = mergeWithFallback(
        value,
        other !== undefined && typeof other !== "string" ? other : {},
      );
  }
  return out;
};

/** The keys `base` has and `overlay` lacks or leaves empty. */
export const missingKeys = (base: Catalogue, overlay: Catalogue): string[] => {
  const have = flatten(overlay);
  return Object.keys(flatten(base)).filter((key) => !have[key]);
};

/** The keys `overlay` has and `base` doesn't. */
export const extraKeys = (base: Catalogue, overlay: Catalogue): string[] => {
  const have = flatten(base);
  return Object.keys(flatten(overlay)).filter((key) => !(key in have));
};

type Element = ReturnType<typeof parse>[number];

const KINDS: Record<number, string> = {
  [TYPE.argument]: "value",
  [TYPE.number]: "number",
  [TYPE.date]: "date",
  [TYPE.time]: "time",
  [TYPE.select]: "select",
  [TYPE.plural]: "plural",
  [TYPE.tag]: "tag",
};

const collect = (elements: Element[], into: Set<string>) => {
  for (const element of elements) {
    // Plain text and the plural's `#` ask nothing of the caller.
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    const kind = KINDS[element.type];
    if (kind) into.add(`${element.value}:${kind}`);
    if (element.type === TYPE.select || element.type === TYPE.plural)
      for (const option of Object.values(element.options)) collect(option.value, into);
    if (element.type === TYPE.tag) collect(element.children, into);
  }
};

/**
 * What a message needs from its caller, sorted: `count:plural`, `name:value`, `b:tag`. A
 * translation must ask for the same things as the English, or the call that fills it in breaks.
 * Plural categories (`one`, `other`, `many`) differ by language and aren't compared. Throws when
 * the message isn't valid ICU, or a plural or select has no `other`.
 */
export const placeholders = (message: string): string[] => {
  const found = new Set<string>();
  collect(parse(message), found);
  return [...found].sort();
};

export type Issue = {
  kind: "missing" | "extra" | "invalid" | "placeholders";
  key: string;
  detail?: string;
};

/** Everything wrong with `other` against `base`, the English: nothing, when they agree. */
export const compareCatalogues = (base: Catalogue, other: Catalogue): Issue[] => {
  const issues: Issue[] = [];
  for (const key of missingKeys(base, other)) issues.push({ kind: "missing", key });
  for (const key of extraKeys(base, other)) issues.push({ kind: "extra", key });
  const mine = flatten(base);
  const theirs = flatten(other);
  for (const [key, message] of Object.entries(theirs)) {
    if (!message) continue;
    try {
      const wanted = key in mine ? placeholders(mine[key] as string) : null;
      const got = placeholders(message);
      if (wanted && wanted.join() !== got.join())
        issues.push({
          kind: "placeholders",
          key,
          detail: `${wanted.join(", ")} ≠ ${got.join(", ")}`,
        });
    } catch (error) {
      issues.push({ kind: "invalid", key, detail: error instanceof Error ? error.message : "" });
    }
  }
  return issues;
};
