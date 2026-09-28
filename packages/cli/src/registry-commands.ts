import { ITEM_TYPES, parseItemName } from "@ronneai/core";
import { RENDERERS } from "@ronneai/core/render";
import type { Args, Command } from "./cli.js";
import { RmkError, usage } from "./errors.js";
import type { Io } from "./io.js";
import { readLockfile, readProjectConfig, splitItemRef } from "./project.js";

/** Reading the registry and the project (feature 022): `search`, `info`, `list`, `platforms`. */

type Summary = {
  name: string;
  type: string;
  description: string;
  version: string;
  publishedAt: string;
  deprecated: string | null;
  installable: boolean;
  risky: boolean;
  downloads: number;
};

type ItemInfo = {
  name: string;
  type: string;
  description: string;
  owner: string | null;
  downloads: number;
  tags: Record<string, string>;
  versions: {
    version: string;
    publishedAt: string;
    sha256: string;
    size: number;
    deprecated: string | null;
    yanked: boolean;
    dependencies: Record<string, string>;
  }[];
};

type VersionInfo = ItemInfo["versions"][number] & {
  readme: string | null;
  riskFlags: { kind: string; message: string }[];
  notes: string | null;
};

const str = (value: string | boolean | undefined) =>
  typeof value === "string" ? value : undefined;
const marks = (row: {
  deprecated?: string | null;
  yanked?: boolean;
  risky?: boolean;
  installable?: boolean;
}) =>
  [
    row.yanked ? "yanked" : "",
    row.deprecated ? "deprecated" : "",
    row.risky ? "risk" : "",
    row.installable === false ? "no installable version" : "",
  ]
    .filter(Boolean)
    .map((m) => `[${m}]`)
    .join(" ");

/** `@scope/name` as the API's path, without the `@`. */
export const itemPath = (name: string) => {
  const parsed = parseItemName(name);
  if (!parsed) throw usage(`${name} isn't an item name; use @scope/name.`);
  return `/items/${encodeURIComponent(parsed.scope)}/${encodeURIComponent(parsed.name)}`;
};

export const withApi = (
  connect: (io: Io, args: Args) => { api: { get<T>(path: string): Promise<T> } },
) => {
  const search: Command = async (io, args, out) => {
    const [query] = args.positionals;
    if (!query) throw usage("Say what to search for: rmk search <query>");
    const params = new URLSearchParams({ q: query });
    const type = str(args.values.type);
    if (type) params.set("type", type);
    const scope = str(args.values.scope);
    if (scope) params.set("scope", scope.replace(/^@/, ""));
    const page = await connect(io, args).api.get<{ items: Summary[]; nextCursor: string | null }>(
      `/items?${params}`,
    );
    out.set("items", page.items);
    if (page.items.length === 0) out.say(`Nothing matches "${query}".`);
    for (const item of page.items)
      out.say(
        `${item.name}@${item.version}  ${item.type}  ${item.description}${marks(item) ? `  ${marks(item)}` : ""}`,
      );
  };

  const info: Command = async (io, args, out) => {
    const [ref] = args.positionals;
    if (!ref) throw usage("Say which item: rmk info @scope/name[@version]");
    const { name, at } = splitItemRef(ref);
    const { api } = connect(io, args);
    const item = await api.get<ItemInfo>(itemPath(name));
    const version = at ? item.tags[at] || at : item.tags.latest;
    const detail = version
      ? await api.get<VersionInfo>(`${itemPath(name)}/${encodeURIComponent(version)}`)
      : null;
    out.set("item", item);
    if (detail) out.set("version", detail);
    out.say(`${item.name}  ${item.type}  ${item.description}`);
    out.say(`owner: ${item.owner ?? "a former user"}  downloads: ${item.downloads}`);
    out.say(
      `tags: ${
        Object.entries(item.tags)
          .map(([tag, v]) => `${tag} → ${v}`)
          .join(", ") || "none"
      }`,
    );
    out.say("versions:");
    for (const v of item.versions)
      out.say(`  ${v.version}  ${v.publishedAt.slice(0, 10)}${marks(v) ? `  ${marks(v)}` : ""}`);
    if (detail) {
      const dependencies = Object.entries(detail.dependencies);
      out.say(
        `${detail.version}: ${dependencies.length ? dependencies.map(([n, r]) => `${n} ${r}`).join(", ") : "no dependencies"}`,
      );
      if (detail.deprecated) out.say(`deprecated: ${detail.deprecated}`);
      for (const flag of detail.riskFlags) out.say(`what it can do: ${flag.message}`);
    }
  };

  return { search, info };
};

export const list: Command = async (io, args, out) => {
  if (args.values.installed) {
    const lock = readLockfile(io.cwd);
    const items = lock ? Object.entries(lock.items) : [];
    out.set(
      "installed",
      Object.fromEntries(
        items.map(([name, item]) => [name, { version: item.version, type: item.type }]),
      ),
    );
    if (items.length === 0) out.say("Nothing is installed here: there's no rmk.lock.");
    for (const [name, item] of items) out.say(`${name}@${item.version}  ${item.type}`);
    return;
  }
  const config = readProjectConfig(io.cwd);
  const dependencies = Object.entries(config?.dependencies ?? {});
  out.set("dependencies", Object.fromEntries(dependencies));
  if (dependencies.length === 0)
    out.say("This project asks for nothing yet: rmk install @scope/name adds an item.");
  for (const [name, range] of dependencies) out.say(`${name}  ${range}`);
};

export const platforms: Command = async (_io, _args, out) => {
  out.set(
    "platforms",
    RENDERERS.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      supports: Object.fromEntries(ITEM_TYPES.map((type) => [type, r.supports(type)])),
    })),
  );
  for (const r of RENDERERS) {
    out.say(`${r.id}  ${r.name}  (renderer ${r.version})`);
    for (const level of ["native", "degraded", "none"] as const) {
      const types = ITEM_TYPES.filter((type) => r.supports(type) === level);
      if (types.length) out.say(`  ${level}: ${types.join(", ")}`);
    }
  }
  if (RENDERERS.length === 0) throw new RmkError("No renderers are built in.", 1, "no_renderers");
};
