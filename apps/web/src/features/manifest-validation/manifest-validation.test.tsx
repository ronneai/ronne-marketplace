import { parseManifest } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueList } from "@/components/validation/IssueList";
import { ManifestCheckDemo } from "./ManifestCheckDemo";

describe("IssueList", () => {
  it("lists errors before warnings, with the file and line", () => {
    const html = renderToStaticMarkup(
      <IssueList
        issues={[
          {
            severity: "warning",
            code: "secret_literal",
            message: "Could be a secret.",
            path: "/mcp-server/args/0",
            line: 7,
          },
          {
            severity: "error",
            code: "file_missing",
            message: "prompt.md is missing.",
            file: "prompt.md",
          },
        ]}
      />,
    );
    expect(html.indexOf("ERR:")).toBeLessThan(html.indexOf("WARN:"));
    expect(html).toContain("ronne.yaml:7");
    expect(html).toContain(">prompt.md<");
  });

  it("shows backticked names as code", () => {
    const html = renderToStaticMarkup(
      <IssueList
        issues={[{ severity: "error", code: "schema", message: "`type` is required." }]}
      />,
    );
    expect(html).toContain('<code class="font-mono text-[0.85em]">type</code> is required.');
    expect(html).not.toContain("`");
  });

  it("says when there's nothing to fix", () => {
    expect(renderToStaticMarkup(<IssueList issues={[]} />)).toContain("No problems found.");
  });
});

describe("ManifestCheckDemo", () => {
  it("validates with @ronneai/core in the component, showing the sample's problems", () => {
    const html = renderToStaticMarkup(<ManifestCheckDemo />);
    expect(html).toContain("agent.model</code> must be one of: default, fast, strong.");
    expect(html).toContain("colour</code> isn&#x27;t a field ronne.yaml knows.");
  });

  it("uses the same function the server does", () => {
    expect(
      parseManifest('name: "@a/b"\n')
        .issues.map((i) => i.message)
        .sort(),
    ).toEqual(["`description` is required.", "`type` is required."]);
  });
});
