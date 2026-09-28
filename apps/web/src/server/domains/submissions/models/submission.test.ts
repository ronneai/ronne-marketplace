import { describe, expect, it } from "vitest";
import { byteSize, fileBytes, isBase64, itemNameOf, validateDraft } from "./submission";

const draft = { scope: { name: "platform" }, name: "reviewer", type: "agent" as const };
const text = (path: string, content: string) => ({
  path,
  encoding: "utf8" as const,
  content,
  executable: false,
});

describe("draft files", () => {
  it("measures and decodes text and base64 the same way the server stores them", () => {
    expect(byteSize({ encoding: "utf8", content: "é🙂" })).toBe(6);
    for (const bytes of [[], [1], [1, 2], [1, 2, 3], [255, 0, 128, 7]]) {
      const content = Buffer.from(bytes).toString("base64");
      expect(byteSize({ encoding: "base64", content })).toBe(bytes.length);
      expect([...fileBytes({ encoding: "base64", content })]).toEqual(bytes);
    }
    expect(isBase64("aGk=")).toBe(true);
    expect(isBase64("not base64")).toBe(false);
    expect(isBase64("aGk")).toBe(false);
    expect(itemNameOf(draft)).toBe("@platform/reviewer");
  });
});

describe("validateDraft", () => {
  it("passes a complete agent", () => {
    expect(
      validateDraft(draft, [
        text(
          "ronne.yaml",
          'name: "@platform/reviewer"\ntype: agent\ndescription: Hi.\nagent:\n  prompt: prompt.md\n',
        ),
        text("prompt.md", "You review code."),
      ]),
    ).toEqual([]);
  });

  it("reports manifest problems on ronne.yaml, and file problems without a manifest", () => {
    expect(validateDraft(draft, [text("ronne.yaml", "name: [")])[0]).toMatchObject({
      code: "yaml_syntax",
      file: "ronne.yaml",
    });
    expect(validateDraft(draft, [text("notes.md", "x")]).map((i) => i.code)).toEqual([
      "manifest_missing",
    ]);
  });
});
