import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleInfo, fillTemplate, NFPM_ARCH } from "./package-linux.js";

describe("the Linux packages (085)", () => {
  it("reads the version and processor from a Linux bundle's name", () => {
    expect(bundleInfo("out/rmk-server-0.4.0-linux-x64.tar.gz")).toEqual({
      version: "0.4.0",
      arch: "x64",
      folder: "rmk-server-0.4.0-linux-x64",
    });
    expect(bundleInfo("rmk-server-1.0.0-rc.1-linux-arm64.tar.gz")).toMatchObject({
      version: "1.0.0-rc.1",
      arch: "arm64",
    });
    for (const name of [
      "rmk-server-0.4.0-darwin-x64.tar.gz",
      "rmk-server-0.4.0-win32-x64.zip",
      "x.tgz",
    ])
      expect(() => bundleInfo(name), name).toThrow("isn't a Linux bundle");
    expect(NFPM_ARCH).toEqual({ x64: "amd64", arm64: "arm64" });
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: nfpm.yaml's placeholders, as text.
  it("fills every ${NAME} of nfpm.yaml, and refuses one it doesn't know", () => {
    const template = readFileSync(
      fileURLToPath(new URL("../../../packaging/linux/nfpm.yaml", import.meta.url)),
      "utf8",
    );
    const filled = fillTemplate(template, {
      VERSION: "0.4.0",
      NFPM_ARCH: "amd64",
      BUNDLE_DIR: "/tmp/b/rmk-server-0.4.0-linux-x64",
      SCRIPTS_DIR: "/repo/packaging/linux/scripts",
    });
    expect(filled).not.toMatch(/\$\{/);
    expect(filled).toContain("version: 0.4.0");
    expect(filled).toContain("src: /tmp/b/rmk-server-0.4.0-linux-x64\n    dst: /opt/rmk-server");
    expect(filled).toContain("postinstall: /repo/packaging/linux/scripts/postinstall.sh");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: nfpm.yaml's placeholders, as text.
    expect(() => fillTemplate("a: ${NOPE}", {})).toThrow("${NOPE}");
  });

  it("asks for glibc 2.34 and GCC 11's libstdc++ in both formats (084)", () => {
    const template = readFileSync(
      fileURLToPath(new URL("../../../packaging/linux/nfpm.yaml", import.meta.url)),
      "utf8",
    );
    expect(template).toContain("- libc6 (>= 2.34)");
    expect(template).toContain("- libstdc++6 (>= 11)");
    expect(template).toContain("- libc.so.6(GLIBC_2.34)(64bit)");
    expect(template).toContain("- libstdc++.so.6(GLIBCXX_3.4.29)(64bit)");
  });
});
