import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The raw-text guard (feature 129): five Biome plugins that fail lint on text written into a
 * screen instead of coming from the message files. They run only on the folders biome.json lists.
 * These tests run Biome on fixtures, in a folder of their own, with just those plugins.
 */
const repo = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/raw-text/${name}`, import.meta.url));
const PLUGINS = [
  "i18n-raw-jsx-text",
  "i18n-raw-jsx-string",
  "i18n-raw-jsx-template",
  "i18n-raw-jsx-attribute",
  "i18n-raw-jsx-attribute-expression",
].map((name) => repo(`packages/config/biome-plugins/${name}.grit`));

const dir = mkdtempSync(join(tmpdir(), "raw-text-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(
  join(dir, "biome.json"),
  JSON.stringify({
    root: true,
    linter: { enabled: true, rules: { recommended: false } },
    plugins: PLUGINS,
  }),
);

/** The `line:column` of every diagnostic Biome gives a fixture, in order. */
const lintFixture = (name: string): string[] => {
  const file = `${name}.tsx`;
  copyFileSync(fixture(`${name}.tsx.txt`), join(dir, file));
  let output = "";
  try {
    output = execFileSync(repo("node_modules/.bin/biome"), ["lint", "--colors=off", file], {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
  }
  return [...output.matchAll(new RegExp(`^${file}:(\\d+:\\d+) plugin`, "gm"))].map(
    (m) => m[1] as string,
  );
};

describe("the raw-text plugins (129)", () => {
  it("fail on text written into a screen", () => {
    expect(lintFixture("bad")).toEqual([
      "3:8", // title="Hello there"
      "3:28", // Hello
      "3:37", // world
      "4:12", // placeholder="Type here"
      "4:36", // aria-label="Name"
      "5:14", // {n > 1 ? "Many" : "One"}
      "5:23",
      "6:15", // {n > 1 && "Shown"}
      "7:6", // {"Literal"}
      "8:6", // {`Count ${n} items`}
      "9:17", // label={"Braced"}
      "9:38", // title={n ? "Yes" : t("fine")}
    ]);
  });

  it("pass on text from the messages, markup, numbers and commands", () => {
    expect(lintFixture("clean")).toEqual([]);
  });

  it("accept a biome-ignore with a reason, and only where it is written", () => {
    expect(lintFixture("ignore")).toEqual(["3:8", "9:7"]);
  });
});

describe("biome.json (129)", () => {
  const config = JSON.parse(readFileSync(repo("biome.json"), "utf8")) as {
    overrides: { includes: string[]; plugins?: string[] }[];
  };
  const override = config.overrides.find((o) =>
    o.plugins?.some((p) => p.endsWith("i18n-raw-jsx-text.grit")),
  );

  it("loads all five plugins on the folders it lists", () => {
    expect(override?.plugins?.map((p) => p.split("/").pop()).sort()).toEqual(
      PLUGINS.map((p) => p.split("/").pop()).sort(),
    );
  });

  it("lists only folders that exist", () => {
    for (const pattern of override?.includes ?? []) {
      const folder = pattern.replace(/\/\*\*.*$/, "");
      expect(() => readFileSync(repo(`${folder}/`)), folder).toThrowError(/EISDIR/);
    }
  });
});
