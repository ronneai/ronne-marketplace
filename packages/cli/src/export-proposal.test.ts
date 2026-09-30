import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type PackageFile, parseManifest } from "@ronneai/core";
import { packItem } from "@ronneai/core/pack";
import { claudeCodeRenderer, codexRenderer } from "@ronneai/core/render";
import { stringify as stringifyToml } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "./api.js";
import { diskHash, writeState } from "./apply.js";
import { discoverLocalItems } from "./export.js";
import { editedPlaces, readChange, withoutMarkers } from "./export-proposal.js";
import { places } from "./install.js";
import { type FakeIo, fakeIo, REGISTRY, type Route } from "./testing.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const text = (files: readonly PackageFile[], path: string) =>
  decoder.decode(files.find((f) => f.path === path)?.bytes);

const AGENT = {
  name: "@team/reviewer",
  version: "1.2.0",
  files: [
    {
      path: "ronne.yaml",
      text: 'name: "@team/reviewer"\ntype: agent\ndescription: Reviews diffs.\nlicense: MIT\nkeywords: [review]\nagent:\n  prompt: prompt.md\n  tools: [read, grep]\n  model: strong\n',
    },
    { path: "prompt.md", text: "Review the diff.\n" },
  ],
};
const SERVER = {
  name: "@team/jira",
  version: "1.0.0",
  files: [
    {
      path: "ronne.yaml",
      text: 'name: "@team/jira"\ntype: mcp-server\ndescription: Jira.\nmcp-server:\n  transport: stdio\n  command: jira-mcp\n  env:\n    - name: JIRA_TOKEN\n      description: A Jira API token.\n      required: true\n      secret: true\n',
    },
  ],
};
type Published = typeof AGENT;

/** A registry that serves each item's version detail and artifact. */
const registry = async (items: Published[]) => {
  const routes: Record<string, Route> = {};
  const packed: Record<string, Awaited<ReturnType<typeof packItem>>> = {};
  for (const item of items) {
    const tgz = await packItem(
      item.files.map((f) => ({ path: f.path, bytes: encoder.encode(f.text) })),
      { version: item.version },
    );
    packed[item.name] = tgz;
    const path = `/items/${item.name.slice(1)}/${item.version}`;
    routes[`GET ${path}`] = () => ({ json: { version: item.version, sha256: tgz.sha256 } });
    routes[`GET ${path}/tarball`] = () => ({
      bytes: tgz.tgz,
      headers: { "x-checksum-sha256": tgz.sha256 },
    });
  }
  return { routes, packed };
};

const write = (path: string, content: string | Uint8Array) => {
  mkdirSync(dirname(join(io.cwd, path)), { recursive: true });
  writeFileSync(join(io.cwd, path), content);
};

/** Installs an item as rmk would: its render for a tool on disk, recorded in the state. */
const install = async (item: Published, renderer: typeof claudeCodeRenderer, targets: string[]) => {
  const files = item.files.map((f) => ({ path: f.path, bytes: encoder.encode(f.text) }));
  const manifest = {
    ...parseManifest(item.files[0]?.text ?? "").manifest,
    version: item.version,
  };
  const { changes } = renderer.render(
    { name: item.name, version: item.version, manifest, files },
    { scope: "project" },
  );
  const entries = [];
  for (const change of changes) {
    if (change.kind === "file") write(change.path, change.content);
    else if (change.kind === "toml-key") {
      write(
        change.path,
        stringifyToml({ [change.key[0] ?? ""]: { [change.key[1] ?? ""]: change.value } }),
      );
    } else if (change.kind === "json-key") {
      write(
        change.path,
        JSON.stringify({ [change.key[0] ?? ""]: { [change.key[1] ?? ""]: change.value } }),
      );
    } else continue;
    const entry = {
      item: item.name,
      version: item.version,
      targets,
      kind: change.kind,
      path: change.path,
      ...("key" in change ? { key: change.key } : {}),
    };
    entries.push({ ...entry, sha256: (await diskHash(io.cwd, entry)) ?? "" });
  }
  writeState(places(io, "project").state, { version: 1, entries });
};

