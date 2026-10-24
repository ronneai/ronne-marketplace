/**
 * The text of rendered markup, for comparing what a component says. It splits on `<` and keeps
 * what follows each tag's `>`, so no `<` survives; a regex replace, even two, is flagged by
 * CodeQL's incomplete multi-character sanitization (docs/knowledge/codeql-tag-stripping.md).
 */
export const textOf = (html: string): string => {
  const [head = "", ...rest] = html.split("<");
  return (
    head +
    rest
      .map((part) => {
        const end = part.indexOf(">");
        return end === -1 ? "" : part.slice(end + 1);
      })
      .join("")
  );
};
