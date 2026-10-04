import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkBundle } from "./bundle-check.js";

const dir = mkdtempSync(join(tmpdir(), "rmk-bundle-check-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let count = 0;
/** A small bundle that passes, plus `extra` files ({ path: content }). */
const bundle = (extra = {}) => {
  const root = join(dir, `rmk-server-0.4.0-linux-x64-${++count}`);
  const files = {
    "bin/rmk-server": "#!/bin/sh\n",
    "node/LICENSE": "Node.js",
    "node/bin/node": "",
    THIRD_PARTY_NOTICES: "notices",
    LICENSE: "MIT",
    "lib/node_modules/@ronneai/marketplace/package.json": JSON.stringify({
      name: "@ronneai/marketplace",
      version: "0.4.0",
      dependencies: { "better-sqlite3": "13.0.3", "@node-rs/argon2": "2.2.1" },
    }),
    "lib/node_modules/@ronneai/marketplace/README.md": "",
    "lib/node_modules/@ronneai/marketplace/LICENSE": "",
    "lib/node_modules/@ronneai/marketplace/THIRD_PARTY_NOTICES": "",
    "lib/node_modules/@ronneai/marketplace/dist/bin.js": "",
    "lib/node_modules/@ronneai/marketplace/app/apps/web/server.js": "",
    "lib/node_modules/@ronneai/marketplace/app/apps/web/dist-scripts/start.mjs": "",
    "lib/node_modules/better-sqlite3/package.json": JSON.stringify({
      name: "better-sqlite3",
      dependencies: { bindings: "1" },
    }),
    "lib/node_modules/better-sqlite3/lib/index.js": "",
    "lib/node_modules/bindings/package.json": JSON.stringify({ name: "bindings" }),
    "lib/node_modules/@node-rs/argon2/package.json": JSON.stringify({
      name: "@node-rs/argon2",
      optionalDependencies: {
        "@node-rs/argon2-linux-x64-gnu": "2.2.1",
        "@node-rs/argon2-win32-x64-msvc": "2.2.1",
      },
    }),
    "lib/node_modules/@node-rs/argon2-linux-x64-gnu/package.json": JSON.stringify({
      name: "@node-rs/argon2-linux-x64-gnu",
    }),
    ...extra,
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
};

describe("what a bundle may hold (084)", () => {
  it("passes Node.js, the package, its dependencies (this platform's only), the launcher and notices", () => {
    expect(checkBundle(bundle())).toEqual([]);
    expect(checkBundle(bundle({ "bin/rmk-server.cmd": "@echo off" }))).toEqual([]);
  });

  it("fails on a stray file, wherever it is", () => {
    expect(checkBundle(bundle({ "notes.txt": "" }))).toEqual(["notes.txt isn't part of a bundle"]);
    expect(checkBundle(bundle({ "bin/helper.sh": "" }))).toEqual([
      "bin/helper.sh isn't a launcher",
    ]);
    expect(checkBundle(bundle({ "lib/extra.js": "" }))).toEqual([
      "lib/extra.js is outside lib/node_modules/",
    ]);
    expect(checkBundle(bundle({ "lib/node_modules/vitest/package.json": "{}" }))).toEqual([
      "lib/node_modules/vitest isn't a dependency",
    ]);
    expect(checkBundle(bundle({ "lib/node_modules/@ronneai/marketplace/src/run.ts": "" }))).toEqual(
      ["@ronneai/marketplace would ship src/run.ts"],
    );
  });

  it("resolves nested packages as Node does, and fails on one nothing reaches", () => {
    // better-sqlite3's own copy of bindings is the one Node loads, so the top-level one goes.
    const nested = bundle({
      "lib/node_modules/better-sqlite3/node_modules/bindings/package.json": JSON.stringify({
        name: "bindings",
      }),
    });
    rmSync(join(nested, "lib/node_modules/bindings"), { recursive: true });
    expect(checkBundle(nested)).toEqual([]);
    expect(
      checkBundle(
        bundle({
          "lib/node_modules/better-sqlite3/node_modules/evil/package.json": JSON.stringify({
            name: "evil",
          }),
        }),
      ),
    ).toEqual(["lib/node_modules/better-sqlite3/node_modules/evil isn't a dependency"]);
  });

  it("fails on a package in the server's app/ that its notices don't list", () => {
    const app = "lib/node_modules/@ronneai/marketplace/app/node_modules";
    const listed = bundle({
      [`${app}/next/package.json`]: JSON.stringify({ name: "next", version: "16.3.8" }),
      "lib/node_modules/@ronneai/marketplace/THIRD_PARTY_NOTICES":
        "Title\n\nnext 16.3.8 (MIT)\n\ntext\n",
    });
    expect(checkBundle(listed)).toEqual([]);
    const missing = bundle({
      [`${app}/pg-cloudflare/package.json`]: JSON.stringify({
        name: "pg-cloudflare",
        version: "1.4.1",
      }),
    });
    // A folder there that isn't a package can't be named in the notices.
    expect(checkBundle(bundle({ [`${app}/evilpkg/index.js`]: "" }))).toEqual([
      `${app}/evilpkg isn't a package with a name and version`,
    ]);
    expect(checkBundle(bundle({ [`${app}/evilpkg/package.json`]: "{}" }))).toEqual([
      `${app}/evilpkg isn't a package with a name and version`,
    ]);
    expect(checkBundle(missing)).toEqual([
      "pg-cloudflare 1.4.1, in @ronneai/marketplace's app/, isn't in its THIRD_PARTY_NOTICES",
    ]);
  });

  it("fails on a git folder and on the web app's source", () => {
    expect(
      checkBundle(
        bundle({
          "lib/node_modules/better-sqlite3/.git/config": "",
          "lib/node_modules/@ronneai/marketplace/app/apps/web/src/page.tsx": "",
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        "lib/node_modules/better-sqlite3/.git/config is a git folder",
        "lib/node_modules/@ronneai/marketplace/app/apps/web/src/page.tsx is the web app's source",
      ]),
    );
  });

  it("fails on settings, keys and npm's leftovers", () => {
    const problems = checkBundle(
      bundle({
        "lib/node_modules/@ronneai/marketplace/app/apps/web/.env": "AUTH_SECRET=x",
        "lib/node_modules/.package-lock.json": "{}",
        "lib/node_modules/.bin/rmk-server": "",
        "lib/node_modules/better-sqlite3/.npmrc": "",
        "lib/node_modules/better-sqlite3/server.key": "",
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "lib/node_modules/@ronneai/marketplace/app/apps/web/.env is a settings file",
        "lib/node_modules/.package-lock.json is an npm lockfile",
        "lib/node_modules/.bin/rmk-server is npm's .bin links",
        "lib/node_modules/better-sqlite3/.npmrc is an npm settings file",
        "lib/node_modules/better-sqlite3/server.key is a tarball or a key",
      ]),
    );
  });

  it("fails without a launcher, Node.js or the package's notices", () => {
    const root = bundle();
    rmSync(join(root, "bin", "rmk-server"));
    rmSync(join(root, "node", "LICENSE"));
    rmSync(join(root, "lib/node_modules/@ronneai/marketplace/THIRD_PARTY_NOTICES"));
    expect(checkBundle(root)).toEqual(
      expect.arrayContaining([
        "there's no launcher in bin/",
        "node/ isn't a Node.js build",
        "@ronneai/marketplace is missing THIRD_PARTY_NOTICES",
      ]),
    );
  });
});
