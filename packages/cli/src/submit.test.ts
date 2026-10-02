import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";
import {
  type FakeIo,
  type FakeSubmitDraft,
  fakeIo,
  identityRoutes,
  REGISTRY,
  submitRoutes,
} from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());
const rmk = (...argv: string[]) => run(argv, io);

// Valid ULIDs, as the registry makes them (Crockford's base 32: no I, L, O or U).
const ID = {
  style: "01J0000000000000000000000A",
  notes: "01J0000000000000000000000B",
  agent: "01J0000000000000000000000C",
  skill: "01J0000000000000000000000D",
  review: "01J0000000000000000000000E",
  twin: "01J0000000000000000000000F",
};

const DRAFTS: FakeSubmitDraft[] = [
  { id: ID.style, name: "@team/style", type: "rule", status: "draft" },
  {
    id: ID.notes,
    name: "@team/notes",
    type: "rule",
    status: "draft",
    errors: [{ code: "schema", message: "description is required." }],
  },
  {
    id: ID.agent,
    name: "@team/reviewer",
    type: "agent",
    status: "changes_requested",
    errors: [
      {
        code: "dependency_not_found",
        message:
          "@team/checklist isn't a published item. A dependency has to be released before items can depend on it.",
      },
    ],
  },
  { id: ID.skill, name: "@team/checklist", type: "skill", status: "draft" },
  { id: ID.review, name: "@team/done", type: "rule", status: "submitted" },
];

const setup = (
  options: { drafts?: FakeSubmitDraft[]; taken?: string[]; interactive?: boolean } = {},
) => {
  const registry = submitRoutes(options.drafts ?? DRAFTS, options.taken);
  io = fakeIo(
    { ...identityRoutes("rmk_test_token"), ...registry.routes },
    {
      env: { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY },
      interactive: options.interactive ?? true,
    },
  );
  return registry;
};
const posts = () => io.requests.filter((r) => r.method === "POST").map((r) => r.path);

