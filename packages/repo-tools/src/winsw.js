// WinSW (feature 086), which runs rmk-server as a Windows service. Pinned here once: the pack step
// (packages/server/scripts/assemble.mjs) downloads and checks it, and the bundle check (084)
// checks the copy each bundle carries. The official 2.12.0 release (3.0 is still an alpha), its
// .NET Framework 4.6.1 build: IL only, so one file runs natively on x64 and arm64 Windows.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const WINSW = {
  version: "2.12.0",
  file: "WinSW.NET461.exe",
  url: "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe",
  sha256: "b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f",
};

/** Where the package keeps it, relative to the package's folder. */
export const WINSW_PATH = `vendor/winsw/${WINSW.file}`;

export const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
