import { readdirSync, readFileSync, statSync } from "node:fs";
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
/** `console` as a value: called, indexed, destructured or passed on. */
const CONSOLE = /(?:(?:^|[^\w$.])|(?:globalThis|global|window|self)\s*\.\s*)console\b(?!\s*:)/;

/**
 * The source with its comments and the text of its strings blanked (newlines kept, so line numbers
 * hold), and a template's `${…}` kept as code: a `//` inside a string isn't a comment, and a
 * `console` inside a string isn't a call.
 */
const codeOnly = (source: string): string => {
  let out = "";
  // Each open template expression's brace depth: back to its template at its closing `}`.
  const templates: number[] = [];
  const keepNewlines = (text: string) => text.replaceAll(/[^\n]/g, " ");
  let at = 0;
  const inTemplate = () => {
    // From just after a backtick or a `}` that closes `${`: the text, to a backtick or `${`.
    let end = at;
    while (end < source.length && source[end] !== "`" && !source.startsWith("${", end))
      end += source[end] === "\\" ? 2 : 1;
    out += keepNewlines(source.slice(at, end));
    if (source.startsWith("${", end)) {
      templates.push(0);
      out += "${";
      at = end + 2;
    } else {
      out += "`";
      at = end + 1;
    }
  };
  while (at < source.length) {
    const char = source[at];
    if (source.startsWith("//", at)) {
      const end = source.indexOf("\n", at);
      const stop = end === -1 ? source.length : end;
      out += keepNewlines(source.slice(at, stop));
      at = stop;
    } else if (source.startsWith("/*", at)) {
      const end = source.indexOf("*/", at + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += keepNewlines(source.slice(at, stop));
      at = stop;
    } else if (char === '"' || char === "'") {
      let end = at + 1;
      while (end < source.length && source[end] !== char && source[end] !== "\n")
        end += source[end] === "\\" ? 2 : 1;
      out += `${char}${keepNewlines(source.slice(at + 1, end))}${char}`;
      at = end + 1;
    } else if (char === "`") {
      out += "`";
      at += 1;
      inTemplate();
    } else if (templates.length && char === "{") {
      templates[templates.length - 1] = (templates.at(-1) ?? 0) + 1;
      out += char;
      at += 1;
    } else if (templates.length && char === "}") {
      if (templates.at(-1) === 0) {
        templates.pop();
        out += "}";
        at += 1;
        inTemplate();
      } else {
        templates[templates.length - 1] = (templates.at(-1) ?? 1) - 1;
        out += char;
        at += 1;
      }
    } else {
      out += char;
      at += 1;
    }
  }
  return out;
};

it("finds the server's sources", () => {
  expect(sources(server).length).toBeGreaterThan(100);
});

it.each(sources(server).map((file) => [relative(server, file), file]))(
  "%s has no console call",
  (_name, file) => {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    const found = codeOnly(source)
      .split("\n")
      .flatMap((line, i) => (CONSOLE.test(line) ? [`${i + 1}: ${lines[i]?.trim()}`] : []));
    expect(found).toEqual([]);
  },
);

it("reads code, not comments or strings: a `//` in a string doesn't hide what follows", () => {
  const found = (source: string) => CONSOLE.test(codeOnly(source));
  expect(found('send("https://hooks.example/", console);')).toBe(true);
  expect(found('const banner = "http://localhost:3000" + String(console.log("up"));')).toBe(true);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner
  expect(found("const t = `a ${console.log(1)} b`;")).toBe(true);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner
  expect(found("const t = `a ${ { x: 1 }.x } ${console}`;")).toBe(true);
  expect(found("// console.log(1)")).toBe(false);
  expect(found("/* console.log(1) */ const x = 1;")).toBe(false);
  expect(found('const s = "console.log(1)";')).toBe(false);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner
  expect(found("const t = `console ${1}`;")).toBe(false);
  // Line numbers hold across blanked multi-line comments and templates.
  expect(codeOnly("/*\n\n*/\n`\n`\nx").split("\n")).toHaveLength(6);
});
