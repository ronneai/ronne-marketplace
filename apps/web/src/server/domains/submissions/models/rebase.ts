/**
 * Rebasing a change proposal (feature 017): a three-way merge by whole files between the version
 * it started from (`base`), the author's files (`mine`) and the newer version (`theirs`).
 * - Changed only by the author: the author's. Changed only in the newer version: the newer one's.
 * - Changed by both, differently: the author's, listed as a conflict to resolve by hand.
 * - Added or removed on one side only: follow that side. Added on both, differently: a conflict.
 * A file removed on one side and changed on the other counts as changed by both.
 * Plain data, so the editor could preview it; the service reads and writes the files.
 */
export type MergeFile = { encoding: "utf8" | "base64"; content: string; executable: boolean };

export type MergeResult<F extends MergeFile> = {
  /** The files after the rebase, by path. */
  files: Map<string, F>;
  /** Paths changed on both sides, kept as the author had them. Sorted. */
  conflicts: string[];
};

const same = (a: MergeFile | undefined, b: MergeFile | undefined) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.encoding === b.encoding &&
    a.content === b.content &&
    a.executable === b.executable);

export const mergeFiles = <F extends MergeFile>(
  base: ReadonlyMap<string, MergeFile>,
  mine: ReadonlyMap<string, F>,
  theirs: ReadonlyMap<string, F>,
): MergeResult<F> => {
  const files = new Map<string, F>();
  const conflicts: string[] = [];
  const paths = new Set([...base.keys(), ...mine.keys(), ...theirs.keys()]);
  for (const path of paths) {
    const b = base.get(path);
    const m = mine.get(path);
    const t = theirs.get(path);
    const keep = (file: F | undefined) => {
      if (file) files.set(path, file);
    };
    if (same(m, t)) keep(m);
    else if (same(m, b)) keep(t);
    else if (same(t, b)) keep(m);
    else {
      keep(m);
      conflicts.push(path);
    }
  }
  return { files, conflicts: conflicts.sort() };
};
