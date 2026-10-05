import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  bundleName,
  cmdLauncher,
  latestOf,
  nodeArchive,
  notices,
  parseShasums,
  shLauncher,
} from "./bundle.js";
import { archiveFolder, pathWithoutNode } from "./bundle-smoke.js";
import { collectPackages } from "./notices.js";

const dir = mkdtempSync(join(tmpdir(), "rmk-bundle-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the bundle's Node.js (084)", () => {
  it("names each platform's download as nodejs.org does", () => {
    expect(nodeArchive("linux", "x64", "24.21.0")).toBe("node-v24.21.0-linux-x64.tar.gz");
    expect(nodeArchive("darwin", "arm64", "24.21.0")).toBe("node-v24.21.0-darwin-arm64.tar.gz");
    expect(nodeArchive("win32", "arm64", "24.21.0")).toBe("node-v24.21.0-win-arm64.zip");
  });

  it("takes the newest release of the major from index.json", () => {
    const index = [
      { version: "v25.1.0" },
      { version: "v24.21.0" },
      { version: "v24.20.1" },
      { version: "v22.23.3" },
    ];
    expect(latestOf(index, 24)).toBe("24.21.0");
    expect(() => latestOf(index, 26)).toThrow("no Node.js 26 release");
  });

  it("reads SHASUMS256.txt", () => {
    const hash = "a".repeat(64);
    const sums = parseShasums(`${hash}  node-v24.21.0-linux-x64.tar.gz\nnot a line\n\n`);
    expect(sums.get("node-v24.21.0-linux-x64.tar.gz")).toBe(hash);
    expect(sums.size).toBe(1);
  });

  it("names the bundle by version, platform and processor", () => {
    expect(bundleName("0.4.0", "linux", "x64")).toBe("rmk-server-0.4.0-linux-x64");
  });
});

describe("the launchers (084)", () => {
  it("runs the bundled Node, also through a link from elsewhere", () => {
    // A bundle whose "node" prints what it was given, and a link to the launcher in another folder,
    // as Homebrew and the packages make.
    const root = join(dir, "rmk-server-0.4.0-linux-x64");
    mkdirSync(join(root, "bin"), { recursive: true });
    mkdirSync(join(root, "node", "bin"), { recursive: true });
    writeFileSync(join(root, "node", "bin", "node"), '#!/bin/sh\necho "bundle=$RONNE_BUNDLE $*"\n');
    chmodSync(join(root, "node", "bin", "node"), 0o755);
    writeFileSync(join(root, "bin", "rmk-server"), shLauncher());
    chmodSync(join(root, "bin", "rmk-server"), 0o755);
    mkdirSync(join(dir, "elsewhere"));
    symlinkSync(join(root, "bin", "rmk-server"), join(dir, "elsewhere", "rmk-server"));
    const env = { PATH: "/usr/bin:/bin" };
    for (const launcher of [
      join(root, "bin", "rmk-server"),
      join(dir, "elsewhere", "rmk-server"),
    ]) {
      const output = execFileSync(launcher, ["--version", "a b"], { encoding: "utf8", env });
      expect(output.trim()).toMatch(
        /^bundle=1 \/.*rmk-server-0\.4\.0-linux-x64\/lib\/node_modules\/@ronneai\/marketplace\/dist\/bin\.js --version a b$/,
      );
    }
  });

  it("Windows: the bundled node.exe, with CRLF lines", () => {
    const cmd = cmdLauncher();
    expect(cmd).toContain(
      '"%~dp0..\\node\\node.exe" "%~dp0..\\lib\\node_modules\\@ronneai\\marketplace\\dist\\bin.js" %*',
    );
    expect(cmd).toContain("set RONNE_BUNDLE=1");
    expect(cmd.split("\r\n").length).toBeGreaterThan(3);
    expect(cmd.replaceAll("\r\n", "")).not.toContain("\n");
  });
});

describe("the notices (084)", () => {
  const pkg = (folder, manifest, licence) => {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "package.json"), JSON.stringify(manifest));
    if (licence) writeFileSync(join(folder, "LICENSE"), licence);
  };

  it("finds every package once, scoped, nested and in a package's own node_modules", () => {
    const lib = join(dir, "lib");
    const top = join(lib, "node_modules");
    pkg(
      join(top, "@ronneai", "marketplace"),
      { name: "@ronneai/marketplace", version: "0.4.0", license: "MIT" },
      "Ronne",
    );
    pkg(join(top, "@ronneai", "marketplace", "app", "node_modules", "next"), {
      name: "next",
      version: "16.3.8",
      license: "MIT",
    });
    pkg(
      join(top, "better-sqlite3"),
      { name: "better-sqlite3", version: "13.0.3", license: "MIT" },
      "MIT text",
    );
    pkg(join(top, "better-sqlite3", "node_modules", "bindings"), {
      name: "bindings",
      version: "1.5.0",
      license: "MIT",
    });
    pkg(join(top, "a"), { name: "a", version: "1.0.0", license: { type: "MIT" } });
    pkg(join(top, "a", "lib"), { name: "a-internal" }); // no version: not a package
    pkg(join(top, "dup"), { name: "dup", version: "1.0.0", license: "ISC" });
    pkg(join(top, "a", "node_modules", "dup"), { name: "dup", version: "1.0.0", license: "ISC" });
    const found = collectPackages(lib);
    expect(found.map((p) => `${p.name}@${p.version}`)).toEqual([
      "@ronneai/marketplace@0.4.0",
      "a@1.0.0",
      "better-sqlite3@13.0.3",
      "bindings@1.5.0",
      "dup@1.0.0",
      "next@16.3.8",
    ]);
    expect(found.find((p) => p.name === "a")?.license).toBe("UNKNOWN");
    expect(found.find((p) => p.name === "better-sqlite3")?.text).toBe("MIT text");
  });

  it("puts Node.js first, then each package with its licence", () => {
    const text = notices({
      nodeVersion: "24.21.0",
      nodeLicense: "Node.js is licensed for use as follows:",
      packages: [
        { name: "x", version: "1.0.0", license: "MIT", text: "X licence" },
        { name: "y", version: "2.0.0", license: "ISC", text: "" },
      ],
    });
    expect(text.indexOf("Node.js 24.21.0")).toBeLessThan(text.indexOf("x 1.0.0 (MIT)"));
    expect(text).toContain("X licence");
    expect(text).toContain("No licence file in the package; its package.json says ISC.");
  });
});

describe("the bundle's smoke test (084)", () => {
  it("takes every folder with a node off PATH", () => {
    const has = new Set([
      "/usr/local/bin/node",
      "/opt/n/bin/node",
      "C:\\Program Files\\nodejs\\node.exe",
    ]);
    const exists = (path) => has.has(path);
    expect(pathWithoutNode("/usr/local/bin:/usr/bin:/opt/n/bin:/bin", "linux", exists)).toBe(
      "/usr/bin:/bin",
    );
    expect(
      pathWithoutNode("C:\\Windows\\System32;C:\\Program Files\\nodejs", "win32", (p) =>
        exists(p.replaceAll("/", "\\")),
      ),
    ).toBe("C:\\Windows\\System32");
  });

  it("knows the folder an archive unpacks to", () => {
    expect(archiveFolder("out/rmk-server-0.4.0-linux-x64.tar.gz")).toBe(
      "rmk-server-0.4.0-linux-x64",
    );
    expect(archiveFolder("rmk-server-0.4.0-win32-arm64.zip")).toBe("rmk-server-0.4.0-win32-arm64");
  });
});
