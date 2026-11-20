// The oldest Node.js rmk-server runs on (feature 082; `engines` says the same). better-sqlite3
// needs N-API 10: Node.js has it from 23.6.0, and 22.14.0 got it as a backport. On 22.12, 22.13
// and 23.0–23.5 the driver segfaults when it loads, with no message (#315).
export const MIN_NODE = "22.14.0";
/** The first 23.x with N-API 10. */
export const MIN_NODE_23 = "23.6.0";
/** `engines.node` in every package.json. */
export const ENGINES_NODE = `^${MIN_NODE} || >=${MIN_NODE_23}`;

const majorMinor = (version: string): [number, number] => {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  return [major, minor];
};

const below = (version: string, min: string): boolean => {
  const [major, minor] = majorMinor(version);
  const [minMajor, minMinor] = majorMinor(min);
  return major < minMajor || (major === minMajor && minor < minMinor);
};

/** True when `version` (such as process.versions.node) is older than what rmk-server needs. */
export const nodeTooOld = (version: string): boolean =>
  majorMinor(version)[0] === 23 ? below(version, MIN_NODE_23) : below(version, MIN_NODE);

/** What rmk-server says when `version` is too old. */
export const nodeTooOldMessage = (version: string): string =>
  majorMinor(version)[0] === 23
    ? `Node.js ${MIN_NODE} or later is needed, and on Node.js 23, ${MIN_NODE_23} or later; this is ${version}.`
    : `Node.js ${MIN_NODE} or later is needed; this is ${version}.`;
