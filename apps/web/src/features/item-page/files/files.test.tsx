import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ContentFile } from "@/server/domains/items/models/contents";
import { FileContent } from "./FileContent";
import { FilesBrowser } from "./FilesBrowser";
import { renderMarkdownFile, selectedFile, showFiles, splitFrontmatter } from "./shown";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/items/team/reviewer",
  useSearchParams: () => new URLSearchParams("tab=files"),
}));

const textFile = (path: string, text: string, executable = false): ContentFile => ({
  path,
  size: new TextEncoder().encode(text).length,
  executable,
  kind: "text",
  text,
});

const SKILL =
  "---\nname: secure-coding\ndescription: Checks code.\n---\n# Secure coding\n\nCheck <b>input</b>.\n";

describe("frontmatter", () => {
  it("splits SKILL.md's frontmatter from its body, with CRLF lines too", () => {
    expect(splitFrontmatter(SKILL)).toEqual({
      yaml: "name: secure-coding\ndescription: Checks code.\n",
      body: "# Secure coding\n\nCheck <b>input</b>.\n",
    });
    expect(splitFrontmatter("---\r\na: 1\r\n---\r\nbody")).toEqual({
      yaml: "a: 1\r\n",
      body: "body",
    });
    expect(splitFrontmatter("# No frontmatter\n---\n")).toBeNull();
    expect(splitFrontmatter("---\nnever closed\n")).toBeNull();
  });

  it("renders the body safely, with the frontmatter as rows, and none when it isn't a map", () => {
    const rendered = renderMarkdownFile(SKILL);
    expect(rendered.frontmatter).toEqual([
      ["name", "secure-coding"],
      ["description", "Checks code."],
    ]);
    expect(rendered.html).toContain("<h2>Secure coding</h2>");
    expect(rendered.html).not.toContain("<b>");
    // Each line break is kept: prompts and rules are written one instruction a line.
    expect(renderMarkdownFile("Be brief.\nCite files.\n").html).toBe(
      "<p>Be brief.<br>Cite files.</p>\n",
    );
    expect(renderMarkdownFile("---\n: : [\n---\nText").frontmatter).toBeNull();
    expect(renderMarkdownFile("---\n- a list\n---\nText")).toEqual({
      frontmatter: null,
      html: "<p>Text</p>\n",
    });
  });
});

describe("the selected file", () => {
  const files = [{ path: "SKILL.md" }, { path: "ronne.yaml" }, { path: "scripts/check.sh" }];
  it("is ?file= when the version has it, else the body file, else ronne.yaml", () => {
    expect(selectedFile(files, "scripts/check.sh", "SKILL.md")).toBe("scripts/check.sh");
    expect(selectedFile(files, "../etc/passwd", "SKILL.md")).toBe("SKILL.md");
    expect(selectedFile(files, undefined, "prompt.md")).toBe("ronne.yaml");
    expect(selectedFile(files, undefined, null)).toBe("ronne.yaml");
  });
});

describe("a file's contents", () => {
  it("renders Markdown with its frontmatter, and keeps the exact source a tab away", () => {
    const [file] = showFiles([textFile("SKILL.md", SKILL)]);
    const html = renderToStaticMarkup(file ? <FileContent file={file} /> : null);
    expect(html).toContain(">SKILL.md</h3>");
    expect(html).toContain('aria-label="Frontmatter"');
    expect(html).toContain(">secure-coding</dd>");
    expect(html).toContain("<h2>Secure coding</h2>");
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Rendered</);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>Source</);
    // The source, as written, until the editor loads.
    expect(html).toContain("name: secure-coding\ndescription: Checks code.");
    expect(html).toContain("Check &lt;b&gt;input&lt;/b&gt;.");
  });

  it("shows other text as written, with its size and whether it's executable", () => {
    const html = renderToStaticMarkup(
      <FileContent file={textFile("run.sh", "#!/bin/sh\necho hi\n", true)} />,
    );
    expect(html).toContain("#!/bin/sh\necho hi");
    expect(html).toContain(">executable<");
    expect(html).toContain(">1 KB<");
    expect(html).not.toContain('role="tab"');
  });

  it("says why binary, very large and empty files aren't shown", () => {
    const shown = (file: ContentFile) => renderToStaticMarkup(<FileContent file={file} />);
    expect(shown({ path: "logo.png", size: 7, executable: false, kind: "binary" })).toContain(
      "A binary file, not shown here.",
    );
    expect(
      shown({ path: "big.txt", size: 600 * 1024, executable: false, kind: "large" }),
    ).toContain("Too large to show here (600 KB).");
    expect(shown(textFile("empty.md", "  \n"))).toContain("This file is empty.");
  });
});

describe("the Files tab", () => {
  it("lists every file as a tree and shows the selected one", () => {
    const files = showFiles([
      textFile("SKILL.md", SKILL),
      textFile("ronne.yaml", 'name: "@team/secure-coding"\n'),
      textFile("scripts/check.sh", "echo check\n", true),
    ]);
    const html = renderToStaticMarkup(<FilesBrowser files={files} selected="scripts/check.sh" />);
    expect(html).toContain('aria-label="Files of this version"');
    expect(html).toContain("scripts/");
    expect(html).toMatch(/aria-current="true"[^>]*>.*check\.sh/);
    expect(html).toContain(">scripts/check.sh</h3>");
    expect(html).toContain("echo check");
    expect(html).not.toContain(">SKILL.md</h3>");
  });
});
