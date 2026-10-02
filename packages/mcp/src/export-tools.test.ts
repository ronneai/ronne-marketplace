import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { packItem } from "@ronneai/core/pack";
import { diskHash } from "@ronneai/rmk/lib";
import {
  exportRoutes,
  type FakeIo,
  type FakeOpenDraft,
  fakeIo,
  identityRoutes,
  REGISTRY,
  type Route,
  run,
} from "@ronneai/rmk/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  exportItemsTool,
  listLocalItems,
  planExportTool,
  type StoredExport,
} from "./export-tools.js";
import { planStore } from "./plan-tools.js";

let io: FakeIo;
let registry: ReturnType<typeof exportRoutes>;
afterEach(() => io?.cleanup());

const write = (path: string, content: string) => {
  const full = join(io.cwd, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
};
const skillMd = (name: string) =>
  `---\nname: ${name}\ndescription: The ${name} skill.\n---\nBody.\n`;

/** A project with a skill of every origin, and a registry that knows none of their names. */
const project = async (
  fail: Record<string, { status: number; json?: unknown }> = {},
  extra: Record<string, Route> = {},
  open?: FakeOpenDraft[],
) => {
  registry = exportRoutes({ fail, ...(open ? { open } : {}) });
  const notFound = () => ({
    status: 404,
    json: { error: { code: "item_not_found", message: "No." } },
  });
  io = fakeIo(
    {
      ...identityRoutes("rmk_test_token"),
      ...registry.routes,
      ...Object.fromEntries(
        ["mine", "installed", "edited", "copied", "rendered"].map((n) => [
          `GET /items/team/${n}`,
          notFound,
        ]),
      ),
      ...extra,
    },
    { interactive: false, env: { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY } },
  );
  write(".claude/skills/mine/SKILL.md", skillMd("mine"));
  write(".claude/skills/installed/SKILL.md", skillMd("installed"));
  write(".agents/skills/edited/SKILL.md", skillMd("edited"));
  write(".claude/skills/copied/SKILL.md", skillMd("copied"));
  write(
    ".claude/skills/copied/ronne.yaml",
    'name: "@other/copied"\nversion: 2.0.0\ntype: skill\ndescription: C.\n',
  );
  write(
    ".claude/skills/rendered/SKILL.md",
    "---\nname: rendered\n---\n<!-- managed by rmk: @examples/house-style@1.0.0 -->\n",
  );
  const entry = async (item: string, path: string) => ({
    item,
    version: "1.0.0",
    targets: ["claude-code"],
    kind: "dir",
    path,
    sha256: (await diskHash(io.cwd, { kind: "dir", path })) ?? "",
  });
  write(
    ".rmk/state.json",
    JSON.stringify({
      version: 1,
      entries: [
        await entry("@team/installed", ".claude/skills/installed"),
        await entry("@team/edited", ".agents/skills/edited"),
      ],
    }),
  );
  write(".agents/skills/edited/notes.md", "mine now");
};

describe("list_local_items", () => {
  it("lists every skill with whose it is, reading no network", async () => {
    await project();
    const result = await listLocalItems(io, {});
    expect(io.requests).toEqual([]);
    expect(result.structuredContent).toEqual({
      scope: "project",
      items: [
        {
          name: "copied",
          type: "skill",
          tool: "claude-code",
          folder: ".claude/skills/copied",
          origin: "registry_copy",
          item: "@other/copied",
          version: "2.0.0",
        },
        {
          name: "edited",
          type: "skill",
          tool: "shared",
          folder: ".agents/skills/edited",
          origin: "installed_edited",
          item: "@team/edited",
          version: "1.0.0",
        },
        {
          name: "installed",
          type: "skill",
          tool: "claude-code",
          folder: ".claude/skills/installed",
          origin: "installed",
          item: "@team/installed",
          version: "1.0.0",
        },
        {
          name: "mine",
          type: "skill",
          tool: "claude-code",
          folder: ".claude/skills/mine",
          origin: "yours",
        },
        {
          name: "rendered",
          type: "skill",
          tool: "claude-code",
          folder: ".claude/skills/rendered",
          origin: "rendered",
          item: "@examples/house-style",
          version: "1.0.0",
        },
      ],
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("mine  skill  claude-code  .claude/skills/mine  yours");
    expect(text).toContain(
      "edited  skill  shared  .agents/skills/edited  installed and edited (@team/edited@1.0.0)",
    );
    expect(text).toContain("Only items marked yours can be exported");
  });

  it("agrees with rmk export --dry-run --json in the same folder", async () => {
    await project();
    const listed = (await listLocalItems(io, {})).structuredContent as {
      items: { name: string; folder: string; origin: string }[];
    };
    const dryRun = JSON.parse(
      (
        await run(
          ["export", ...listed.items.map((i) => i.name), "--to", "team", "--dry-run", "--json"],
          io,
        )
      ).stdout,
    ) as { planned: { local: string }[]; refused: { path: string; code: string }[] };
    const fromRmk = new Map<string, string>([
      ...dryRun.planned.map((p) => [p.local, "yours"] as [string, string]),
      ...dryRun.refused.map((r) => [r.path, r.code] as [string, string]),
    ]);
    // An edited install and a registry copy are proposals (042); this registry lacks their items.
    const asRmkCode = (origin: string) =>
      origin === "installed_edited" || origin === "registry_copy" ? "base_not_found" : origin;
    expect(Object.fromEntries(listed.items.map((i) => [i.folder, asRmkCode(i.origin)]))).toEqual(
      Object.fromEntries(fromRmk),
    );
  });

  it("says when there's nothing, and looks in the home folder with scope user", async () => {
    io = fakeIo({}, { interactive: false });
    expect((await listLocalItems(io, {})).content[0]?.text).toContain(
      "No skills, agents, commands, rules or MCP servers found",
    );
    mkdirSync(join(io.home, ".claude/skills/personal"), { recursive: true });
    writeFileSync(join(io.home, ".claude/skills/personal/SKILL.md"), skillMd("personal"));
    const user = await listLocalItems(io, { scope: "user" });
    expect(user.structuredContent).toMatchObject({
      scope: "user",
      items: [{ name: "personal", origin: "yours" }],
    });
    expect((await listLocalItems(io, { type: "agent", scope: "user" })).structuredContent).toEqual({
      scope: "user",
      items: [],
    });
  });
});

describe("plan_export", () => {
  const plan = (input: Parameters<typeof planExportTool>[2]) =>
    planExportTool(io, planStore<StoredExport>(Date.now), input);
  const posts = () => io.requests.filter((r) => r.method === "POST");

  it("without a scope, answers the scopes and needs, with no planId, and sends nothing", async () => {
    await project();
    const result = await plan({ items: ["mine"] });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      needs: ["to"],
      scopes: [{ name: "team", description: "A team." }],
    });
    expect(result.content[0]?.text).toContain("Never choose it yourself.");
    expect(posts()).toEqual([]);
  });

  it("with a scope, answers the plan and a planId, and sends nothing", async () => {
    await project();
    const result = await plan({ items: ["mine"], to: "@team" });
    const data = result.structuredContent as Record<string, unknown>;
    expect(data.planId).toEqual(expect.any(String));
    expect(data).toMatchObject({
      registry: REGISTRY,
      to: "team",
      refused: [],
      items: [
        {
          local: ".claude/skills/mine",
          name: "@team/mine",
          type: "skill",
          files: [
            { path: "SKILL.md", executable: false },
            { path: "ronne.yaml", executable: false },
          ],
          manifest: expect.stringContaining('name: "@team/mine"'),
          published: false,
        },
      ],
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("@team/mine  skill  (from .claude/skills/mine)");
    expect(text).toContain(`call export_items with planId "${data.planId}"`);
    expect(posts()).toEqual([]);
  });

  it("answers scope_not_found with the list", async () => {
    await project();
    const result = await plan({ items: ["mine"], to: "nowhere" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "scope_not_found" },
      needs: ["to"],
      scopes: [{ name: "team", description: "A team." }],
    });
  });

  it("takes only listed items: no other path, and installed items are refused with no planId", async () => {
    await project();
    write("elsewhere/tool/SKILL.md", skillMd("tool"));
    const path = await plan({ items: ["elsewhere/tool"], to: "team" });
    expect(path).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "not_listed" } },
    });
    const installed = await plan({ items: ["installed", "edited"], to: "team" });
    const data = installed.structuredContent as Record<string, unknown>;
    expect(data.planId).toBeUndefined();
    expect(data.refused).toEqual([
      expect.objectContaining({ path: ".claude/skills/installed", code: "installed" }),
      // Edited, it's a proposal (042), and this registry doesn't have its item.
      expect.objectContaining({ path: ".agents/skills/edited", code: "base_not_found" }),
    ]);
    expect(installed.content[0]?.text).toContain("unchanged since: there's nothing to export");
    const copy = await plan({ items: [".claude/skills/copied"], to: "team" });
    expect((copy.structuredContent as { refused: { code: string }[] }).refused[0]?.code).toBe(
      "base_not_found",
    );
  });

  it("says when an item is stopped by a secret, and plans the rest", async () => {
    await project();
    write(".claude/skills/mine/config.md", `token: ghp_${"a1B2".repeat(9)}\n`);
    const result = await plan({ items: ["mine", "installed"], to: "team" });
    const data = result.structuredContent as { planId?: string; refused: { code: string }[] };
    expect(data.planId).toBeUndefined();
    expect(data.refused.map((r) => r.code)).toEqual(["secret", "installed"]);
    expect(result.content[0]?.text).toContain("no plan to upload");
  });
});

