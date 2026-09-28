import { renderMarkdown } from "./render-markdown";

/**
 * Markdown from an item, such as its README (feature 018), rendered on the server by
 * `renderMarkdown`, which never lets the item's own HTML through. Styled by `.markdown` in
 * globals.css with the design system's tokens.
 */
export const Markdown = ({ source }: { source: string }) => (
  // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes raw HTML and filters URLs.
  <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />
);
