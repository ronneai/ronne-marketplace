// Versions for the published packages (feature 034) and the web app's image (035). Plain
// JavaScript with no dependencies.
import { PUBLISHED } from "./packs.js";

/**
 * Every package.json that carries the release version, by key, as a path from the repository
 * root: the three npm packages, and the web app, whose Docker image shares the version (035).
 */
export const VERSIONED = {
  ...Object.fromEntries(Object.keys(PUBLISHED).map((f) => [f, `packages/${f}/package.json`])),
  web: "apps/web/package.json",
};

/** A plain semver version: MAJOR.MINOR.PATCH with an optional pre-release; no `v`, no build. */
export const isVersion = (value) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(value);

/**
 * The package.json texts with `version` set, keeping every other byte: one version for all of
 * VERSIONED, since the packages and the image are built and tested together.
 * @param {Record<string, string>} texts package.json text by VERSIONED key
 * @param {string} version
 */
export const withVersion = (texts, version) => {
  if (!isVersion(version)) throw new Error(`${version} isn't a version such as 0.1.0.`);
  const out = {};
  for (const [key, path] of Object.entries(VERSIONED)) {
    const text = texts[key];
    if (text === undefined) throw new Error(`${path} is missing.`);
    if (!/^ {2}"version": "[^"]*",$/m.test(text))
      throw new Error(`${path} has no "version" line to change.`);
    out[key] = text.replace(/^ {2}"version": "[^"]*",$/m, `  "version": "${version}",`);
  }
  return out;
};

/** The one version everything in VERSIONED shares, or an error naming what differs. */
export const sharedVersion = (texts) => {
  const versions = Object.fromEntries(
    Object.entries(VERSIONED).map(([key, path]) => {
      if (texts[key] === undefined) throw new Error(`${path} is missing.`);
      return [key, JSON.parse(texts[key]).version];
    }),
  );
  const distinct = [...new Set(Object.values(versions))];
  if (distinct.length !== 1)
    throw new Error(
      `The published packages and the web app have different versions: ${Object.entries(versions)
        .map(([key, v]) => `${key} ${v}`)
        .join(", ")}. Run pnpm release:version.`,
    );
  return distinct[0];
};