describe("export_items", () => {
  const setup = async (fail = {}) => {
    await project(fail);
    let clock = 1_000_000;
    const store = planStore<StoredExport>(() => clock);
    const plan = async (items: string[]) =>
      (
        (await planExportTool(io, store, { items, to: "team" })).structuredContent as {
          planId: string;
        }
      ).planId;
    return {
      store,
      plan,
      exportItems: (planId: string) => exportItemsTool(io, store, { planId }),
      later: (ms: number) => {
        clock += ms;
      },
    };
  };
  const posts = () => io.requests.filter((r) => r.method === "POST");

  it("uploads exactly the plan, once, and says where each draft is", async () => {
    const { plan, exportItems } = await setup();
    write(".claude/skills/other/SKILL.md", skillMd("other"));
    const planId = await plan(["mine", "other"]);
    const result = await exportItems(planId);
    expect(result.isError).toBeUndefined();
    expect(registry.drafts.map((d) => d.name)).toEqual(["@team/mine", "@team/other"]);
    expect(posts()).toHaveLength(2);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain(
      `@team/mine: draft created at ${REGISTRY}/submissions/${registry.drafts[0]?.id}`,
    );
    expect(text).toContain("Nothing is submitted");
    expect((result.structuredContent as { exported: unknown[] }).exported).toHaveLength(2);

    const again = await exportItems(planId);
    expect(again.structuredContent).toMatchObject({ error: { code: "plan_expired" } });
    expect(posts()).toHaveLength(2);
  });

  it("refuses an expired plan, an unknown or install plan's id, and a stale one", async () => {
    const { plan, exportItems, later } = await setup();
    const expired = await plan(["mine"]);
    later(10 * 60 * 1000 + 1);
    expect((await exportItems(expired)).structuredContent).toMatchObject({
      error: { code: "plan_expired" },
    });
    const installStore = planStore<string>(Date.now);
    const installId = installStore.put("an install", "x");
    expect((await exportItems(installId)).structuredContent).toMatchObject({
      error: { code: "plan_expired" },
    });
    const stale = await plan(["mine"]);
    write(".claude/skills/mine/SKILL.md", `${skillMd("mine")}Edited.\n`);
    expect((await exportItems(stale)).structuredContent).toMatchObject({
      error: { code: "plan_stale" },
    });
    expect(posts()).toEqual([]);
  });

  it("names the drafts made when a later upload fails, and uses the plan up", async () => {
    const { plan, exportItems } = await setup({
      "@team/other": {
        status: 409,
        json: { error: { code: "draft_limit", message: "You already have 50 drafts." } },
      },
    });
    write(".claude/skills/other/SKILL.md", skillMd("other"));
    const planId = await plan(["mine", "other"]);
    const result = await exportItems(planId);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      exported: [{ name: "@team/mine" }],
      notUploaded: ["@team/other"],
      error: { code: "draft_limit" },
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("@team/mine: draft created at");
    expect(text).toContain("Not uploaded: @team/other.");
    expect((await exportItems(planId)).structuredContent).toMatchObject({
      error: { code: "plan_expired" },
    });
  });
});