const placeOf = (name: string) => {
  const found = discoverLocalItems(io, "project").find((i) => i.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};

describe("withoutMarkers", () => {
  it("drops rmk's marker lines, and the blank line after an HTML one", () => {
    expect(withoutMarkers("---\na: 1\n---\n<!-- managed by rmk: @t/a@1.0.0 -->\n\nBody.\n")).toBe(
      "---\na: 1\n---\nBody.\n",
    );
    expect(withoutMarkers('# managed by rmk: @t/a@1.0.0\nname = "a"\n')).toBe('name = "a"\n');
    expect(withoutMarkers("Plain.\n")).toBe("Plain.\n");
  });
});

describe("readChange", () => {
  it("reads an edited Claude Code agent as a change to its base, keeping what the render lost", async () => {
    const { routes } = await registry([AGENT]);
    io = fakeIo(routes);
    await install(AGENT, claudeCodeRenderer, ["claude-code"]);
    const path = ".claude/agents/reviewer.md";
    write(
      path,
      readFileSync(join(io.cwd, path), "utf8").replace(
        "Review the diff.",
        "Review the diff; say why.",
      ),
    );
    const api = apiClient(io.fetch, REGISTRY, "t");
    const change = await readChange(io, api, placeOf("reviewer"), {
      item: AGENT.name,
      version: AGENT.version,
    });
    expect(change.merged.changes).toMatchObject({ changed: ["prompt.md"], fields: [] });
    expect(change.merged.manifest).toMatchObject({
      license: "MIT",
      keywords: ["review"],
      agent: { model: "strong" },
    });
    expect(text(change.merged.files, "prompt.md")).toBe("Review the diff; say why.\n");
    expect(change.merged.manifestText).not.toContain("version");
  });

  it("reads an edited Codex server's TOML key", async () => {
    const { routes } = await registry([SERVER]);
    io = fakeIo(routes);
    await install(SERVER, codexRenderer as typeof claudeCodeRenderer, ["codex"]);
    const toml = readFileSync(join(io.cwd, ".codex/config.toml"), "utf8");
    write(
      ".codex/config.toml",
      toml.replace('command = "jira-mcp"', 'command = "jira-mcp"\nargs = [ "--cloud" ]'),
    );
    const api = apiClient(io.fetch, REGISTRY, "t");
    const change = await readChange(io, api, placeOf("jira"), {
      item: SERVER.name,
      version: SERVER.version,
    });
    expect(change.merged.changes.fields.map((f) => f.field)).toEqual(["mcp-server.args"]);
    expect(change.merged.manifest["mcp-server"]).toMatchObject({
      args: ["--cloud"],
      env: [{ name: "JIRA_TOKEN", description: "A Jira API token." }],
    });
  });

  it("says unchanged when nothing the item carries was edited", async () => {
    const { routes } = await registry([AGENT]);
    io = fakeIo(routes);
    await install(AGENT, claudeCodeRenderer, ["claude-code"]);
    const api = apiClient(io.fetch, REGISTRY, "t");
    const change = await readChange(io, api, placeOf("reviewer"), {
      item: AGENT.name,
      version: AGENT.version,
    });
    expect(change.merged.unchanged).toBe(true);
  });

  it("refuses a base the registry doesn't have, and a type rmk wrote as another", async () => {
    io = fakeIo({});
    write(".claude/agents/reviewer.md", "---\nname: reviewer\ndescription: R.\n---\nR.\n");
    const api = apiClient(io.fetch, REGISTRY, "t");
    await expect(
      readChange(io, api, placeOf("reviewer"), { item: "@team/gone", version: "1.0.0" }),
    ).rejects.toMatchObject({ code: "base_not_found" });
    const { routes } = await registry([SERVER]);
    const typed = fakeIo(routes);
    try {
      mkdirSync(join(typed.cwd, ".claude/agents"), { recursive: true });
      writeFileSync(
        join(typed.cwd, ".claude/agents/jira.md"),
        "---\nname: jira\ndescription: J.\n---\nJ.\n",
      );
      const item = discoverLocalItems(typed, "project").find((i) => i.name === "jira");
      await expect(
        readChange(typed, apiClient(typed.fetch, REGISTRY, "t"), item as NonNullable<typeof item>, {
          item: SERVER.name,
          version: SERVER.version,
        }),
      ).rejects.toMatchObject({ code: "type_mismatch" });
    } finally {
      typed.cleanup();
    }
  });
});

describe("editedPlaces", () => {
  it("names each place an installed item was edited, for each tool", async () => {
    const { routes } = await registry([AGENT]);
    io = fakeIo(routes);
    await install(AGENT, claudeCodeRenderer, ["claude-code"]);
    expect(await editedPlaces(io, "project", AGENT.name)).toEqual([]);
    const path = ".claude/agents/reviewer.md";
    write(path, `${readFileSync(join(io.cwd, path), "utf8")}More.\n`);
    expect(await editedPlaces(io, "project", AGENT.name)).toEqual([
      { path, targets: ["claude-code"] },
    ]);
  });
});
