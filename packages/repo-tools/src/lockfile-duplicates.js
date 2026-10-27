/**
 * CodeMirror breaks when two copies of one of its packages are loaded, so the lockfile must hold one
 * version of each `@codemirror/*` package (docs/knowledge/duplicate-codemirror-packages.md).
 */
export const GUARDED = /^@codemirror\//;

/**
 * The versions of each guarded package in a `pnpm-lock.yaml`, read from its `packages:` section
 * (`snapshots:` repeats the same packages with peer suffixes). Returns the packages that have more
 * than one version: `{ "@codemirror/view": ["6.43.14", "6.43.15"] }`.
 */
export const duplicatedVersions = (lockfile, guarded = GUARDED) => {
  const versions = new Map();
  let inPackages = false;
  for (const line of lockfile.split("\n")) {
    if (/^\S/.test(line)) inPackages = line.startsWith("packages:");
    if (!inPackages) continue;
    const match = /^ {2}'?(@[^/@]+\/[^@']+|[^@'\s][^@']*)@([^']+?)'?:/.exec(line);
    if (!match || !guarded.test(match[1])) continue;
    versions.set(match[1], new Set([...(versions.get(match[1]) ?? []), match[2]]));
  }
  return Object.fromEntries(
    [...versions].filter(([, set]) => set.size > 1).map(([name, set]) => [name, [...set].sort()]),
  );
};