describe("the other types over MCP (040)", () => {
  const SECRET = `ghp_${"a1B2".repeat(9)}`;
  const setup = async () => {
    await project();
    write(".claude/commands/mine.md", "---\ndescription: My command.\n---\nDo it.\n");
    write(
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          tracker: {
            type: "http",
            url: "https://t.example/mcp",
            headers: { Authorization: `Bearer ${SECRET}` },
          },
        },
      }),
    );
    return planStore<StoredExport>(Date.now);
  };

  it("lists and narrows by type", async () => {
    await setup();
    const listed = (await listLocalItems(io, { type: "mcp-server" })).structuredContent as {
      items: { name: string; type: string; folder: string; origin: string }[];
    };
    expect(listed.items).toEqual([
      {
        name: "tracker",
        type: "mcp-server",
        tool: "claude-code",
        folder: ".mcp.json (mcpServers.tracker)",
        origin: "yours",
      },
    ]);
  });

  it("asks for type when a name is more than one item, and plans with it", async () => {
    const store = await setup();
    const ambiguous = await planExportTool(io, store, { items: ["mine"], to: "team" });
    expect(ambiguous.structuredContent).toMatchObject({ error: { code: "ambiguous" } });
    const planned = await planExportTool(io, store, {
      items: ["mine"],
      to: "team",
      type: "command",
    });
    expect(planned.structuredContent).toMatchObject({
      items: [{ name: "@team/mine", type: "command" }],
    });
  });

  it("exports an MCP server with its description, and sends no credential", async () => {
    const store = await setup();
    const planned = await planExportTool(io, store, {
      items: [".mcp.json (mcpServers.tracker)"],
      to: "team",
      description: "Tracks issues.",
    });
    const data = planned.structuredContent as {
      planId: string;
      items: { manifest: string; warnings: { code: string }[] }[];
    };
    expect(data.items[0]?.manifest).toContain("description: Tracks issues.");
    expect(data.items[0]?.warnings.map((w) => w.code)).toContain("secret_replaced");
    expect(JSON.stringify(planned)).not.toContain(SECRET);
    const exported = await exportItemsTool(io, store, { planId: data.planId });
    expect(exported.isError).toBeUndefined();
    expect(registry.drafts.map((d) => d.name)).toEqual(["@team/tracker"]);
    expect(JSON.stringify(io.requests)).not.toContain(SECRET);
  });
});

