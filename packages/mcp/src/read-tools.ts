import {
  connectRegistry,
  fetchWorkspaces,
  type Io,
  isBehind,
  itemPath,
  outdatedItems,
  projectState,
  setScopeFilter,
  workspaceLines,
} from "@ronneai/rmk/lib";
import { answer, marks, type ToolAnswer } from "./text.js";

/** The read tools (MVP §7): the registry as `rmk search` and `rmk info` see it, and the project. */
/** An item's workspace (095); missing from a registry older than workspaces. */
type ItemWorkspace = { name: string; visibility: string };

type Summary = {
  name: string;
  workspace?: ItemWorkspace;
  type: string;
  description: string;
  version: string;
  deprecated: string | null;
  installable: boolean;
  risky: boolean;
  support?: Record<string, string>;
};

type ItemInfo = {
  name: string;
  workspace?: ItemWorkspace;
  type: string;
  description: string;
  owner: string | null;
  downloads: number;
  tags: Record<string, string>;
  versions: { version: string; publishedAt: string; deprecated: string | null; yanked: boolean }[];
};

type VersionInfo = {
  version: string;
  dependencies: Record<string, string>;
  deprecated: string | null;
  readme: string | null;
  riskFlags: { kind: string; message: string }[];
  support?: Record<string, string>;
};

export const searchItems = async (
  io: Io,
  input: {
    query: string;
    type?: string;
    scope?: string;
    workspace?: string;
    tool?: string;
    limit?: number;
  },
): Promise<ToolAnswer> => {
  const { api } = connectRegistry(io);
  const params = new URLSearchParams({ q: input.query });
  if (input.type) params.set("type", input.type);
  if (input.workspace?.trim()) params.set("workspace", input.workspace.trim());
  if (input.scope) setScopeFilter(params, input.scope);
  if (input.tool) params.set("tool", input.tool);
  if (input.limit) params.set("limit", String(input.limit));
  const page = await api.get<{ items: Summary[]; nextCursor: string | null }>(`/items?${params}`);
  const lines = page.items.length
    ? page.items.map(
        (i) =>
          `${i.name}@${i.version}  ${i.type}  ${i.description}${marks(i) ? `  ${marks(i)}` : ""}`,
      )
    : [`Nothing matches "${input.query}".`];
  return answer(lines, { items: page.items, nextCursor: page.nextCursor });
};

export const getItem = async (
  io: Io,
  input: { name: string; version?: string },
): Promise<ToolAnswer> => {
  const { api } = connectRegistry(io);
  const item = await api.get<ItemInfo>(itemPath(input.name));
  const version = input.version ? (item.tags[input.version] ?? input.version) : item.tags.latest;
  const detail = version
    ? await api.get<VersionInfo>(`${itemPath(input.name)}/${encodeURIComponent(version)}`)
    : null;
  const lines = [
    `${item.name}  ${item.type}  ${item.description}`,
    ...(item.workspace
      ? [
          `workspace: ${item.workspace.name}${item.workspace.visibility === "private" ? " (private)" : ""}`,
        ]
      : []),
    `owner: ${item.owner ?? "a former user"}  downloads: ${item.downloads}`,
    `tags: ${
      Object.entries(item.tags)
        .map(([tag, v]) => `${tag} → ${v}`)
        .join(", ") || "none"
    }`,
    "versions:",
    ...item.versions.map(
      (v) => `  ${v.version}  ${v.publishedAt.slice(0, 10)}${marks(v) ? `  ${marks(v)}` : ""}`,
    ),
  ];
  if (detail) {
    const dependencies = Object.entries(detail.dependencies);
    lines.push(
      `${detail.version}: ${dependencies.length ? dependencies.map(([n, r]) => `${n} ${r}`).join(", ") : "no dependencies"}`,
    );
    if (detail.deprecated) lines.push(`deprecated: ${detail.deprecated}`);
    if (detail.support)
      lines.push(
        `works in: ${Object.entries(detail.support)
          .map(([tool, level]) => `${tool} ${level}`)
          .join(", ")}`,
      );
    for (const flag of detail.riskFlags) lines.push(`what it can do: ${flag.message}`);
    if (detail.readme) lines.push("", "README:", detail.readme);
  }
  return answer(lines, { item, version: detail });
};

/** The workspaces the person sees (095), with their role and where to ask to join: `rmk workspaces`. */
export const listWorkspaces = async (io: Io): Promise<ToolAnswer> => {
  const { api } = connectRegistry(io);
  const workspaces = await fetchWorkspaces(api);
  return answer(workspaceLines(workspaces), { workspaces });
};

/** What the lockfile holds: no network, so it works when the registry can't be reached. */
export const listInstalled = (io: Io, input: { scope?: string }): ToolAnswer => {
  const { lockfile, dependencies } = projectState(io, input.scope);
  const items = Object.entries(lockfile?.items ?? {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, item]) => ({
      name,
      version: item.version,
      type: item.type,
      direct: name in dependencies,
    }));
  const lines = items.length
    ? items.map((i) => `${i.name}@${i.version}  ${i.type}${i.direct ? "" : "  (a dependency)"}`)
    : ["Nothing is installed here yet."];
  return answer(lines, { items });
};

export const checkOutdated = async (io: Io, input: { scope?: string }): Promise<ToolAnswer> => {
  const { api } = connectRegistry(io);
  const rows = await outdatedItems(io, api, input.scope);
  const lines = rows.some(isBehind)
    ? [
        "item  range  locked  wanted  latest",
        ...rows.map(
          (r) =>
            `${r.item}  ${r.range}  ${r.locked ?? "-"}  ${r.wanted ?? "-"}  ${r.latest ?? "-"}`,
        ),
        "wanted: the newest version the range allows (plan_update); latest: the newest published.",
      ]
    : ["Everything is up to date."];
  // An old name the project still uses (118): plan_update moves it.
  for (const r of rows)
    if (r.now) lines.push(`Note: ${r.item} is now ${r.now}; plan_update moves the project to it.`);
  return answer(lines, { items: rows });
};
