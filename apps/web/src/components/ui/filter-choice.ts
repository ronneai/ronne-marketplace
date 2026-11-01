/**
 * A filter's choice after a value is ticked or unticked; `null` for "all". Unticking the last value
 * or ticking every one leaves "all", so a filter never hides everything and "All" is how both read.
 * A set is never empty or complete.
 */
export const toggleChoice = <T extends string>(
  current: ReadonlySet<T> | null,
  all: readonly T[],
  value: T,
): ReadonlySet<T> | null => {
  // From "all", ticking a value narrows to it alone; the options read unticked while "All" is on.
  if (current === null) return new Set([value]);
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next.size === 0 || all.every((v) => next.has(v)) ? null : next;
};
