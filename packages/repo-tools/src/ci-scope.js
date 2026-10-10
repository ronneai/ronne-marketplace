#!/usr/bin/env node
// Reads changed file paths (one per line) on stdin and prints which of CI's slow suites a pull
// request runs, as `name=true|false` lines for $GITHUB_OUTPUT (changes.yml): the Docker image
// (image.yml), the server package on every system (server-package.yml) and the install scripts
// (install-scripts.yml). Each runs when the pull request changes a file it builds or tests; all of
// them run nightly on main and in every release (docs/knowledge/test-runs.md). An empty list runs
// everything, so detection never skips a suite by accident.
import { readFileSync } from "node:fs";

/** The dependencies, the tool versions and the shared detection: every suite installs or reads them. */
const SHARED = [
  /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/,
  /^\.nvmrc$/,
  /^\.github\/workflows\/changes\.yml$/,
  /^packages\/repo-tools\/src\/ci-scope\.js$/,
];

/** What each suite builds or tests, beyond SHARED. */
export const SUITE_PATHS = {
  // The Dockerfile copies the whole repository in; the app's own code is checked by ci.yml's build
  // (the same standalone output), so only what the image adds is listed. The image job also runs
  // install.sh against the image (build-image/install-probe.sh).
  image: [
    /^Dockerfile$/,
    /^\.dockerignore$/,
    /^compose\.yaml$/,
    /^docker\//,
    /^\.github\/actions\/build-image\//,
    /^\.github\/workflows\/image\.yml$/,
    /^apps\/web\/next\.config\.[cm]?[jt]s$/,
    /^apps\/web\/scripts\//,
    /^scripts\/install\//,
  ],
  // rmk-server (082) with the web app's standalone build inside, its bundles (084), the Linux
  // packages (085) and the services (083, 086).
  server: [
    /^packages\/server\//,
    /^packaging\//,
    /^scripts\/service\//,
    /^scripts\/packages\//,
    /^apps\/web\/next\.config\.[cm]?[jt]s$/,
    /^packages\/repo-tools\/src\/(bundle|bundle-check|bundle-smoke|package-linux|server-probe|packs|notices|winsw)\.js$/,
    /^\.github\/workflows\/(server-package|server-checks|bundles|packages)\.yml$/,
  ],
  // install.sh and install.ps1 (081).
  install: [
    /^scripts\/install\//,
    /^packages\/repo-tools\/src\/(install-scripts|release-install-scripts)\.js$/,
    /^\.github\/workflows\/install-scripts\.yml$/,
  ],
};

/**
 * @param {string[]} files paths relative to the repo root
 * @returns {Record<keyof typeof SUITE_PATHS, boolean>} whether each suite runs
 */
export const ciScope = (files) => {
  const touches = (/** @type {RegExp[]} */ paths) =>
    files.length === 0 || files.some((file) => [...SHARED, ...paths].some((p) => p.test(file)));
  return {
    image: touches(SUITE_PATHS.image),
    server: touches(SUITE_PATHS.server),
    install: touches(SUITE_PATHS.install),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = readFileSync(0, "utf8")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  for (const [suite, runs] of Object.entries(ciScope(files)))
    process.stdout.write(`${suite}=${runs}\n`);
}
