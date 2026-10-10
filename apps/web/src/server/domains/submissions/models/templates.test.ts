import { ITEM_TYPES } from "@ronneai/core";
import { describe, expect, it } from "vitest";
import { validateDraft } from "./submission";
import { draftTemplate } from "./templates";

const files = (type: (typeof ITEM_TYPES)[number]) =>
  draftTemplate(type, "@platform/starter").map((file) => ({
    path: file.path,
    encoding: "utf8" as const,
    content: file.content,
    executable: file.executable ?? false,
  }));

const draft = (type: (typeof ITEM_TYPES)[number]) => ({
  workspace: { name: "global" },
  scope: { name: "platform" },
  name: "starter",
  type,
});

describe("draftTemplate", () => {
  it.each(ITEM_TYPES)("%s passes 011's checks except for the empty description", (type) => {
    const issues = validateDraft(draft(type), files(type));
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues)
      expect(
        issue.path === "/description" ||
          issue.message === "SKILL.md's frontmatter needs a description." ||
          // A bundle starts empty and needs its first item (096).
          (type === "bundle" && issue.code === "bundle_empty"),
        `${type}: ${issue.message}`,
      ).toBe(true);
  });

  it.each(ITEM_TYPES)("%s passes completely once the description is written", (type) => {
    const written = files(type).map((file) => ({
      ...file,
      content: file.content
        .replace('description: ""', "description: A starter.")
        // A bundle also needs its first item (096).
        .replace("dependencies: {}", 'dependencies:\n  "@team/one": "^1.0.0"'),
    }));
    expect(validateDraft(draft(type), written)).toEqual([]);
  });

  it("marks scripts executable, and names the skill after the item", () => {
    expect(files("hook").find((f) => f.path === "hook.sh")?.executable).toBe(true);
    expect(files("statusline").find((f) => f.path === "statusline.sh")?.executable).toBe(true);
    expect(files("skill").find((f) => f.path === "SKILL.md")?.content).toContain("name: starter\n");
  });
});

describe("startingFiles", () => {
  it("is ronne.yaml and the file the type's template names", async () => {
    const { startingFiles } = await import("./templates");
    expect(startingFiles("skill")).toEqual(["ronne.yaml", "SKILL.md"]);
    expect(startingFiles("agent")).toEqual(["ronne.yaml", "prompt.md"]);
    expect(startingFiles("hook")).toEqual(["ronne.yaml", "hook.sh"]);
    expect(startingFiles("mcp-server")).toEqual(["ronne.yaml"]);
  });
});

describe("a name that isn't a type", () => {
  // What a bad row in the database would hand them: nothing, rather than an inherited method.
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "nope"])(
    "%s has no files",
    async (name) => {
      const { startingFiles } = await import("./templates");
      const type = name as (typeof ITEM_TYPES)[number];
      expect(startingFiles(type)).toEqual([]);
      expect(draftTemplate(type, "@platform/starter")).toEqual([]);
    },
  );
});
