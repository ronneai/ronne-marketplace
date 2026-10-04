// The oldest Node.js rmk-server runs on (feature 082; the same as `engines`).
export const MIN_NODE = "22.12.0";

/** True when `version` (such as process.versions.node) is older than MIN_NODE. */
export const nodeTooOld = (version: string): boolean => {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  const [minMajor = 0, minMinor = 0] = MIN_NODE.split(".").map(Number);
  return major < minMajor || (major === minMajor && minor < minMinor);
};
