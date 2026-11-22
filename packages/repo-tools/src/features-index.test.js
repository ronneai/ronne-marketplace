import { describe, expect, it } from "vitest";
import {
  checkFeatureLists,
  checkLinks,
  featureRows,
  headingAnchors,
  linkedPages,
  relativeLinks,
} from "./features-index.js";

const domains = {
  domains: { identity: "Sign-in", review: "Review" },
  features: { 191: "identity", "014": "review" },
};
const folders = [
  { id: 191, folder: "docs/features/identity/191-account-creation-rules" },
  { id: 14, folder: "docs/features/review/014-review-queue" },
];
const table = (rows) => `| ID | Feature | Status |\n|---|---|---|\n${rows.join("\n")}\n`;
const index = table([
  "| [014](review/014-review-queue/SPEC.md) | Review queue | review | done |",
  "| [191](identity/191-account-creation-rules/SPEC.md) | Who may create accounts | identity | done |",
  "| 116 | Per-workspace tokens | — | planned |",
]);
const milestones = [
  {
    file: "docs/features/milestones/M03-review.md",
    text: table([
      "| [014](../review/014-review-queue/SPEC.md) | The queue, with `a \\| b` | 012 | done |",
    ]),
  },
  {
    file: "docs/features/milestones/M32-sign-up.md",
    text: table([
      "| [191](../identity/191-account-creation-rules/SPEC.md) | Who may create accounts | 190 | done |",
      "| 116 | Per-workspace tokens | 009 | planned |",
    ]),
  },
];
const check = (over = {}) => checkFeatureLists({ folders, domains, index, milestones, ...over });

describe("featureRows", () => {
  it("reads linked and plain IDs, and the status from the last cell", () => {
    expect(featureRows(milestones[0].text)).toEqual([
      { id: "014", target: "../review/014-review-queue/SPEC.md", status: "done", line: 3 },
    ]);
    expect(featureRows("| 116 | x | planned |")).toEqual([
      { id: "116", target: null, status: "planned", line: 1 },
    ]);
    expect(featureRows("| ID | Feature |\n| [M3](x.md) | y |")).toEqual([]);
  });
});

describe("checkFeatureLists (199)", () => {
  it("passes when every feature has one row in each list, linked, with the same status", () => {
    expect(check()).toEqual([]);
  });

  it("fails on a feature missing from the index or from every milestone file", () => {
    expect(check({ index: table([index.split("\n")[2], index.split("\n")[4]]) })).toEqual([
      "feature 191 has no row in docs/features/README.md",
    ]);
    expect(check({ milestones: [milestones[1]] })).toEqual([
      "feature 014 has no row in a file in docs/features/milestones/",
    ]);
  });

  it("fails on a feature listed twice", () => {
    expect(
      check({
        milestones: [...milestones, { ...milestones[0], file: "docs/features/milestones/M04.md" }],
      }),
    ).toEqual([
      "feature 014 has 2 rows: docs/features/milestones/M03-review.md:3, docs/features/milestones/M04.md:3",
    ]);
  });

  it("reads the index's status as the milestone's without its note in brackets", () => {
    const noted = milestones.map((m) => ({
      ...m,
      text: m.text.replace("| 190 | done |", "| 190 | done (the Documentation in ronne-web `x`) |"),
    }));
    expect(check({ milestones: noted })).toEqual([]);
  });

  it("fails on a status that differs between the index and the milestone file", () => {
    expect(
      check({
        index: index.replace("Review queue | review | done", "Review queue | review | in progress"),
      }),
    ).toEqual([
      'feature 014 is "in progress" in docs/features/README.md:3 but "done" in docs/features/milestones/M03-review.md:3',
    ]);
  });

  it("fails on a link that misses the folder, and on a feature with a folder left unlinked", () => {
    expect(
      check({
        index: index.replace("review/014-review-queue/SPEC.md", "014-review-queue/SPEC.md"),
      }),
    ).toEqual([
      "docs/features/README.md:3: feature 014 links to docs/features/014-review-queue/SPEC.md, not docs/features/review/014-review-queue/SPEC.md",
    ]);
    expect(
      check({ index: index.replace("[014](review/014-review-queue/SPEC.md)", "014") }),
    ).toEqual(["docs/features/README.md:3: feature 014 has a folder, so link it"]);
  });

  it("fails on a folder under another domain than domains.json gives, or an unknown domain", () => {
    const moved = [
      { id: 191, folder: "docs/features/review/191-account-creation-rules" },
      folders[1],
    ];
    const errors = check({ folders: moved });
    expect(errors).toContain(
      "docs/features/review/191-account-creation-rules is under review, but docs/features/domains.json puts 191 under identity",
    );
    expect(check({ domains: { ...domains, domains: { review: "Review" } } })).toEqual([
      'docs/features/identity/191-account-creation-rules: "identity" isn\'t a domain in docs/features/domains.json',
    ]);
  });

  it("fails on one ID in two folders, naming both", () => {
    const twice = [...folders, { id: 191, folder: "docs/features/review/191-again" }];
    expect(check({ folders: twice })).toContain(
      "feature 191 has more than one folder: docs/features/identity/191-account-creation-rules, docs/features/review/191-again",
    );
  });

  it("fails on a domain name that can't be a folder name", () => {
    expect(
      check({ domains: { ...domains, domains: { ...domains.domains, Web_UI: "x" } } }),
    ).toEqual([
      'docs/features/domains.json: "Web_UI" isn\'t a domain name (lowercase letters, digits and -)',
    ]);
  });

  it("fails on a folder domains.json doesn't name, and on a name with no folder", () => {
    expect(check({ domains: { ...domains, features: { "014": "review" } } })).toEqual([
      "docs/features/domains.json has no domain for feature 191",
    ]);
    expect(
      check({ domains: { ...domains, features: { ...domains.features, 200: "review" } } }),
    ).toEqual(["docs/features/domains.json gives 200 a domain (review) but it has no folder"]);
  });
});

