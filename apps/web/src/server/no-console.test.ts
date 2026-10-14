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
/** `console` as a value: called, indexed, destructured or passed on. Comments are left out first. */
const CONSOLE = /(?:(?:^|[^\w$.])|(?:globalThis|global|window|self)\s*\.\s*)console\b(?!\s*:)/;
const code = (line: string) => {
  const comment = line.indexOf("//");
  const text = comment === -1 ? line : line.slice(0, comment);
  return text.trimStart().startsWith("*") ? "" : text;
};

it("finds the server's sources", () => {
  expect(sources(server).length).toBeGreaterThan(100);
});

it.each(sources(server).map((file) => [relative(server, file), file]))(
  "%s has no console call",
  (_name, file) => {
    const lines = readFileSync(file, "utf8").split("\n");
    const found = lines.flatMap((line, i) =>
      CONSOLE.test(code(line)) ? [`${i + 1}: ${line.trim()}`] : [],
    );
    expect(found).toEqual([]);
  },
);
