import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render-markdown";

describe("renderMarkdown", () => {
  it("renders ordinary Markdown, with headings one level down", () => {
    const html = renderMarkdown(
      "# Title\n\nSome **bold** and `code`.\n\n## Usage\n\n- one\n- two\n\n```sh\nrmk install @team/x\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
    );
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<h3>Usage</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('<code class="language-sh">rmk install @team/x');
    expect(html).toContain("<table>");
    expect(renderMarkdown("###### Six")).toContain("<h6>Six</h6>");
  });

  it("opens safe links in a new tab without the opener, and keeps anchors on the page", () => {
    expect(renderMarkdown("[docs](https://example.com/a?b=1&c=2)")).toBe(
      '<p><a href="https://example.com/a?b=1&#38;c=2" target="_blank" rel="noopener noreferrer nofollow">docs</a></p>\n',
    );
    expect(renderMarkdown("[mail](mailto:a@example.com)")).toContain('href="mailto:a@example.com"');
    expect(renderMarkdown("[up](#usage)")).toBe('<p><a href="#usage">up</a></p>\n');
    expect(renderMarkdown("see https://example.com")).toContain('href="https://example.com"');
  });

  it("shows raw HTML as text: script tags, event attributes, iframes", () => {
    const hostile = [
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      'Inline <b onclick="alert(1)">bold</b> text',
      '<iframe src="https://evil.example"></iframe>',
      "<details open ontoggle=alert(1)>x</details>",
    ];
    for (const source of hostile) {
      const html = renderMarkdown(source);
      expect(html).not.toMatch(/<(script|img|b|iframe|details)[\s>]/i);
      expect(html).toContain("&#60;");
    }
  });

  it("drops dangerous link and image URLs, keeping their text", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "java\tscript:alert(1)",
      " javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "./docs/usage.md",
    ]) {
      const html = renderMarkdown(`[click](${href.replace(/ /g, "%20")}) <${href}>`);
      expect(html).not.toContain("<a ");
      expect(html).toContain("click");
    }
    expect(renderMarkdown("[x](java&#x73;cript:alert(1))")).not.toContain("<a ");
    // Images: https only; anything else shows its alt text.
    expect(renderMarkdown("![logo](https://example.com/l.png)")).toContain(
      '<img src="https://example.com/l.png" alt="logo" loading="lazy" referrerpolicy="no-referrer">',
    );
    for (const src of [
      "http://example.com/l.png",
      "javascript:alert(1)",
      "data:image/png;base64,AA==",
    ])
      expect(renderMarkdown(`![logo](${src})`)).toBe("<p>logo</p>\n");
    expect(renderMarkdown('![a"b](https://example.com/l.png "t\\"x")')).not.toMatch(/alt="a"b/);
  });
});
