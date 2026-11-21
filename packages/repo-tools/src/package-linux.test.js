import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleInfo, fillTemplate, NFPM_ARCH } from "./package-linux.js";

const script = (name) =>
  readFileSync(
    fileURLToPath(new URL(`../../../packaging/linux/scripts/${name}`, import.meta.url)),
    "utf8",
  );
const SCRIPTS = ["postinstall.sh", "preremove.sh", "postremove.sh"];
/**
 * The `depends` list of one format in `nfpm.yaml`'s top-level `overrides`, read line by line
 * (repo-tools has no YAML parser): only inside `overrides:` (a copy of the block elsewhere, in the
 * description say, doesn't count), and a commented-out entry, or one under `suggests`, isn't in it.
 * `undefined` when there's no `overrides:`, or the format has two `depends:`.
 */
const dependsOf = (template, format) => {
  const lines = template.split("\n");
  const top = lines.indexOf("overrides:");
  if (top < 0) return undefined;
  const after = lines.findIndex((line, i) => i > top && /^\S/.test(line) && !line.startsWith("#"));
  const block = lines.slice(top + 1, after < 0 ? undefined : after);
  const start = block.indexOf(`  ${format}:`);
  if (start < 0) return [];
  const next = block.findIndex(
    (line, i) => i > start && /^ {2}\S/.test(line) && !/^\s*#/.test(line),
  );
  const own = block.slice(start + 1, next < 0 ? undefined : next);
  const list = own.indexOf("    depends:");
  if (list < 0) return [];
  // YAML refuses a key twice, and so would nFPM: never pick one of two lists.
  if (own.lastIndexOf("    depends:") !== list) return undefined;
  const items = [];
  for (const line of own.slice(list + 1)) {
    if (/^\s*#/.test(line)) continue;
    const item = line.match(/^ {6}- (.+)$/);
    if (!item) break;
    items.push(item[1]);
  }
  return items;
};
/** The `wrapped` function a script defines, as text. */
const wrappedOf = (text) => text.match(/^wrapped\(\) \{\n[\s\S]*?\n\}\n/m)?.[0];

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

  it("asks for glibc 2.34, GCC 11's libstdc++ and libatomic in both formats (084, 188)", () => {
    const template = readFileSync(
      fileURLToPath(new URL("../../../packaging/linux/nfpm.yaml", import.meta.url)),
      "utf8",
    );
    expect(dependsOf(template, "deb")).toEqual([
      "libc6 (>= 2.34)",
      "libstdc++6 (>= 11)",
      "libatomic1",
    ]);
    expect(dependsOf(template, "rpm")).toEqual([
      "libc.so.6(GLIBC_2.34)(64bit)",
      "libstdc++.so.6(GLIBCXX_3.4.29)(64bit)",
      "libatomic.so.1()(64bit)",
    ]);
  });

  it("reads only a format's own depends list, not comments, suggests or a copy elsewhere", () => {
    const template = [
      "description: |-",
      "  A copy of the block, as text:",
      "  deb:",
      "    depends:",
      "      - decoy",
      "overrides:",
      "  deb:",
      "    depends:",
      "      - libc6",
      "      # - libatomic1",
      "    suggests:",
      "      - caddy",
      "  rpm:",
      "    depends:",
      "      - libc.so.6",
      "after:",
      "  deb:",
      "    depends:",
      "      - decoy",
      "",
    ].join("\n");
    expect(dependsOf(template, "deb")).toEqual(["libc6"]);
    expect(dependsOf(template, "rpm")).toEqual(["libc.so.6"]);
    expect(dependsOf(template.replace("overrides:", "x-overrides:"), "deb")).toBeUndefined();
    const twice = template.replace("    suggests:\n      - caddy", "    depends:\n      - libc6");
    expect(dependsOf(twice, "deb")).toBeUndefined();
  });

  // dnf cuts each line a package script prints at 80 columns, its ">>> " prefix included.
  it("keeps every line the package scripts print within 76 columns", () => {
    for (const name of SCRIPTS) {
      const text = script(name);
      for (const [, , line] of text.matchAll(/^\s*echo (["'])(.*)\1$/gm))
        expect(line.length, `${name}: ${line}`).toBeLessThanOrEqual(76);
      // rmk-server's own messages are long: each call goes through wrapped, which folds them.
      for (const [line] of text.matchAll(/^.*"\$rmk" service.*$/gm))
        expect(line.trim(), name).toMatch(/^wrapped "\$rmk" service /);
      expect(text, `${name} runs rmk-server by its path, not through wrapped`).not.toMatch(
        /\/opt\/rmk-server\/bin\/rmk-server service/,
      );
      if (text.includes('"$rmk"'))
        expect(wrappedOf(text), name).toBe(wrappedOf(script(SCRIPTS[0])));
    }
  });

  it("folds a command's output at spaces to 76 columns and keeps its exit status", () => {
    const wrapped = wrappedOf(script("postinstall.sh"));
    expect(wrapped).toBeDefined();
    const message = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const run = spawnSync(
      "sh",
      [
        "-c",
        `${wrapped}wrapped sh -c 'echo "$1"; echo "an error" >&2; exit 3' sh "$1"`,
        "sh",
        message,
      ],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(3);
    const lines = run.stdout.trimEnd().split("\n");
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
    expect(lines.join("")).toBe(`${message}an error`);
    expect(execFileSync("sh", ["-n", "-c", wrapped ?? ""]).toString()).toBe("");
  });
});
