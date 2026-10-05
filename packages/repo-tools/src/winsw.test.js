import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sha256File, WINSW, WINSW_PATH } from "./winsw.js";

describe("WinSW's pin (086)", () => {
  it("names one release, one file and its SHA-256", () => {
    expect(WINSW.url).toBe(
      `https://github.com/winsw/winsw/releases/download/v${WINSW.version}/${WINSW.file}`,
    );
    expect(WINSW.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(WINSW_PATH).toBe("vendor/winsw/WinSW.NET461.exe");
  });

  it("matches the copy the pack step downloaded, when there is one", () => {
    const copy = new URL(`../../server/${WINSW_PATH}`, import.meta.url);
    if (existsSync(copy)) expect(sha256File(copy)).toBe(WINSW.sha256);
  });
});
