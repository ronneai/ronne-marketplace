#!/usr/bin/env node
// Usage: node packages/repo-tools/src/package-linux.js <rmk-server-X.Y.Z-linux-ARCH.tar.gz>
//          [--out DIR] [--nfpm PATH] [--version V]
// The .deb and .rpm of rmk-server (feature 085), from a Linux bundle (084), with nFPM and
// packaging/linux/nfpm.yaml. The bundle is unpacked as it is: the packages hold the same files,
// under /opt/rmk-server. `--version` overrides the bundle's (CI builds an older one to test an
// upgrade).
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** nFPM's (Go's) name for a bundle's processor; nFPM turns it into amd64/x86_64, arm64/aarch64. */
export const NFPM_ARCH = { x64: "amd64", arm64: "arm64" };

/** Version and processor from a bundle's name: rmk-server-X.Y.Z-linux-ARCH.tar.gz. */
export const bundleInfo = (archive) => {
  const name = basename(archive);
  const match = /^rmk-server-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)-linux-(x64|arm64)\.tar\.gz$/.exec(
    name,
  );
  if (!match)
    throw new Error(`${name} isn't a Linux bundle (rmk-server-X.Y.Z-linux-x64.tar.gz or -arm64).`);
  return { version: match[1], arch: match[2], folder: name.replace(/\.tar\.gz$/, "") };
};

/** The template with each ${NAME} replaced; a name it doesn't know is an error, not left in. */
export const fillTemplate = (template, values) =>
  template.replace(/\$\{([A-Z_]+)\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`nfpm.yaml uses \${${name}}, which isn't set.`);
    return values[name];
  });

const main = () => {
  const args = process.argv.slice(2);
  const options = { out: "packages-out", nfpm: "nfpm" };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") options.out = args[++i];
    else if (args[i] === "--nfpm") options.nfpm = args[++i];
    else if (args[i] === "--version") options.version = args[++i];
    else rest.push(args[i]);
  }
  const archive = rest[0];
  if (!archive || !existsSync(archive))
    throw new Error("Give a Linux bundle: rmk-server-X.Y.Z-linux-ARCH.tar.gz.");
  const info = bundleInfo(archive);
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  const work = mkdtempSync(join(tmpdir(), "rmk-package-"));
  try {
    execFileSync("tar", ["-xzf", resolve(archive), "-C", work]);
    const out = resolve(options.out);
    mkdirSync(out, { recursive: true });
    // nFPM expands variables in a few fields only, not in contents or scripts: the template's
    // ${…} are filled here, into a config of this build's own.
    const config = join(work, "nfpm.yaml");
    writeFileSync(
      config,
      fillTemplate(readFileSync(join(repo, "packaging", "linux", "nfpm.yaml"), "utf8"), {
        VERSION: options.version ?? info.version,
        NFPM_ARCH: NFPM_ARCH[info.arch],
        BUNDLE_DIR: join(work, info.folder),
        SCRIPTS_DIR: join(repo, "packaging", "linux", "scripts"),
      }),
    );
    for (const packager of ["deb", "rpm"])
      execFileSync(
        options.nfpm,
        ["package", "--config", config, "--packager", packager, "--target", out],
        { stdio: "inherit" },
      );
    for (const file of readdirSync(out)
      .filter((name) => /\.(deb|rpm)$/.test(name))
      .sort())
      console.log(`  ${file}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  try {
    main();
  } catch (error) {
    console.error(`package-linux: ${error.message}`);
    process.exit(1);
  }