describe("rmk submit (052)", () => {
  it("by name: checks, shows ready and not ready with why, asks, and submits only the ready ones", async () => {
    const { submitted } = setup();
    io.answers.push("y");
    const result = await rmk("submit", "@team/style", "@team/notes");
    expect(io.questions[0]).toBe(
      [
        "Ready to submit (1):",
        `  @team/style  rule  ${REGISTRY}/submissions/${ID.style}`,
        "",
        "Not ready (1):",
        `  @team/notes  rule  ${REGISTRY}/submissions/${ID.notes}`,
        "    - description is required.",
        "",
        "Submit 1 draft for review? Reviewers see them; you can withdraw one until it's approved. [y/N] ",
      ].join("\n"),
    );
    expect(submitted).toEqual([ID.style]);
    // The check already included any dependency drafts, so the submit doesn't add them again.
    expect(io.requests.find((r) => r.path === "/api/v1/drafts/submit")?.body).toEqual({
      ids: [ID.style],
      dependencies: false,
    });
    expect(result.stdout).toContain(
      `@team/style: submitted for review (revision 1) at ${REGISTRY}/submissions/${ID.style}`,
    );
    expect(result.stdout).toContain("Not ready, so not submitted: @team/notes.");
    expect(result.exitCode).toBe(1);
  });

  it("by id, and with --all; exits 0 when everything asked for went", async () => {
    const { submitted } = setup();
    const byId = await rmk("submit", ID.style, ID.skill, "--yes");
    expect(byId.exitCode, byId.stderr).toBe(0);
    expect(submitted).toEqual([ID.style, ID.skill]);

    setup();
    const all = await rmk("submit", "--all", "--yes", "--json");
    expect(io.requests.find((r) => r.path === "/api/v1/drafts/check")?.body).toEqual({ all: true });
    const json = JSON.parse(all.stdout);
    expect(json.submitted.map((s: { id: string }) => s.id)).toEqual([ID.style, ID.skill]);
    expect(json.notSubmitted.map((s: { id: string }) => s.id)).toEqual([ID.notes, ID.agent]);
    expect(all.exitCode).toBe(1);
  });

  it("says the order when a draft waits for another to be in review", async () => {
    setup();
    const result = await rmk("submit", "--all", "--dry-run");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "@team/checklist must be in review first: once it is ready, rmk submit @team/reviewer submits it first.",
    );
    expect(result.stdout).toContain("Dry run: nothing was submitted.");
    expect(posts()).toEqual(["/api/v1/drafts/check"]);
  });

  it("includes your dependency drafts, first, and leaves them out with --no-deps (056)", async () => {
    const kit = "01J0000000000000000000000G";
    setup({
      drafts: [
        ...DRAFTS,
        {
          id: kit,
          name: "@team/kit",
          type: "bundle",
          status: "draft",
          includes: [ID.style],
          errors: [{ code: "dependency_not_found", message: "@team/style isn't in review." }],
        },
      ],
    });
    const preview = await rmk("submit", kit, "--dry-run");
    expect(preview.stdout).toContain("Included, as dependencies, and submitted first (1):");
    expect(preview.stdout).toContain("    - for @team/kit");
    const result = await rmk("submit", kit, "--yes");
    expect(io.requests.find((r) => r.path === "/api/v1/drafts/submit")?.body).toEqual({
      ids: [ID.style, kit],
      dependencies: false,
    });
    expect(result.exitCode).toBe(0);

    const alone = await rmk("submit", kit, "--no-deps", "--dry-run");
    expect(io.requests.at(-1)?.body).toEqual({ ids: [kit], dependencies: false });
    expect(alone.stdout).toContain("@team/style isn't in review.");
  });

  it("needs an id when a name has several drafts, and says which names have none", async () => {
    setup({
      drafts: [...DRAFTS, { id: ID.twin, name: "@team/style", type: "rule", status: "draft" }],
    });
    const ambiguous = await rmk("submit", "@team/style", "--yes", "--json");
    expect(ambiguous.exitCode).toBe(2);
    expect(JSON.parse(ambiguous.stdout).error).toMatchObject({
      code: "ambiguous",
      item: "@team/style",
    });
    const unknown = await rmk("submit", "@team/nope", "@team/checklist", "--yes");
    expect(unknown.stdout).toContain("Not ready, so not submitted: @team/nope.");
    expect(unknown.exitCode).toBe(1);
    expect(await rmk("submit", "not-an-id", "--yes")).toMatchObject({ exitCode: 2 });
  });

  it("stops with exit 1 when nothing is ready, without asking", async () => {
    setup();
    const result = await rmk("submit", "@team/notes");
    expect(result.exitCode).toBe(1);
    expect(io.questions).toEqual([]);
    expect(result.stderr).toContain("Nothing is ready to submit");
    expect(posts()).toEqual(["/api/v1/drafts/check"]);
  });

  it("reports one that stopped being ready between the check and the submit", async () => {
    setup({ taken: [ID.style] });
    const result = await rmk("submit", "@team/style", "--yes");
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`Not submitted: @team/style  rule  ${REGISTRY}/submissions/`);
    expect(result.stdout).toContain("  - @team/style is taken.");
  });

  it("needs --yes without a terminal, asks for something to submit, and sends nothing on no", async () => {
    setup({ interactive: false });
    expect(await rmk("submit", "@team/style")).toMatchObject({ exitCode: 2 });
    expect(await rmk("submit", "--yes")).toMatchObject({ exitCode: 2 });
    expect(await rmk("submit", "@team/style", "--all", "--yes")).toMatchObject({ exitCode: 2 });
    setup();
    io.answers.push("n");
    expect(await rmk("submit", "@team/style")).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining("Nothing submitted."),
    });
    expect(posts()).toEqual(["/api/v1/drafts/check"]);
  });
});