describe("relativeLinks", () => {
  it("reads relative links outside code, without the section", () => {
    const page = [
      "See [a](../a.md#x), [web](https://x.dev), [mail](mailto:a@b.c), [here](#top).",
      "`[not](code.md)` and [b](./b.md 'title')",
      "```",
      "[fenced](c.md)",
      "```",
    ].join("\n");
    expect(relativeLinks(page)).toEqual([
      { target: "../a.md", section: "x", line: 1 },
      { target: "./b.md", line: 2 },
    ]);
  });

  it("reads reference definitions, and skips code fenced with ~~~ or a longer fence, and comments", () => {
    const page = [
      "[r]: ./ref.md#x",
      "  [s]: <../s.md>",
      "[web]: https://x.dev",
      "~~~",
      "[fenced](c.md)",
      "```",
      "[still fenced](d.md)",
      "~~~",
      "````md",
      "```",
      "[in a longer fence](e.md)",
      "````",
      "<!--",
      "  [type]: Description",
      "-->",
      "<!-- [one line](./g.md) --> [kept](./h.md)",
      "Text <!-- opened mid-line [in](./i.md)",
      "[still in](./j.md) --> [out](./k.md)",
      "[after](./f.md)",
    ].join("\n");
    expect(relativeLinks(page)).toEqual([
      { target: "./ref.md", section: "x", line: 1 },
      { target: "../s.md", line: 2 },
      { target: "./h.md", line: 16 },
      { target: "./k.md", line: 18 },
      { target: "./f.md", line: 19 },
    ]);
  });

  it("stays fast on a long run of unclosed links", () => {
    const started = performance.now();
    relativeLinks("](".repeat(100_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("checkLinks", () => {
  const files = new Set([
    "docs/knowledge/a.md",
    "docs/features/_template/PLAN.md",
    "docs/features/identity/191-x/SPEC.md",
    "docs/features/identity/191-x/PLAN.md",
  ]);
  const pages = {
    "docs/features/identity/191-x/PLAN.md":
      "[spec](./SPEC.md) [witness](./WITNESS.md) [k](../../../knowledge/a.md) [ghost](../999-ghost/WITNESS.md)",
    "docs/features/identity/191-x/WITNESS.md": "[made up](ghost.md)",
    "docs/features/_template/SPEC.md":
      "[k](../../../knowledge/a.md) [old](../../knowledge/a.md) [plan](./PLAN.md) [gone](./GONE.md)",
    "docs/x.md": "[gone](./gone.md)",
    "docs/features/_template/README.md": "[k](../../knowledge/a.md)",
  };
  const run = () =>
    checkLinks(
      Object.keys(pages),
      (file) => pages[file],
      (path) => files.has(path) || [...files].some((file) => file.startsWith(`${path}/`)),
    );

  it("names each link that lands nowhere, skipping WITNESS.md, and a link to one in a folder that exists", () => {
    expect(run()).toEqual([
      "docs/features/identity/191-x/PLAN.md:1: the link to ../999-ghost/WITNESS.md lands nowhere",
      "docs/features/_template/SPEC.md:1: the link to ../../knowledge/a.md lands nowhere",
      "docs/features/_template/SPEC.md:1: the link to ./GONE.md lands nowhere",
      "docs/x.md:1: the link to ./gone.md lands nowhere",
    ]);
  });
});

describe("headingAnchors", () => {
  it("names headings as GitHub does, repeats numbered, and <a id>, outside code", () => {
    const page = [
      "# M13 — Workspaces",
      "## `rmk` + Claude Code",
      "## Notes",
      "## Notes",
      '<a id="decisions"></a>',
      "```",
      "# not a heading",
      "```",
    ].join("\n");
    expect([...headingAnchors(page)]).toEqual([
      "m13--workspaces",
      "rmk--claude-code",
      "notes",
      "notes-1",
      "decisions",
    ]);
  });
});

describe("checkLinks and sections", () => {
  it("names a link to a section the page doesn't have", () => {
    const pages = {
      "docs/a.md": "# Index\n\n## M13 — Workspaces\n",
      "docs/b.md": "[ok](a.md#m13--workspaces) [gone](a.md#m14--run-it-safely) [page](a.md)",
    };
    expect(
      checkLinks(
        Object.keys(pages),
        (file) => pages[file],
        (path) => path in pages,
      ),
    ).toEqual(["docs/b.md:1: docs/a.md has no section #m14--run-it-safely"]);
  });
});

describe("linkedPages", () => {
  it("checks the docs, the root's pages, .github and .claude, and nothing else", () => {
    expect(
      linkedPages([
        "README.md",
        "docs/a.md",
        ".github/b.md",
        ".claude/agents/c.md",
        "packages/x/README.md",
        "docs/a.json",
      ]),
    ).toEqual(["README.md", "docs/a.md", ".github/b.md", ".claude/agents/c.md"]);
  });
});