describe("dependencies over MCP (041)", () => {
  const setup = async () => {
    await project();
    write(
      ".claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: Reviews.\nskills: [mine]\n---\nReview.\n",
    );
    return planStore<StoredExport>(Date.now);
  };

  it("answers the findings and no planId until the person chooses", async () => {
    const store = await setup();
    const result = await planExportTool(io, store, { items: ["reviewer"], to: "team" });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      needs: ["dependencies"],
      findings: [
        {
          status: "yours",
          reference: { kind: "skill", name: "mine" },
          usedBy: [".claude/agents/reviewer.md"],
          item: { name: "mine", type: "skill", folder: ".claude/skills/mine" },
        },
      ],
    });
    expect(result.content[0]?.text).toContain("recommend it");
    expect(io.requests.filter((r) => r.method === "POST")).toEqual([]);
  });

  it("plans the item with its dependencies, uploads them first, and says the order", async () => {
    const store = await setup();
    const planned = await planExportTool(io, store, {
      items: ["reviewer"],
      to: "team",
      dependencies: "include",
    });
    const data = planned.structuredContent as {
      planId: string;
      items: { name: string; dependencies: Record<string, string>; usedByAnother: boolean }[];
    };
    expect(data.items.map((i) => [i.name, i.usedByAnother, i.dependencies])).toEqual([
      ["@team/mine", true, {}],
      ["@team/reviewer", false, { "@team/mine": "^1.0.0" }],
    ]);
    const exported = await exportItemsTool(io, store, { planId: data.planId });
    expect(registry.drafts.map((d) => d.name)).toEqual(["@team/mine", "@team/reviewer"]);
    expect(exported.structuredContent).toMatchObject({
      order: [{ item: "@team/reviewer", after: ["@team/mine"] }],
    });
    expect(exported.content[0]?.text).toContain(
      "@team/mine must be in review first: once it is ready, rmk submit @team/reviewer submits it first.",
    );
  });

  it("exports only the item with omit", async () => {
    const store = await setup();
    const planned = await planExportTool(io, store, {
      items: ["reviewer"],
      to: "team",
      dependencies: "omit",
    });
    expect(
      (planned.structuredContent as { items: { name: string }[] }).items.map((i) => i.name),
    ).toEqual(["@team/reviewer"]);
  });
});

