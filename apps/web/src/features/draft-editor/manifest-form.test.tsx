import { ITEM_TYPES } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { draftTemplate } from "@/server/domains/submissions/models/templates";
import { ManifestForm } from "./ManifestForm";
import { blockFields } from "./manifest-fields";

const render = (text: string, type: (typeof ITEM_TYPES)[number] = "agent", files = ["prompt.md"]) =>
  renderToStaticMarkup(
    <ManifestForm
      text={text}
      type={type}
      itemName="@platform/reviewer"
      files={files}
      onChange={() => {}}
      onShowYaml={() => {}}
    />,
  );

describe("blockFields", () => {
  it("generates each type's fields from the schema", () => {
    const summary = (type: (typeof ITEM_TYPES)[number]) =>
      blockFields(type).map((field) => `${field.key}:${field.kind}${field.required ? "!" : ""}`);
    expect(summary("agent")).toEqual(["prompt:file!", "tools:list", "model:select"]);
    expect(summary("rule")).toEqual(["body:file!", "activation:select!", "globs:list"]);
    expect(summary("hook")).toEqual([
      "event:select!",
      "matcher:group",
      "run:group!",
      "timeout:number",
    ]);
    expect(summary("mcp-server")).toEqual([
      "transport:select!",
      "command:text",
      "args:list",
      "url:text",
      "env:list",
      "headers:map",
    ]);
    expect(summary("bundle")).toEqual([]);
  });
});

describe("ManifestForm", () => {
  it("shows what ronne.yaml says: the description, license, keywords and block fields", () => {
    const html = render(
      '# A comment.\nname: "@platform/reviewer"\ntype: agent\ndescription: Reviews diffs.\nlicense: MIT\nkeywords: [review, git]\nagent:\n  prompt: prompt.md\n  model: strong\n  tools: [read]\n',
    );
    expect(html).toContain(">Reviews diffs.</textarea>");
    expect(html).toContain("14/300");
    expect(html).toMatch(/<option value="MIT" selected="">MIT<\/option>/);
    expect(html).toContain('value="review"');
    expect(html).toContain('value="git"');
    expect(html).toMatch(/<option value="prompt.md" selected="">prompt.md<\/option>/);
    expect(html).toMatch(/<option value="strong" selected="">strong<\/option>/);
    expect(html).toContain('value="read"');
    // An agent may have dependencies; the name and type are read-only.
    expect(html).toContain(">dependencies</legend>");
    expect(html).not.toContain('id="field-name"');
    expect(html).toContain("What goes in ronne.yaml?");
  });

  it("marks a referenced file that doesn't exist", () => {
    const html = render(
      'name: "@platform/reviewer"\ntype: agent\ndescription: x\nagent:\n  prompt: gone.md\n',
    );
    expect(html).toContain("gone.md (missing)");
  });

  it("offers a custom license when it isn't a common one", () => {
    const html = render('name: "@a/b"\ntype: agent\ndescription: x\nlicense: LGPL-3.0-only\n');
    expect(html).toMatch(/<option value="other" selected="">/);
    expect(html).toContain('value="LGPL-3.0-only"');
  });

  it("points to the YAML view while the YAML doesn't parse", () => {
    const html = render("name: [");
    expect(html).toContain("The form needs valid YAML.");
    expect(html).toContain("Open the YAML");
  });

  it.each(ITEM_TYPES)("renders the %s template", (type) => {
    const files = draftTemplate(type, "@platform/reviewer");
    const text = files.find((file) => file.path === "ronne.yaml")?.content ?? "";
    const html = render(
      text,
      type,
      files.map((file) => file.path),
    );
    expect(html).toContain("description");
    for (const field of blockFields(type))
      expect(html, `${type}.${field.key}`).toContain(`>${field.key}</span>`);
  });
});
