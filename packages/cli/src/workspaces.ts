import { type ApiClient, ApiError, joinUrl } from "./api.js";
import type { Args } from "./cli.js";
import { RmkError, usage } from "./errors.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";

/**
 * Workspaces from rmk's side (feature 095): the workspaces the registry shows you, with your role,
 * and where to ask to join one. Asking is done in the web app (094), never from here.
 */
export type Workspace = {
  name: string;
  description: string;
  visibility: "public" | "private";
  global: boolean;
  /** Your role there; null where you aren't a member, `root` everywhere for root. */
  role: string | null;
  /** Where to ask to join, where you aren't a member. */
  joinUrl: string | null;
};

/** The first Ronne release whose registry has workspaces. */
export const WORKSPACES_SINCE = "0.4.0";

/** The workspaces you see, `global` first. An older registry, without them, is said plainly. */
export const fetchWorkspaces = async (api: ApiClient): Promise<Workspace[]> => {
  let page: { workspaces: Omit<Workspace, "joinUrl">[] };
  try {
    page = await api.get("/workspaces");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      throw new RmkError(
        `This registry doesn't have workspaces (it's older than ${WORKSPACES_SINCE}).`,
        1,
        "no_workspaces",
      );
    throw error;
  }
  return page.workspaces.map((w) => ({
    ...w,
    joinUrl: w.role === null ? joinUrl(api.registry, w.name) : null,
  }));
};

/** The table `rmk workspaces` prints, and the MCP server's `list_workspaces` too. */
export const workspaceLines = (workspaces: readonly Workspace[]): string[] => {
  const rows = [
    ["WORKSPACE", "VISIBILITY", "YOUR ROLE"],
    ...workspaces.map((w) => [w.name, w.visibility, w.role ?? "—"]),
  ];
  const widths = [0, 1].map((i) => Math.max(...rows.map((r) => r[i]?.length ?? 0)));
  return rows.map((row, i) => {
    const asked = i > 0 ? workspaces[i - 1]?.joinUrl : null;
    const role = `${row[2]}${asked ? `   (ask: ${asked})` : ""}`;
    return `${row[0]?.padEnd(widths[0] ?? 0)}  ${row[1]?.padEnd(widths[1] ?? 0)}  ${role}`;
  });
};

/** `rmk workspaces`. */
export const workspacesCommand = async (_io: Io, _args: Args, out: Output, api: ApiClient) => {
  const workspaces = await fetchWorkspaces(api);
  out.set("workspaces", workspaces);
  for (const line of workspaceLines(workspaces)) out.say(line);
};

/** `--workspace <name>` for `rmk search`: one, or none. */
export const oneWorkspace = (value: string | boolean | string[] | undefined) => {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  if (values.length > 1) throw usage("Search one workspace at a time: --workspace <name>.");
  const [name] = values;
  if (name !== undefined && name.trim() === "")
    throw usage("Say which workspace: --workspace <name>.");
  return name?.trim();
};
