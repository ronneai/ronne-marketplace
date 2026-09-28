/**
 * A problem found in an item. Checks return a list of these; nothing throws for invalid content,
 * so an editor can show every problem at once (feature 011).
 */
export type ManifestIssue = {
  severity: "error" | "warning";
  /** Stable, for tests and for code that reacts to one kind of issue. */
  code: string;
  /** One plain sentence. */
  message: string;
  /** JSON pointer into the manifest, such as "/agent/prompt". */
  path?: string;
  /** The file it's about, when it isn't ronne.yaml. */
  file?: string;
  /** 1-based line in ronne.yaml, when the path can be located. */
  line?: number;
};

export const hasErrors = (issues: readonly ManifestIssue[]): boolean =>
  issues.some((issue) => issue.severity === "error");

/** "/agent/tools/0" → "agent.tools[0]", for messages. */
export const fieldName = (pointer: string): string =>
  pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce(
      (name, part) => (/^\d+$/.test(part) ? `${name}[${part}]` : name ? `${name}.${part}` : part),
      "",
    );
