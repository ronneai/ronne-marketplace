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

/**
 * The version main moves to once `released` is out: the next minor, X.(Y+1).0, so a build from
 * main never carries a released version (0.6.0 → 0.7.0, 0.6.2 → 0.7.0). Null, with nothing to
 * change, after a pre-release (main stays where it is until the stable version), or when main is
 * already at that version or later: a patch set by hand on main and released, or a re-run.
 * @param {string} released the released version, without `v`
 * @param {string} current the version main carries now
 * @returns {string | null}
 */
export const nextMinor = (released, current) => {
  if (!isVersion(released)) throw new Error(`${released} isn't a version such as 0.1.0.`);
  if (!isVersion(current)) throw new Error(`${current} isn't a version such as 0.1.0.`);
  if (released.includes("-")) return null;
  const core = (v) => v.split("-")[0].split(".").map(Number);
  const [major, minor] = core(released);
  const next = [major, minor + 1, 0];
  const now = core(current);
  const i = now.findIndex((n, k) => n !== next[k]);
  if (i === -1 || now[i] > next[i]) return null;
  return next.join(".");
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
