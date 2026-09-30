import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { diskHash } from "@ronneai/rmk/lib";
import {
  exportRoutes,
  type FakeIo,
  fakeIo,
  identityRoutes,
  REGISTRY,
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
const project = async (fail: Record<string, { status: number; json?: unknown }> = {}) => {
  registry = exportRoutes({ fail });
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
          folder: ".claude/skills/copied",
          origin: "registry_copy",
          item: "@other/copied",
          version: "2.0.0",
        },
        {
          name: "edited",
          type: "skill",
          folder: ".agents/skills/edited",
          origin: "installed_edited",
          item: "@team/edited",
          version: "1.0.0",
        },
        {
          name: "installed",
          type: "skill",
          folder: ".claude/skills/installed",
          origin: "installed",
          item: "@team/installed",
          version: "1.0.0",
        },
        { name: "mine", type: "skill", folder: ".claude/skills/mine", origin: "yours" },
        {
          name: "rendered",
          type: "skill",
          folder: ".claude/skills/rendered",
          origin: "rendered",
          item: "@examples/house-style",
          version: "1.0.0",
        },
      ],
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("mine  skill  .claude/skills/mine  yours");
    expect(text).toContain(
      "edited  skill  .agents/skills/edited  installed and edited (@team/edited@1.0.0)",
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
    const asRmkCode = (origin: string) => (origin === "installed_edited" ? "installed" : origin);
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
      expect.objectContaining({ path: ".agents/skills/edited", code: "installed" }),
    ]);
    expect(installed.content[0]?.text).toContain("Propose a change");
    const copy = await plan({ items: [".claude/skills/copied"], to: "team" });
    expect((copy.structuredContent as { refused: { code: string }[] }).refused[0]?.code).toBe(
      "registry_copy",
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
