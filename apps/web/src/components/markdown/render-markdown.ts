import { Marked, type Tokens } from "marked";

/**
 * Renders an item's README (feature 018) to HTML on the server, safely: raw HTML in the Markdown is
 * shown as text, never passed through; links only go to http(s), mailto or an anchor on the page,
 * and open without handing the page to the target; images load only from https. Headings move down
 * one level, so the page keeps its own `h1`.
 */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Browsers ignore tabs, newlines and leading control characters in URLs, so `java\tscript:` is
// `javascript:`; strip them the same way before checking the scheme.
const normalised = (href: string) =>
  [...href]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x20 && code !== 0x7f;
    })
    .join("")
    .toLowerCase();

const safeLink = (href: string) => {
  const url = normalised(href);
  return url.startsWith("#") || /^(https?:|mailto:)/.test(url);
};

const safeImage = (href: string) => normalised(href).startsWith("https:");

const markdown = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    heading({ tokens, depth }: Tokens.Heading) {
      const level = Math.min(depth + 1, 6);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      if (!safeLink(href)) return text;
      const external = !href.startsWith("#");
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}${
        external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""
      }>${text}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      if (!safeImage(href)) return escapeHtml(text);
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${
        title ? ` title="${escapeHtml(title)}"` : ""
      } loading="lazy" referrerpolicy="no-referrer">`;
    },
  },
});

/**
 * `breaks` keeps each line break, as GitHub does in comments: an item's own files (044), such as a
 * prompt or a rule, are often written one instruction a line. A README joins lines into paragraphs.
 */
export const renderMarkdown = (source: string, options: { breaks?: boolean } = {}): string =>
  markdown.parse(source, { async: false, breaks: options.breaks ?? false }) as string;
