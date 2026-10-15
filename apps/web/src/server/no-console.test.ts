import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

// The server writes through its logger (feature 100): JSON lines with a level, the request's ID and
// secrets redacted. A console call writes none of that, so none is left in src/server. A command's
// own output (the setup's answers) writes to process.stdout and process.stderr instead.
const server = import.meta.dirname;
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.[cm]?[jt]sx?$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name) ? [path] : [];
  });
// A real tokenizer (Babel's, as Next ships it), so strings, templates, regexes and comments are read
// as JavaScript reads them.
const { parse } = createRequire(import.meta.url)("next/dist/compiled/babel/parser") as {
  parse: (
    source: string,
    options: object,
  ) => {
    tokens: { type: { label: string }; value?: unknown; loc: { start: { line: number } } }[];
  };
};
const GLOBALS = new Set(["globalThis", "global", "window", "self"]);

/**
 * The lines where `console` is used as a value: called, indexed, destructured or passed on. Not an
 * object's key (`{ console: 1 }`) or another object's property (`x.console`), but the global's
 * (`globalThis.console`).
 */
const consoleLines = (source: string): number[] => {
  const { tokens } = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    tokens: true,
    errorRecovery: true,
  });
  return tokens.flatMap((token, i) => {
    if (token.type.label !== "name" || token.value !== "console") return [];
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    const label = (t: typeof token | undefined) => t?.type.label;
    if (label(after) === ":" && (label(before) === "{" || label(before) === ",")) return [];
    if (label(before) === "." || label(before) === "?.") {
      const owner = tokens[i - 2];
      if (!(label(owner) === "name" && GLOBALS.has(String(owner?.value)))) return [];
    }
    return [token.loc.start.line];
  });
};

it("finds the server's sources", () => {
  expect(sources(server).length).toBeGreaterThan(100);
});

it.each(sources(server).map((file) => [relative(server, file), file]))(
  "%s has no console call",
  (_name, file) => {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    const found = consoleLines(source).map((line) => `${line}: ${lines[line - 1]?.trim()}`);
    expect(found).toEqual([]);
  },
);

it("reads code as JavaScript does: strings, templates, regexes and comments", () => {
  const lines = (source: string) => consoleLines(source);
  expect(lines('send("https://hooks.example/", console);')).toEqual([1]);
  expect(lines('const b = "http://localhost:3000" + String(console.log("up"));')).toEqual([1]);
  expect(lines("const r = /[\"']/; console.log(1);")).toEqual([1]);
  expect(lines("const r = /https?:\\/\\//; console.log(1);")).toEqual([1]);
  expect(lines("const r = /`/;\nconsole.log(1);")).toEqual([2]);
  expect(lines("const r = /^\\/*/;\nconsole.log(1);")).toEqual([2]);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the tokenizer
  expect(lines("const t = `${f({ a: 1 }, console)}`;")).toEqual([1]);
  expect(lines("const { log } = console;\nconst c = console;\nglobalThis.console.log(1);")).toEqual(
    [1, 2, 3],
  );
  expect(
    lines(
      '// console.log(1)\n/* console */\nconst s = "console";\nconst o = { console: 1 };\nx.console;',
    ),
  ).toEqual([]);
});
