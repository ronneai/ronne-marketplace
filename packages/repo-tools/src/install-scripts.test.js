import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checksums,
  INSTALL_SCRIPTS,
  VERSION_PLACEHOLDER,
  withInstallVersion,
} from "./install-scripts.js";

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("install scripts as release assets", () => {
  it("writes the version into each script, once", () => {
    for (const [name, path] of Object.entries(INSTALL_SCRIPTS)) {
      const text = read(path);
      const released = withInstallVersion(name, text, "0.3.0");
      expect(released).not.toContain(VERSION_PLACEHOLDER);
      expect(released).toMatch(
        name.endsWith(".sh") ? /^RONNE_VERSION="0\.3\.0"$/m : /^\$RonneVersion = '0\.3\.0'$/m,
      );
      expect(released.length).toBe(text.length - VERSION_PLACEHOLDER.length + "0.3.0".length);
    }
  });

  it("refuses a missing or doubled placeholder, and a bad version", () => {
    expect(() => withInstallVersion("x.sh", "no version", "0.3.0")).toThrow(
      "x.sh has 0 @RONNE_VERSION@ placeholders; it needs exactly one.",
    );
    expect(() =>
      withInstallVersion("x.sh", `${VERSION_PLACEHOLDER} ${VERSION_PLACEHOLDER}`, "0.3.0"),
    ).toThrow(/has 2/);
    expect(() => withInstallVersion("x.sh", VERSION_PLACEHOLDER, "v0.3.0")).toThrow(
      /isn't a version/,
    );
  });

  it("lists sha256 checksums in sha256sum's format, sorted by name", () => {
    const hash = (s) => createHash("sha256").update(s).digest("hex");
    expect(checksums({ "install.sh": "b", "install.ps1": "a" })).toBe(
      `${hash("a")}  install.ps1\n${hash("b")}  install.sh\n`,
    );
  });

  it("ends both scripts by calling their entry point, so a cut download runs nothing", () => {
    expect(read(INSTALL_SCRIPTS["install.sh"]).trimEnd().split("\n").at(-1)).toBe('main "$@"');
    expect(read(INSTALL_SCRIPTS["install.ps1"]).trimEnd().split("\n").at(-1)).toBe("Install-Ronne");
  });
});
