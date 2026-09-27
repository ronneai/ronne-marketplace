// Decides which checks a commit needs, from its staged files. See CLAUDE.md, "Commits and pull requests".

/**
 * Files that can't change behaviour: Markdown and plain text, wherever they are. Other files under
 * docs/ aren't included: docs/spec/ronne.schema.json is read by the tests.
 */
export const isDocumentation = (path) => {
  return /\.(md|mdx|txt)$/i.test(path);
};

const DEPENDENCY_FILES = /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/;

/**
 * @param {string[]} stagedFiles paths relative to the repo root
 * @returns {string[][]} the commands to run, in order; empty when the commit is documentation only
 */
export const planChecks = (stagedFiles) => {
  if (stagedFiles.length === 0 || stagedFiles.every(isDocumentation)) return [];

  const commands = [];
  const dependenciesChanged = stagedFiles.some((file) => DEPENDENCY_FILES.test(file));
  if (dependenciesChanged) commands.push(["pnpm", "install", "--frozen-lockfile"]);
  commands.push(["pnpm", "lint"], ["pnpm", "typecheck"], ["pnpm", "test"], ["pnpm", "build"]);
  if (dependenciesChanged) commands.push(["pnpm", "licenses:check"]);
  return commands;
};
