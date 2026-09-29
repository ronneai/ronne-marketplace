import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Io, RmkError, rmkVersion } from "@ronneai/rmk/lib";
import { z } from "zod";
import { applyPlanTool, planStore, planTool } from "./plan-tools.js";
import { checkOutdated, getItem, listInstalled, searchItems } from "./read-tools.js";
import { failure, type ToolAnswer } from "./text.js";

/** Identifies this server to MCP clients, and names its entry in each tool's MCP config. */
export const serverInfo = { name: "ronne-registry", version: rmkVersion() } as const;

export type ServerOptions = {
  /** The clock, for plans' expiry; tests move it. */
  now?: () => number;
};

/** Runs a tool, turning rmk's errors into answers the assistant can read and act on. */
const guarded =
  <A>(run: (input: A) => ToolAnswer | Promise<ToolAnswer>) =>
  async (input: A): Promise<ToolAnswer> => {
    try {
      return await run(input);
    } catch (error) {
      if (error instanceof RmkError) return failure(error.code, error.message);
      return failure("error", error instanceof Error ? error.message : String(error));
    }
  };

const scope = z
  .enum(["project", "user"])
  .optional()
  .describe("project (the default): this folder; user: your home folder");

export const createServer = (io: Io, options: ServerOptions = {}) => {
  const plans = planStore(options.now ?? Date.now);
  const server = new McpServer(
    { name: serverInfo.name, version: serverInfo.version },
    {
      instructions:
        "Search and install items from a Ronne AI Marketplace. Installing takes two steps: a plan_* tool shows what would change and writes nothing; apply_plan writes it, once the person has seen the plan.",
    },
  );
  const read = { readOnlyHint: true, openWorldHint: true };

  server.registerTool(
    "search_items",
    {
      title: "Search the marketplace",
      description:
        "Finds published items by name, description or keyword, optionally of one type, in one scope, or installable in one AI tool.",
      inputSchema: {
        query: z.string().min(1).max(100),
        type: z.string().optional().describe("An item type, such as skill or mcp-server"),
        scope: z.string().optional().describe("A scope, such as @platform"),
        tool: z
          .string()
          .optional()
          .describe("An AI tool id (claude-code, codex, cursor): only items that install in it"),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: read,
    },
    guarded((input) => searchItems(io, input)),
  );

  server.registerTool(
    "get_item",
    {
      title: "Read an item",
      description:
        "An item's tags and versions, and one version's dependencies, risk flags, the AI tools it works in and README (latest unless a version or tag is given).",
      inputSchema: {
        name: z.string().describe("@scope/name"),
        version: z.string().optional().describe("A version or a tag; latest when left out"),
      },
      annotations: read,
    },
    guarded((input) => getItem(io, input)),
  );

  server.registerTool(
    "list_installed",
    {
      title: "List installed items",
      description: "What this project's lockfile holds (or your home folder's, with scope user).",
      inputSchema: { scope },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded((input) => listInstalled(io, input)),
  );

  server.registerTool(
    "check_outdated",
    {
      title: "Check for newer versions",
      description:
        "For each item the project asks for: the version it's locked at, the newest its range allows, and the newest published.",
      inputSchema: { scope },
      annotations: read,
    },
    guarded((input) => checkOutdated(io, input)),
  );

  const targets = z
    .array(z.string())
    .optional()
    .describe(
      "AI tool ids, such as claude-code, codex or cursor; left out, the project's config or what the folder looks like decides",
    );
  // Planning writes nothing to the project; only apply_plan does.
  const planning = { readOnlyHint: true, openWorldHint: true };

  server.registerTool(
    "plan_install",
    {
      title: "Plan an install",
      description:
        "Works out what installing items would write, remove and warn about, with their risk flags, and writes nothing. Show the plan to the person; apply it with apply_plan.",
      inputSchema: {
        items: z.array(z.string()).describe("@scope/name, with @tag or @range after it if wanted"),
        targets,
        scope,
      },
      annotations: planning,
    },
    guarded((input) => planTool(io, plans, "install", input)),
  );

  server.registerTool(
    "plan_update",
    {
      title: "Plan an update",
      description:
        "Works out what updating items (or all of them) within their ranges would change, and writes nothing. Apply it with apply_plan.",
      inputSchema: { items: z.array(z.string()).optional(), targets, scope },
      annotations: planning,
    },
    guarded((input) => planTool(io, plans, "update", input)),
  );

  server.registerTool(
    "plan_remove",
    {
      title: "Plan a removal",
      description:
        "Works out what removing items, and whatever nothing else needs, would take away, and writes nothing. Apply it with apply_plan.",
      inputSchema: { items: z.array(z.string()).min(1), targets, scope },
      annotations: planning,
    },
    guarded((input) => planTool(io, plans, "remove", input)),
  );

  server.registerTool(
    "apply_plan",
    {
      title: "Apply a plan",
      description:
        "Writes exactly what a plan_* tool showed, then the lockfile and state. Only after the person has seen the plan. Refuses a plan that expired, changed underneath, or has conflicts.",
      inputSchema: { planId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    guarded((input) => applyPlanTool(io, plans, input)),
  );

  return server;
};
