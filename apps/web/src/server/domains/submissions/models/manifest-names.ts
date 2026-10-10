import { isMap, isScalar, parseDocument } from "yaml";

/**
 * `ronne.yaml` under the names items have now (118), as released and as a proposal starts: `name` is the item's full name now, and each dependency is under
 * the name it has now, keeping comments, quoting and order. Unchanged if it can't be read.
 */
export const manifestNamed = (
  text: string,
  name: string,
  dependencies: ReadonlyMap<string, string>,
): string => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return text;
  const own = doc.get("name", true);
  if (isScalar(own) && own.value !== name) own.value = name;
  const needs = doc.get("dependencies", true);
  if (isMap(needs))
    for (const pair of needs.items)
      if (isScalar(pair.key) && typeof pair.key.value === "string") {
        const now = dependencies.get(pair.key.value);
        if (now && now !== pair.key.value) pair.key.value = now;
      }
  return doc.toString();
};
