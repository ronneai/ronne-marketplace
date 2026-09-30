import { parseDocument } from "yaml";

/**
 * `ronne.yaml` with `dependencies` set (041), keeping the rest of the text as it is: a hand-written
 * manifest keeps its comments. Nothing changes when there are none.
 */
export const withDependencies = (
  manifestText: string,
  dependencies: Readonly<Record<string, string>>,
): string => {
  if (Object.keys(dependencies).length === 0) return manifestText;
  const doc = parseDocument(manifestText);
  doc.set("dependencies", { ...dependencies });
  return doc.toString({ lineWidth: 0 });
};

/** `ronne.yaml` without `version`, keeping the rest of the text: drafts carry none (017). */
export const withoutVersion = (manifestText: string): string => {
  const doc = parseDocument(manifestText);
  if (!doc.has("version")) return manifestText;
  doc.delete("version");
  return doc.toString({ lineWidth: 0 });
};
