/**
 * The text of rendered markup, for comparing what a component says: the tags dropped, then any
 * `<` left over from a broken one, so no tag can survive (CodeQL's incomplete multi-character
 * sanitization; docs/knowledge/codeql-tag-stripping.md).
 */
export const textOf = (html: string): string => html.replace(/<[^>]*>/g, "").replace(/</g, "");
