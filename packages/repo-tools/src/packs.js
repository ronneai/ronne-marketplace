// What each published package may contain (feature 034). Plain JavaScript with no dependencies,
// like the rest of repo-tools.

/**
 * The packages published to npm, by folder, and what else each may ship beyond the defaults.
 * `forbid` applies even inside `extra`; `require` lists files the package can't work without.
 */
export const PUBLISHED = {
  core: { name: "@ronneai/core", extra: [/^dist\/schema\/ronne\.schema\.json$/] },
  cli: { name: "@ronneai/rmk", extra: [/^dist\/testing\.(js|d\.ts)$/] },
  mcp: { name: "@ronneai/mcp", extra: [] },
  // The server (082): rmk-server in dist/, and the web app's standalone build in app/, copied in at
  // pack time. Never a settings file (Next's standalone output copies the build machine's .env) or
  // a native binary (npm installs better-sqlite3 and argon2 for each platform).
  server: {
    name: "@ronneai/marketplace",
    extra: [/^app\//],
    forbid: [/(^|\/)\.env(\.[^/]*)?$/, /\.node$/],
    require: ["app/apps/web/server.js", "app/apps/web/dist-scripts/start.mjs"],
  },
};

const REQUIRED = ["package.json", "README.md", "LICENSE"];
const ALLOWED = [/^package\.json$/, /^README\.md$/, /^LICENSE$/, /^dist\/.+\.(js|d\.ts)$/];
/** Never shipped, even inside dist/: tests, maps, sources, test helpers (except rmk's). */
const FORBIDDEN = [/\.test\./, /\.map$/, /^src\//, /__golden__/, /(^|\/)testing\.(js|d\.ts)$/];

/**
 * Checks one package's file list, as `pnpm pack --dry-run --json` reports it.
 * @param {string} folder a key of PUBLISHED
 * @param {{ name: string, files: { path: string }[] }} pack
 * @returns {string[]} problems, empty when the package is fine
 */
export const checkPack = (folder, pack) => {
  const rules = PUBLISHED[folder];
  if (!rules) return [`${folder} isn't a published package.`];
  const problems = [];
  if (pack.name !== rules.name) problems.push(`packs as ${pack.name}, not ${rules.name}`);
  const paths = pack.files.map((f) => f.path);
  for (const path of [...REQUIRED, ...(rules.require ?? [])])
    if (!paths.includes(path)) problems.push(`is missing ${path}`);
  if (!paths.some((path) => path.startsWith("dist/")))
    problems.push("has no dist/: build it first");
  for (const path of paths) {
    if ((rules.forbid ?? []).some((re) => re.test(path))) {
      problems.push(`would ship ${path}`);
      continue;
    }
    const extra = rules.extra.some((re) => re.test(path));
    if (!extra && FORBIDDEN.some((re) => re.test(path))) problems.push(`would ship ${path}`);
    else if (!extra && !ALLOWED.some((re) => re.test(path)))
      problems.push(`would ship ${path}, which isn't on the allowlist`);
  }
  return problems;
};
