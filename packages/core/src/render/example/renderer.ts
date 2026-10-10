import { type ItemType, isItemType } from "../../item-types.js";
import {
  disabledWarning,
  envRef,
  managedMarker,
  section,
  targetsFor,
  toolName,
} from "../helpers.js";
import type { Change, PlatformRenderer, RenderInput, RenderWarning } from "../types.js";

/**
 * The reference renderer (feature 021): not a real tool. It writes each item type through a
 * different change kind, so the harness and the helpers are tested before any real renderer
 * exists, and it shows what a renderer looks like.
 */
const TOOLS = {
  names: { read: "Read", edit: "Edit", write: "Write", glob: "Glob", grep: "Grep", shell: "Shell" },
  mcp: (server: string, tool?: string) => (tool ? `mcp:${server}:${tool}` : `mcp:${server}`),
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (files: RenderInput["files"], path: unknown) => {
  const file = typeof path === "string" ? files.find((f) => f.path === path) : undefined;
  return file ? new TextDecoder().decode(file.bytes) : "";
};
const shortName = (name: string) => name.slice(name.lastIndexOf("/") + 1);

export const exampleRenderer: PlatformRenderer = {
  id: "example",
  name: "Example tool",
  version: "1.0.0",
  detect: (probe) => probe.exists(".example"),
  supports: (type) => (type === "bundle" ? "degraded" : "native"),
  render(item, context) {
    const root = context.scope === "project" ? ".example" : "example-home";
    const n = shortName(item.name);
    const marker = managedMarker(item.name, item.version, "html");
    const targets = targetsFor(item.manifest, "example");
    if (!targets.enabled)
      return { changes: [], warnings: [disabledWarning(item.name, "Example tool")] };
    const type = isItemType(String(item.manifest.type)) ? (item.manifest.type as ItemType) : null;
    const block = record(type ? item.manifest[type] : undefined);
    const warnings: RenderWarning[] = [];
    const changes: Change[] = [];
    const settings = `${root}/settings.json`;

    switch (type) {
      case "skill":
        changes.push({
          kind: "dir",
          path: `${root}/skills/${n}`,
          files: item.files.map((f) => ({
            path: f.path,
            content: f.bytes,
            executable: f.executable,
          })),
        });
        break;
      case "agent": {
        const tools: string[] = [];
        for (const tool of Array.isArray(block.tools) ? block.tools : []) {
          const mapped = toolName(String(tool), TOOLS);
          if ("name" in mapped) tools.push(mapped.name);
          else warnings.push(mapped.warning);
        }
        const front = [
          `name: ${n}`,
          `description: ${item.manifest.description}`,
          ...(tools.length ? [`tools: ${tools.join(", ")}`] : []),
        ];
        changes.push({
          kind: "file",
          path: `${root}/agents/${n}.md`,
          content: `---\n${front.join("\n")}\n---\n${marker}\n\n${text(item.files, block.prompt)}`,
        });
        break;
      }
      case "rule":
        changes.push({
          kind: "section",
          path: "AGENTS.md",
          key: item.name,
          text: text(item.files, block.body),
        });
        break;
      case "command":
      case "output-style":
        changes.push({
          kind: "file",
          path: `${root}/${type === "command" ? "commands" : "styles"}/${n}.md`,
          content: `${marker}\n\n${text(item.files, block.body)}`,
        });
        break;
      case "hook": {
        const run = record(block.run);
        changes.push({
          kind: "json-array-item",
          path: settings,
          key: ["hooks", String(block.event)],
          item: {
            item: item.name,
            matcher: record(block.matcher).tool ?? "*",
            command: run.command ?? run.script,
          },
        });
        break;
      }
      case "mcp-server": {
        const env = Object.fromEntries(
          (Array.isArray(block.env) ? block.env : []).map((v) => {
            const name = String(record(v).name);
            return [name, envRef(name, "json-template")];
          }),
        );
        changes.push({
          kind: "json-key",
          path: `${root}/mcp.json`,
          key: ["mcpServers", n],
          value: {
            transport: block.transport,
            command: block.command,
            args: block.args,
            url: block.url,
            env,
          },
        });
        break;
      }
      case "permission-policy":
        for (const rule of Array.isArray(block.rules) ? block.rules : []) {
          const r = record(rule);
          const mapped = toolName(String(r.tool), TOOLS);
          if ("warning" in mapped) {
            warnings.push(mapped.warning);
            continue;
          }
          changes.push({
            kind: "json-array-item",
            path: settings,
            key: ["permissions", String(r.decision)],
            item: r.pattern ? `${mapped.name}(${r.pattern})` : mapped.name,
          });
        }
        break;
      case "statusline": {
        const script = String(block.script);
        changes.push({
          kind: "file",
          path: `${root}/statusline/${n}/${script}`,
          content: text(item.files, script),
          executable: true,
        });
        changes.push({
          kind: "json-key",
          path: settings,
          key: ["statusLine"],
          value: { command: `${root}/statusline/${n}/${script}` },
        });
        break;
      }
      case "lsp-server":
        changes.push({
          kind: "toml-key",
          path: `${root}/config.toml`,
          key: ["lsp", n],
          value: {
            command: block.command,
            args: block.args ?? [],
            languages: block.languages ?? [],
          },
        });
        break;
      case "bundle":
        // Its members are installed as items of their own; the bundle itself writes nothing.
        break;
      default:
        warnings.push({ code: "unsupported_type", message: `${item.name} has an unknown type.` });
    }
    return { changes, warnings };
  },
};
