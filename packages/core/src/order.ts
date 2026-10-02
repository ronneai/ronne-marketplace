/**
 * Dependencies first (feature 055): a batch in an order where every item comes after the items of
 * the batch it depends on, the rest keeping the order given. Releasing many at once uses it, so a
 * dependency's new version is out before what depends on it is checked. A cycle (which submit
 * refuses, 013) is reported instead of an order.
 */
export const dependenciesFirst = (
  items: readonly { name: string; dependsOn: readonly string[] }[],
): { order: string[]; cycle: string[] | null } => {
  const inBatch = new Map(items.map((item) => [item.name, item]));
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, path: string[]): string[] | null => {
    if (state.get(name) === "done") return null;
    if (state.get(name) === "visiting") return [...path.slice(path.indexOf(name)), name];
    state.set(name, "visiting");
    for (const dependency of inBatch.get(name)?.dependsOn ?? []) {
      if (!inBatch.has(dependency)) continue;
      const cycle = visit(dependency, [...path, name]);
      if (cycle) return cycle;
    }
    state.set(name, "done");
    order.push(name);
    return null;
  };
  for (const item of items) {
    const cycle = visit(item.name, []);
    if (cycle) return { order: [], cycle };
  }
  return { order, cycle: null };
};
