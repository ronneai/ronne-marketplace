// The install scripts as release assets (feature 081): the version written in, and their checksums.
// Plain JavaScript with no dependencies.
import { createHash } from "node:crypto";
import { isVersion } from "./release.js";

/** The install scripts, as paths from the repository root, by the name they're published under. */
export const INSTALL_SCRIPTS = {
  "install.sh": "scripts/install/install.sh",
  "install.ps1": "scripts/install/install.ps1",
};

/** What the scripts carry in place of a version until a release writes one in. */
export const VERSION_PLACEHOLDER = "@RONNE_VERSION@";

/**
 * The script with the release's version in place of the placeholder, which must appear exactly
 * once: a script with none, or with two, would install the wrong thing.
 * @param {string} name
 * @param {string} text
 * @param {string} version
 */
export const withInstallVersion = (name, text, version) => {
  if (!isVersion(version)) throw new Error(`${version} isn't a version such as 0.1.0.`);
  const count = text.split(VERSION_PLACEHOLDER).length - 1;
  if (count !== 1)
    throw new Error(
      `${name} has ${count} ${VERSION_PLACEHOLDER} placeholders; it needs exactly one.`,
    );
  return text.replace(VERSION_PLACEHOLDER, version);
};

/**
 * checksums.txt in `sha256sum` format ("<hash>  <name>"), so `sha256sum -c` and
 * `shasum -a 256 -c` check it.
 * @param {Record<string, string | Buffer>} files contents by published name
 */
export const checksums = (files) =>
  Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, content]) => `${createHash("sha256").update(content).digest("hex")}  ${name}\n`)
    .join("");