describe("Codex and Cursor over MCP (043)", () => {
  it("lists each item's tool, narrows with from, and settles a name two tools have", async () => {
    await project();
    write(".cursor/agents/mine.md", "---\nname: mine\ndescription: Mine in Cursor.\n---\nDo.\n");
    const listed = (await listLocalItems(io, { from: "cursor" })).structuredContent as {
      items: { name: string; tool: string }[];
    };
    // The shared .agents/skills/ folder is Cursor's too.
    expect(listed.items.map((i) => `${i.tool}:${i.name}`)).toEqual([
      "shared:edited",
      "cursor:mine",
    ]);
    const store = planStore<StoredExport>(Date.now);
    const ambiguous = await planExportTool(io, store, { items: ["mine"], to: "team" });
    expect(ambiguous.structuredContent).toMatchObject({ error: { code: "ambiguous" } });
    const planned = await planExportTool(io, store, {
      items: ["mine"],
      to: "team",
      from: "cursor",
    });
    expect(planned.structuredContent).toMatchObject({
      items: [{ local: ".cursor/agents/mine.md", type: "agent" }],
    });
  });
});

describe("proposals over MCP (042)", () => {
  it("plans the person's own published skill as a proposal, and exports it with its base", async () => {
    const packed = await packItem(
      [
        {
          path: "ronne.yaml",
          bytes: new TextEncoder().encode(
            'name: "@team/mine"\ntype: skill\ndescription: The mine skill.\nkeywords: [mine]\nskill:\n  entry: SKILL.md\n',
          ),
        },
        { path: "SKILL.md", bytes: new TextEncoder().encode(skillMd("mine")) },
      ],
      { version: "2.0.0" },
    );
    await project(
      {},
      {
        "GET /items/team/mine": () => ({
          json: { type: "skill", tags: { latest: "2.0.0" }, versions: [{ version: "2.0.0" }] },
        }),
        "GET /items/team/mine/2.0.0": () => ({ json: { version: "2.0.0", sha256: packed.sha256 } }),
        "GET /items/team/mine/2.0.0/tarball": () => ({
          bytes: packed.tgz,
          headers: { "x-checksum-sha256": packed.sha256 },
        }),
      },
    );
    write(".claude/skills/mine/notes.md", "Notes.\n");
    const store = planStore<StoredExport>(Date.now);
    const planned = await planExportTool(io, store, { items: ["mine"], to: "team" });
    const data = planned.structuredContent as {
      planId: string;
      items: {
        manifest: string;
        proposal: { baseVersion: string; changes: { added: string[] } };
      }[];
    };
    expect(data.items[0]?.proposal).toMatchObject({
      baseVersion: "2.0.0",
      changes: { added: ["notes.md"] },
    });
    expect(data.items[0]?.manifest).toContain("keywords");
    expect(planned.content[0]?.text).toContain("Proposal to @team/mine, from 2.0.0");
    const exported = await exportItemsTool(io, store, { planId: data.planId });
    expect(exported.content[0]?.text).toContain("@team/mine: proposal from 2.0.0 created at");
    expect(registry.drafts[0]?.base).toBe("2.0.0");

    const asNew = await planExportTool(io, store, { items: ["mine"], to: "team", new: true });
    expect(
      (asNew.structuredContent as { items: { proposal: unknown }[] }).items[0]?.proposal,
    ).toBeNull();
  });
});

