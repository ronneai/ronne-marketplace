import type { ContentFile } from "@/server/domains/items/models/contents";

/** A Markdown file's rendered view: its frontmatter as rows, or null, and its body as HTML. */
export type RenderedMarkdown = { frontmatter: [string, string][] | null; html: string };

/**
 * A released file as the item page shows it (044): its contents, and for Markdown the view the
 * server rendered, so the renderer never ships to the browser.
 */
export type ShownFile = ContentFile & { markdown?: RenderedMarkdown };
