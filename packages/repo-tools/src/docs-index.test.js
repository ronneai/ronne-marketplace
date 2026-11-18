import { describe, expect, it } from "vitest";
import { checkAll, checkContributing, checkKnowledgeIndex, listedNotes } from "./docs-index.js";

const root = new URL("../../../", import.meta.url).pathname;

describe("listedNotes", () => {
  it("reads links to notes in the same folder, and nothing else", () => {
    const index = [
      "- [toasts.md](toasts.md): when to use a toast.",
      "- [i18n](i18n.md) and [the policy](../policies/dependencies.md)",
      "- [a site](https://example.com/page.md)",
    ].join("\n");
    expect([...listedNotes(index)]).toEqual(["toasts.md", "i18n.md"]);
  });

  it("reads `./a.md` and `a.md#section` as a.md", () => {
    expect([...listedNotes("[a](./a.md) and [b](b.md#rules) and [c](./c.md#x)")]).toEqual([
      "a.md",
      "b.md",
      "c.md",
    ]);
  });

  it("stays fast on a long run of unclosed links", () => {
    const started = performance.now();
    listedNotes("](a.md".repeat(100_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("checkKnowledgeIndex", () => {
  const index = "- [a.md](a.md): one.\n- [b.md](b.md): two.\n";

  it("passes when every note is listed and every listed file is a note", () => {
    expect(checkKnowledgeIndex(["a.md", "b.md"], index)).toEqual([]);
  });

  it("fails on a note that isn't listed", () => {
    expect(checkKnowledgeIndex(["a.md", "b.md", "c.md"], index)).toEqual([
      "docs/knowledge/c.md isn't listed in docs/knowledge/README.md",
    ]);
  });

  it("fails on a listed file that isn't a note", () => {
    expect(checkKnowledgeIndex(["a.md"], index)).toEqual([
      "docs/knowledge/README.md lists b.md, which isn't a note there",
    ]);
  });
});

describe("checkContributing", () => {
  const page = [
    "Run `pnpm lint` before you commit.",
    "",
    "## Commands",
    "",
    "| Command | What it does |",
    "|---|---|",
    "| `pnpm test` | … |",
    "| `pnpm run setup` | … |",
    "| `pnpm bundle <tarball>` | … |",
    "| `pnpm release:smoke` | After `pnpm build`: … |",
    "",
    "## License",
    "",
    "| `pnpm format` | a row in another section |",
  ].join("\n");
  const missing = (name) => `CONTRIBUTING.md's Commands has no row for the root script "${name}"`;

  it("passes when every script has a row, as `pnpm x` or `pnpm run x`", () => {
    expect(checkContributing(["test", "setup", "bundle", "release:smoke"], page)).toEqual([]);
  });

  it("fails on a script with no row", () => {
    expect(checkContributing(["test", "docs:check"], page)).toEqual([missing("docs:check")]);
  });

  it("doesn't count the prose, another row's description or another section", () => {
    expect(checkContributing(["lint", "build", "format"], page)).toEqual([
      missing("lint"),
      missing("build"),
      missing("format"),
    ]);
  });

  it("doesn't count a longer script's name", () => {
    const rows = "## Commands\n\n| `pnpm test:db` | … |\n| `pnpm test:e2e` | … |\n";
    expect(checkContributing(["test"], rows)).toEqual([missing("test")]);
  });
});

describe("the repository", () => {
  it("has complete lists", () => {
    expect(checkAll(root)).toEqual([]);
  });
});
