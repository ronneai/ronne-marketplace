// Commit message and pull request title format. See CLAUDE.md, "Commits and pull requests".
// Plain JavaScript with no dependencies, so the git hook and CI can run it without an install.

export const TYPES = ["docs", "feat", "chore", "bugfix"];
export const MAX_LENGTH = 72;

const SUBJECT = /^\[(?<type>[a-z]+)\](?: (?<id>\S+))?: (?<description>.*)$/;
// Added by GitHub when a pull request is squash-merged.
const PR_SUFFIX = / \(#\d+\)$/;
// Messages git writes itself.
const GIT_GENERATED = /^(Merge |Revert "|fixup! |squash! |amend! )/;

/**
 * Checks the first line of a commit message or a pull request title.
 * @param {string} message
 * @param {{ checkLength?: boolean }} [options] checkLength is off only for Dependabot, whose
 *   generated titles can run past the limit.
 * @returns {{ valid: true } | { valid: false, errors: string[] }}
 */
export const checkSubject = (message, { checkLength = true } = {}) => {
  const subject = (message.split("\n")[0] ?? "").trimEnd();
  if (GIT_GENERATED.test(subject)) return { valid: true };

  const errors = [];
  const withoutSuffix = subject.replace(PR_SUFFIX, "");
  const match = SUBJECT.exec(withoutSuffix);

  if (!match?.groups) {
    errors.push(
      'Use "[type] NNN: Description", "[type] #NNN: Description" for an issue in docs/issues, or "[type]: Description" when there is neither.',
    );
    return { valid: false, errors };
  }

  const { type, id, description } = match.groups;
  if (!TYPES.includes(type)) {
    errors.push(`Unknown type "[${type}]". Use one of: ${TYPES.map((t) => `[${t}]`).join(", ")}.`);
  }
  // A feature's 3-digit ID (docs/features), or an issue's GitHub number with `#` (docs/issues).
  if (id !== undefined && !/^(?:\d{3}|#\d+)$/.test(id)) {
    errors.push(
      `"${id}" isn't a feature or issue ID. Use the 3-digit number from docs/features, # and the number from docs/issues, or leave it out.`,
    );
  }
  if (!description?.trim()) {
    errors.push("Add a description after the colon.");
  } else {
    if (!/^[A-Z]/.test(description)) errors.push("Start the description with a capital letter.");
    if (description.endsWith(".")) errors.push("Don't end the description with a full stop.");
  }
  if (checkLength && withoutSuffix.length > MAX_LENGTH) {
    errors.push(`Keep it to ${MAX_LENGTH} characters or fewer (it's ${withoutSuffix.length}).`);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};
