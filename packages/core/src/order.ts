/**
 * Dependencies first (feature 055): a batch in an order where every item comes after the items of
 * the batch it depends on, the rest keeping the order given. Releasing many at once uses it, so a
 * dependency's new version is out before what depends on it is checked. Items that need each other
 * (a cycle, allowed since 112) can't come one after the other: they come next to each other, in
 * the order given, and `groups` lists each cycle's names, so a caller can take them as one.
 * Iterative, so a whole resolution of thousands of items fits on the stack.
 */
export const dependenciesFirst = (
  items: readonly { name: string; dependsOn: readonly string[] }[],
): { order: string[]; groups: string[][] } => {
  const inBatch = new Map(items.map((item) => [item.name, item]));
  const position = new Map(items.map((item, i) => [item.name, i]));
  const within = (name: string) =>
    (inBatch.get(name)?.dependsOn ?? []).filter((dependency) => inBatch.has(dependency));

  // Each item's cycle, if it's in one (Tarjan's strongly connected components), with an explicit
  // stack of frames: an item and how far through its dependencies it is.
  const componentOf = new Map<string, string[]>();
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let next = 0;
  const open = (name: string) => {
    index.set(name, next);
    low.set(name, next);
    next++;
    stack.push(name);
    onStack.add(name);
  };
  for (const item of items) {
    if (index.has(item.name)) continue;
    open(item.name);
    const frames: { name: string; dependencies: string[]; at: number }[] = [
      { name: item.name, dependencies: within(item.name), at: 0 },
    ];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (!frame) break;
      const dependency = frame.dependencies[frame.at];
      if (dependency !== undefined) {
        frame.at++;
        if (!index.has(dependency)) {
          open(dependency);
          frames.push({ name: dependency, dependencies: within(dependency), at: 0 });
        } else if (onStack.has(dependency))
          low.set(frame.name, Math.min(low.get(frame.name) ?? 0, index.get(dependency) ?? 0));
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent)
        low.set(parent.name, Math.min(low.get(parent.name) ?? 0, low.get(frame.name) ?? 0));
      if (low.get(frame.name) !== index.get(frame.name)) continue;
      const component: string[] = [];
      for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
        onStack.delete(member);
        component.push(member);
        if (member === frame.name) break;
      }
      component.sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
      for (const each of component) componentOf.set(each, component);
    }
  }

  // Each component after the components it depends on, the rest in the order given, again with
  // an explicit stack: a component is placed once everything it needs outside it is.
  const order: string[] = [];
  const placed = new Set<string[]>();
  const needs = (component: string[]) => {
    const others: string[][] = [];
    for (const member of component)
      for (const dependency of within(member)) {
        const other = componentOf.get(dependency);
        if (other && other !== component && !others.includes(other)) others.push(other);
      }
    return others;
  };
  for (const item of items) {
    const start = componentOf.get(item.name);
    if (!start || placed.has(start)) continue;
    const visiting = new Set<string[]>([start]);
    const frames: { component: string[]; needs: string[][]; at: number }[] = [
      { component: start, needs: needs(start), at: 0 },
    ];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (!frame) break;
      const other = frame.needs[frame.at];
      if (other !== undefined) {
        frame.at++;
        // Components form no cycle among themselves, so `visiting` only guards against repeats.
        if (!placed.has(other) && !visiting.has(other)) {
          visiting.add(other);
          frames.push({ component: other, needs: needs(other), at: 0 });
        }
        continue;
      }
      frames.pop();
      placed.add(frame.component);
      order.push(...frame.component);
    }
  }

  // An item on itself is refused before it gets here (`self_dependency`), so a cycle has two or
  // more. The groups come in the order they're placed in.
  const groups: string[][] = [];
  for (const name of order) {
    const component = componentOf.get(name);
    if (component && component.length > 1 && component[0] === name) groups.push(component);
  }
  return { order, groups };
};
