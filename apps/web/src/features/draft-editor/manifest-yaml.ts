import { isCollection, isScalar, parseDocument } from "yaml";

export type FieldPath = readonly (string | number)[];

/**
 * How ronne.yaml is printed after a form edit: never fold long lines, and `[a, b]` for flow lists
 * as people write them. Untouched parts print as they were, comments included.
 */
const PRINT = { lineWidth: 0, flowCollectionPadding: false } as const;

/** ronne.yaml as the form reads it, or null while its YAML doesn't parse. */
export const readManifest = (text: string): Record<string, unknown> | null => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return null;
  const value = doc.toJS({ maxAliasCount: 0 });
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0);

/**
 * ronne.yaml with one field changed by the form (feature 012), through the `yaml` document API so
 * comments, key order and quoting survive. A scalar is changed in place; a list or mapping is
 * replaced, keeping its flow style and comments. An empty optional value removes the key.
 * Returns the text unchanged if it doesn't parse: the form is off until the YAML is fixed.
 */
export const writeField = (
  text: string,
  path: FieldPath,
  value: unknown,
  options: { required?: boolean } = {},
): string => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return text;
  if (isEmpty(value) && !options.required) {
    if (doc.hasIn(path)) doc.deleteIn(path);
    return doc.toString(PRINT);
  }
  const current = doc.getIn(path, true);
  if (isScalar(current) && (value === null || typeof value !== "object")) {
    current.value = value;
    return doc.toString(PRINT);
  }
  const node = doc.createNode(value);
  if (isCollection(current) && isCollection(node)) {
    node.flow = current.flow;
    node.comment = current.comment;
    node.commentBefore = current.commentBefore;
  }
  doc.setIn(path, node);
  return doc.toString(PRINT);
};
