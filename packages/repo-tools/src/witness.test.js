import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkAll,
  checkFeature,
  headingTasks,
  isChecked,
  parsePlan,
  parseWitness,
  splitRow,
} from "./witness.js";

const HEADER = `| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|`;

const pass = ({
  kind = "",
  rows = ["| 1 | It works | yes | confirmed | `pnpm test` → 12 passed |"],
  overall = "met.",
} = {}) =>
  `Witnessed: 2026-10-07 10:00 EDT, by a fresh agent${kind}. Commit: abc1234. Machine: macOS.

${HEADER}
${rows.join("\n")}

**Overall:** ${overall}
`;

const witness = (...sections) => `# 098 — Witness\n\n${sections.join("\n")}`;

const plan = (...tasks) => `# 098 — Plan\n\n## Tasks\n\n${tasks.join("\n\n")}\n`;

const feature = (planText, witnessText) =>
  checkFeature({ id: 98, dir: "docs/features/098-x", plan: planText, witness: witnessText });

describe("isChecked", () => {
  it.each([
    [86, false],
    [87, true],
    [88, false],
    [89, false],
    [90, true],
    [96, false],
    [97, false],
    [98, true],
  ])("%i → %s", (id, expected) => {
    expect(isChecked(id)).toBe(expected);
  });
});

describe("splitRow", () => {
  it("keeps pipes inside code spans and escaped pipes", () => {
    expect(splitRow("| 1 | a `x | y` b | yes | c \\| d |")).toEqual([
      "1",
      "a `x | y` b",
      "yes",
      "c | d",
    ]);
  });
});

describe("parsePlan", () => {
  it("reads ticked and risky tasks", () => {
    const tasks = parsePlan(plan("- [x] **1. One.** Text.", "- [ ] **2. Two.** [risky] Text."));
    expect(tasks.map(({ n, ticked, risky }) => ({ n, ticked, risky }))).toEqual([
      { n: 1, ticked: true, risky: false },
      { n: 2, ticked: false, risky: true },
    ]);
  });
});

describe("headingTasks", () => {
  it.each([
    ["## Task 2 — The check", [2]],
    ["## Tasks 3 and 4 — final witness", [3, 4]],
    ["## Tasks 3, 4 and 5: CI", [3, 4, 5]],
    ["## Follow-up: messages", []],
  ])("%s", (heading, expected) => {
    expect(headingTasks(heading)).toEqual(expected);
  });
});

describe("parseWitness", () => {
  it("accepts a record in the format", () => {
    expect(parseWitness(witness(`## Task 1 — One\n\n${pass()}`)).errors).toEqual([]);
  });

  it("needs the commit", () => {
    const text = witness(`## Task 1 — One\n\n${pass().replace(" Commit: abc1234.", "")}`);
    expect(parseWitness(text).errors.join()).toMatch(/Commit: <sha>/);
  });

  it("refuses an unknown verdict, an empty evidence cell and a bad In the notes?", () => {
    const rows = [
      "| 1 | A | yes | confirmed, with a note | x |",
      "| 2 | B | yes | confirmed |  |",
      "| 3 | C | maybe | partly | x |",
    ];
    const { errors } = parseWitness(witness(`## Task 1 — One\n\n${pass({ rows })}`));
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/WITNESS\.md:\d+: the verdict must be one of/);
    expect(errors[1]).toMatch(/the evidence is empty/);
    expect(errors[2]).toMatch(/In the notes\?/);
  });

  it("refuses the old three-column table", () => {
    const old = pass().replace(HEADER, "| # | Claim | Verdict | Evidence |\n|---|---|---|---|");
    expect(parseWitness(witness(`## Task 1 — One\n\n${old}`)).errors.join()).toMatch(
      /columns must be/,
    );
  });

  it("needs an Overall line", () => {
    const text = witness(`## Task 1 — One\n\n${pass().replace("**Overall:** met.", "")}`);
    expect(parseWitness(text).errors.join()).toMatch(/Overall/);
  });
});

describe("checkFeature", () => {
  it("passes with nothing ticked and no WITNESS.md", () => {
    expect(feature(plan("- [ ] **1. One.**"), null)).toEqual([]);
  });

  it("fails a ticked task with no WITNESS.md", () => {
    expect(feature(plan("- [x] **1. One.**"), null)).toEqual([
      "docs/features/098-x/PLAN.md:5: task 1 is ticked but there's no WITNESS.md",
    ]);
  });

  it("fails a ticked task with no pass", () => {
    expect(
      feature(
        plan("- [x] **1. One.**", "- [x] **2. Two.**"),
        witness(`## Task 1 — One\n\n${pass()}`),
      ),
    ).toEqual([
      "docs/features/098-x/PLAN.md:7: task 2 is ticked but WITNESS.md has no pass for it",
    ]);
  });

  it("goes by the latest pass: a fixed claim passes, a new failure fails", () => {
    const failed = pass({ rows: ["| 1 | A | yes | partly | bug |"], overall: "not met." });
    const fixed = witness(`## Task 1 — One\n\n${failed}\n### Re-check\n\n${pass()}`);
    expect(feature(plan("- [x] **1. One.**"), fixed)).toEqual([]);
    const broken = witness(`## Task 1 — One\n\n${pass()}\n${failed}`);
    expect(feature(plan("- [x] **1. One.**"), broken).join()).toMatch(/latest pass isn't met/);
  });

  it("fails a pass marked met that has a claim it couldn't check", () => {
    const text = witness(
      `## Task 1 — One\n\n${pass({ rows: ["| 1 | On Windows | no | can't check here | macOS only |"] })}`,
    );
    expect(feature(plan("- [x] **1. One.**"), text).join()).toMatch(/every claim confirmed/);
  });

  it("covers several tasks from one heading", () => {
    expect(
      feature(
        plan("- [x] **3. A.**", "- [x] **4. B.**"),
        witness(`## Tasks 3 and 4 — Both\n\n${pass()}`),
      ),
    ).toEqual([]);
  });

  it("needs an adversarial pass for a risky task", () => {
    const blindOnly = witness(`## Task 1 — One\n\n${pass()}`);
    expect(feature(plan("- [x] **1. One.** [risky]"), blindOnly).join()).toMatch(
      /no adversarial pass/,
    );
    const both = witness(`## Task 1 — One\n\n${pass()}\n${pass({ kind: " (adversarial)" })}`);
    expect(feature(plan("- [x] **1. One.** [risky]"), both)).toEqual([]);
  });
});

describe("checkAll", () => {
  it("checks features in scope and skips the legacy ones", () => {
    const root = mkdtempSync(join(tmpdir(), "witness-"));
    for (const name of ["097-old", "098-new"]) {
      mkdirSync(join(root, "docs", "features", name), { recursive: true });
      writeFileSync(join(root, "docs", "features", name, "PLAN.md"), plan("- [x] **1. One.**"));
    }
    expect(checkAll(root)).toEqual([
      "docs/features/098-new/PLAN.md:5: task 1 is ticked but there's no WITNESS.md",
    ]);
  });
});
