// Versions for the published packages (feature 034). Plain JavaScript with no dependencies.
import { PUBLISHED } from "./packs.js";

/** A plain semver version: MAJOR.MINOR.PATCH with an optional pre-release; no `v`, no build. */
export const isVersion = (value) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(value);

/**
 * The package.json texts with `version` set, keeping every other byte: one version for all the
 * published packages, since they're built and tested together.
 * @param {Record<string, string>} texts package.json text by folder
 * @param {string} version
 */
export const withVersion = (texts, version) => {
  if (!isVersion(version)) throw new Error(`${version} isn't a version such as 0.1.0.`);
  const out = {};
  for (const folder of Object.keys(PUBLISHED)) {
    const text = texts[folder];
    if (text === undefined) throw new Error(`packages/${folder}/package.json is missing.`);
    if (!/^ {2}"version": "[^"]*",$/m.test(text))
      throw new Error(`packages/${folder}/package.json has no "version" line to change.`);
    out[folder] = text.replace(/^ {2}"version": "[^"]*",$/m, `  "version": "${version}",`);
  }
  return out;
};

/** The one version the published packages share, or an error naming the ones that differ. */
export const sharedVersion = (texts) => {
  const versions = Object.fromEntries(
    Object.keys(PUBLISHED).map((folder) => [folder, JSON.parse(texts[folder]).version]),
  );
  const distinct = [...new Set(Object.values(versions))];
  if (distinct.length !== 1)
    throw new Error(
      `The published packages have different versions: ${Object.entries(versions)
        .map(([folder, v]) => `${folder} ${v}`)
        .join(", ")}. Run pnpm release:version.`,
    );
  return distinct[0];
};
