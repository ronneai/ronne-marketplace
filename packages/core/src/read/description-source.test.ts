import { describe, expect, it } from "vitest";
import type { PackageFile } from "../package-file.js";
import {
  readAgent,
  readCodexAgent,
  readCommand,
  readCursorAgent,
  readCursorCommand,
  readCursorRule,
  readMcpServer,
  readRule,
  readSkill,
} from "./index.js";

const file = (path: string, content: string): PackageFile => ({
  path,
  bytes: new TextEncoder().encode(content),
});
const itemName = "@team/x";
const described = "---\ndescription: Does a thing.\n---\n# Heading\n\nBody.\n";
const undescribed = "---\nname: x\n---\n# Heading\n\nBody.\n";
const empty = "---\nname: x\n---\n";

describe("descriptionSource (053)", () => {
  it("says a skill's description is its own, its body's first line, or missing", () => {
    const skill = (text: string) =>
      readSkill([file("SKILL.md", text)], { itemName }).descriptionSource;
    expect([skill(described), skill(undescribed), skill(empty)]).toEqual(["item", "body", "none"]);
  });

  it("says the same for Claude Code's agents and commands", () => {
    const agent = (text: string) => readAgent(file("x.md", text), { itemName }).descriptionSource;
    const command = (text: string) =>
      readCommand(file("x.md", text), { itemName }).descriptionSource;
    expect([agent(described), agent(undescribed)]).toEqual(["item", "none"]);
    expect([command(described), command(undescribed), command(empty)]).toEqual([
      "item",
      "body",
      "none",
    ]);
  });

  it("says a Claude Code rule's is always its first line, and a Cursor rule's only without one", () => {
    expect(readRule(file("x.md", "Use tabs.\n"), { itemName }).descriptionSource).toBe("body");
    expect(readRule(file("x.md", ""), { itemName }).descriptionSource).toBe("none");
    const cursor = (text: string) =>
      readCursorRule(file("x.mdc", text), { itemName }).descriptionSource;
    expect([cursor(described), cursor(undescribed), cursor(empty)]).toEqual([
      "item",
      "body",
      "none",
    ]);
  });

  it("says the same for Cursor's agents and commands, and Codex's agents", () => {
    expect(readCursorAgent(file("x.md", described), { itemName }).descriptionSource).toBe("item");
    expect(readCursorAgent(file("x.md", undescribed), { itemName }).descriptionSource).toBe("none");
    expect(readCursorCommand(file("x.md", undescribed), { itemName }).descriptionSource).toBe(
      "body",
    );
    const codex = (config: Record<string, unknown>) =>
      readCodexAgent(config, { itemName, fileName: "x.toml" }).descriptionSource;
    expect([
      codex({ name: "x", description: "Does a thing.", developer_instructions: "Do." }),
      codex({ name: "x", developer_instructions: "Do." }),
    ]).toEqual(["item", "none"]);
  });

  it("says an MCP server's is given, or missing", () => {
    const server = { command: "npx", args: ["-y", "x"] };
    expect(
      readMcpServer("x", server, { itemName, description: "Reads x." }).descriptionSource,
    ).toBe("given");
    expect(readMcpServer("x", server, { itemName }).descriptionSource).toBe("none");
  });
});
