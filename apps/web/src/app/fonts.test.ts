import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("./fonts/", import.meta.url);
const readme = readFileSync(new URL("README.md", dir), "utf8");

describe("self-hosted fonts", () => {
  it.each(["manrope/Manrope-Variable.ttf", "ibm-plex-mono/IBMPlexMono-Var-Roman.woff2"])(
    "%s ships with its OFL text and matches the checksum in fonts/README.md",
    (file) => {
      const folder = file.split("/")[0];
      const license = readFileSync(new URL(`${folder}/OFL.txt`, dir), "utf8");
      expect(license).toContain("SIL Open Font License, Version 1.1");

      const sha = createHash("sha256")
        .update(readFileSync(new URL(file, dir)))
        .digest("hex");
      expect(readme).toContain(sha);
    },
  );

  it("loads nothing from a font service", () => {
    const loader = readFileSync(new URL("./fonts.ts", import.meta.url), "utf8");
    expect(loader).toContain("next/font/local");
    expect(loader).not.toMatch(/next\/font\/google|fonts\.googleapis|gstatic/);
    expect(existsSync(new URL("manrope/OFL.txt", dir))).toBe(true);
  });
});