describe("updating the person's drafts (051)", () => {
  const open: FakeOpenDraft[] = [
    { id: "01MINE", name: "@team/mine", type: "skill", status: "changes_requested" },
  ];
  const planned = async (input: { newDraft?: boolean } = {}) => {
    await project({}, {}, open);
    const store = planStore<StoredExport>(() => 1_000_000);
    const answer = await planExportTool(io, store, { items: ["mine"], to: "team", ...input });
    return { store, answer };
  };

  it("shows the draft it updates, and updates it", async () => {
    const { store, answer } = await planned();
    expect(answer.content[0]?.text).toContain(
      `Updates your draft ${REGISTRY}/submissions/01MINE (sent back for changes`,
    );
    const data = answer.structuredContent as { planId: string; items: { updates: unknown }[] };
    expect(data.items[0]?.updates).toMatchObject({ id: "01MINE", status: "changes_requested" });
    const result = await exportItemsTool(io, store, { planId: data.planId });
    expect(result.content[0]?.text).toContain(
      `@team/mine: draft updated at ${REGISTRY}/submissions/01MINE`,
    );
    expect(registry.replaced.map((r) => r.id)).toEqual(["01MINE"]);
    expect(registry.drafts).toEqual([]);
  });

  it("makes a separate draft with newDraft", async () => {
    const { store, answer } = await planned({ newDraft: true });
    const data = answer.structuredContent as { planId: string; items: { updates: unknown }[] };
    expect(data.items[0]?.updates).toBeNull();
    await exportItemsTool(io, store, { planId: data.planId });
    expect(registry.replaced).toEqual([]);
    expect(registry.drafts.map((d) => d.name)).toEqual(["@team/mine"]);
  });
});

describe("descriptions (053)", () => {
  const setup = async () => {
    await project(
      {},
      {
        "GET /items/team/house": () => ({
          status: 404,
          json: { error: { code: "item_not_found", message: "No." } },
        }),
      },
    );
    write(".claude/rules/house.md", "Use tabs.\n");
    return planStore<StoredExport>(() => 1_000_000);
  };

  it("asks the assistant for one, with the item's content, and plans nothing until it has it", async () => {
    const store = await setup();
    const asked = await planExportTool(io, store, { items: ["house"], to: "team" });
    expect(asked.isError).toBeUndefined();
    expect(asked.structuredContent).toMatchObject({
      needs: ["descriptions"],
      items: [
        {
          name: "@team/house",
          type: "rule",
          suggestion: "Use tabs.",
          file: { path: "rule.md", excerpt: "Use tabs.\n" },
        },
      ],
    });
    expect(asked.structuredContent).not.toHaveProperty("planId");
    expect(asked.content[0]?.text).toContain("Write one sentence for each item");
  });

  it("plans with the assistant's descriptions, shows them as its own, and uploads exactly those", async () => {
    const store = await setup();
    const planned = await planExportTool(io, store, {
      items: ["house"],
      to: "team",
      descriptions: { house: "Keeps the house style: tabs, not spaces." },
    });
    expect(planned.content[0]?.text).toContain(
      "Description: Keeps the house style: tabs, not spaces.  (written by your AI tool)",
    );
    const data = planned.structuredContent as {
      planId: string;
      items: { description: unknown }[];
    };
    expect(data.items[0]?.description).toEqual({
      origin: "given",
      text: "Keeps the house style: tabs, not spaces.",
      suggestion: null,
    });
    await exportItemsTool(io, store, { planId: data.planId });
    const files = (registry.drafts[0]?.files ?? []) as { path: string; content: string }[];
    const manifest = files.find((f) => f.path === "ronne.yaml");
    expect(manifest?.content).toContain('description: "Keeps the house style: tabs, not spaces."');
  });

  it("refuses one over 300 characters, and one for an item that isn't planned", async () => {
    const store = await setup();
    const long = await planExportTool(io, store, {
      items: ["house"],
      to: "team",
      descriptions: { house: "x".repeat(301) },
    });
    expect(long.structuredContent).toMatchObject({ error: { code: "description_too_long" } });
    const unknown = await planExportTool(io, store, {
      items: ["house"],
      to: "team",
      descriptions: { house: "Tabs.", hose: "Typo." },
    });
    expect(unknown.structuredContent).toMatchObject({ error: { code: "unknown_item" } });
  });
});
