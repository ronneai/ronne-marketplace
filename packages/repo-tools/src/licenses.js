// License check for the whole install tree. See docs/policies/dependencies.md §1 and §5.
// Plain JavaScript with no dependencies, like the rest of repo-tools.

/**
 * Evaluates an SPDX license expression against a set of allowed license IDs.
 * `A OR B` passes when either side passes, `A AND B` only when both do, and `A WITH exception`
 * follows `A` (an exception only adds permissions). Anything unparseable fails.
 * @param {string} expression
 * @param {Set<string>} allowed
 * @returns {boolean}
 */
export const isExpressionAllowed = (expression, allowed) => {
  const tokens = expression.replace(/[()]/g, " $& ").trim().split(/\s+/).filter(Boolean);
  let position = 0;

  const peek = () => tokens[position];
  const next = () => tokens[position++];

  // or := and ("OR" and)* ; and := atom ("AND" atom)* ; atom := "(" or ")" | id ("WITH" id)?
  const parseOr = () => {
    let result = parseAnd();
    while (peek()?.toUpperCase() === "OR") {
      next();
      const right = parseAnd();
      result = result || right;
    }
    return result;
  };
  const parseAnd = () => {
    let result = parseAtom();
    while (peek()?.toUpperCase() === "AND") {
      next();
      const right = parseAtom();
      result = result && right;
    }
    return result;
  };
  const parseAtom = () => {
    const token = next();
    if (token === undefined) throw new Error("unexpected end");
    if (token === "(") {
      const result = parseOr();
      if (next() !== ")") throw new Error("missing )");
      return result;
    }
    if (["AND", "OR", "WITH", ")"].includes(token.toUpperCase()))
      throw new Error(`unexpected ${token}`);
    if (peek()?.toUpperCase() === "WITH") {
      next();
      if (next() === undefined) throw new Error("missing exception after WITH");
    }
    return allowed.has(token.replace(/\+$/, ""));
  };

  try {
    const result = parseOr();
    return position === tokens.length && result;
  } catch {
    return false;
  }
};

/** Matches a package name against an exception's `package`, which may end in `*`. */
const matchesPackage = (pattern, name) => {
  return pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
};

/**
 * @typedef {{ name: string, versions: string[], license?: string }} LicensedPackage
 * @typedef {{ allowed: string[], exceptions: { id: string, package: string, license: string }[] }} LicensePolicy
 * @typedef {{ name: string, versions: string[], license: string }} Violation
 */

/**
 * Checks the output of `pnpm licenses list --json` (an object keyed by license) against the policy.
 * @param {Record<string, LicensedPackage[]>} report
 * @param {LicensePolicy} policy
 * @returns {{ violations: Violation[], checked: number, unusedExceptions: string[] }}
 */
export const checkLicenses = (report, policy) => {
  const allowed = new Set(policy.allowed);
  const usedExceptions = new Set();
  /** @type {Violation[]} */
  const violations = [];
  let checked = 0;

  for (const [reportedLicense, packages] of Object.entries(report)) {
    for (const pkg of packages) {
      checked++;
      const license = pkg.license ?? reportedLicense;
      if (isExpressionAllowed(license, allowed)) continue;

      const exception = policy.exceptions.find(
        (e) => e.license === license && matchesPackage(e.package, pkg.name),
      );
      if (exception) {
        usedExceptions.add(`${exception.id} ${exception.package}`);
        continue;
      }
      violations.push({ name: pkg.name, versions: pkg.versions, license });
    }
  }

  const unusedExceptions = policy.exceptions
    .map((e) => `${e.id} ${e.package}`)
    .filter((key) => !usedExceptions.has(key));

  return { violations, checked, unusedExceptions };
};
