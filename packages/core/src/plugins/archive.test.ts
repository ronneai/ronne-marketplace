import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { PluginArchiveError, pluginArchive, readPluginArchive } from "./archive.js";

const encoder = new TextEncoder();
const file = (path: string, text: string, executable?: boolean) => ({
  path,
  bytes: encoder.encode(text),
  executable,
});

/** Each central directory entry's name and Unix mode, read from the zip's bytes. */
const modes = (zip: Uint8Array): Record<string, number> => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out: Record<string, number> = {};
  for (let i = 0; i + 46 <= zip.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(zip.subarray(i + 46, i + 46 + nameLength));
    out[name] = view.getUint32(i + 38, true) >>> 16;
  }
  return out;
};

describe("pluginArchive", () => {
  const files = [
    file("skills/a/SKILL.md", "# A\n"),
    file("hooks/a/run.sh", "#!/bin/sh\n", true),
    file(".claude-plugin/plugin.json", "{}\n"),
  ];

  it("gives the same bytes and SHA-256 for the same files, in any order", async () => {
    const one = await pluginArchive(files);
    const two = await pluginArchive([...files].reverse());
    expect(two.sha256).toBe(one.sha256);
    expect(two.bytes).toEqual(one.bytes);
    expect(one.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("unzips to the same files, sorted, with their modes", async () => {
    const { bytes } = await pluginArchive(files);
    const unzipped = unzipSync(bytes);
    expect(Object.keys(unzipped)).toEqual([
      ".claude-plugin/plugin.json",
      "hooks/a/run.sh",
      "skills/a/SKILL.md",
    ]);
    expect(new TextDecoder().decode(unzipped["skills/a/SKILL.md"])).toBe("# A\n");
    expect(modes(bytes)).toEqual({
      ".claude-plugin/plugin.json": 0o100644,
      "hooks/a/run.sh": 0o100755,
      "skills/a/SKILL.md": 0o100644,
    });
  });

  it("refuses a path that would leave the plugin, or the same path twice", async () => {
    await expect(pluginArchive([file("../x", "")])).rejects.toThrow();
    await expect(pluginArchive([file("a", ""), file("a", "")])).rejects.toThrow();
  });
});

describe("readPluginArchive (078)", () => {
  it("reads a plugin zip back to the same files, sorted, executables kept", async () => {
    const files = [
      file("skills/a/SKILL.md", "# A\n"),
      file("hooks/a/run.sh", "#!/bin/sh\n", true),
      file(".claude-plugin/plugin.json", "{}\n"),
    ];
    const { bytes } = await pluginArchive(files);
    expect(readPluginArchive(bytes)).toEqual([
      { path: ".claude-plugin/plugin.json", bytes: encoder.encode("{}\n") },
      { path: "hooks/a/run.sh", bytes: encoder.encode("#!/bin/sh\n"), executable: true },
      { path: "skills/a/SKILL.md", bytes: encoder.encode("# A\n") },
    ]);
  });

  it("refuses a path that could leave the plugin's folder, and bytes that aren't a zip", async () => {
    const { zipSync } = await import("fflate");
    const evil = zipSync({ "../outside.sh": encoder.encode("x") });
    expect(() => readPluginArchive(evil)).toThrow(PluginArchiveError);
    expect(() => readPluginArchive(encoder.encode("not a zip at all, sorry"))).toThrow(
      PluginArchiveError,
    );
  });
});
