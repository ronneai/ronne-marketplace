import { describe, expect, it } from "vitest";
import {
  formatUserCode,
  generateDeviceCode,
  generateUserCode,
  hashDeviceCode,
  normalizeUserCode,
  USER_CODE_ALPHABET,
} from "./device-grant";

describe("user codes", () => {
  it("has 31 characters without look-alikes", () => {
    expect(USER_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(USER_CODE_ALPHABET).size).toBe(31);
    for (const c of "01ILO") expect(USER_CODE_ALPHABET).not.toContain(c);
  });

  it("draws 8 characters from the alphabet, every one of them in time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateUserCode();
      expect(code).toMatch(new RegExp(`^[${USER_CODE_ALPHABET}]{8}$`));
      for (const c of code) seen.add(c);
    }
    expect(seen.size).toBe(31);
  });

  it("reads typed codes in any case, with spaces or a dash, and refuses anything else", () => {
    expect(normalizeUserCode(" wdjb-mjht ")).toBe("WDJBMJHT");
    expect(normalizeUserCode("WDJB MJHT")).toBe("WDJBMJHT");
    expect(formatUserCode("WDJBMJHT")).toBe("WDJB-MJHT");
    for (const bad of [
      "WDJB-MJH",
      "WDJB-MJHTX",
      "WDJB-MJH0",
      "WDJB-MJHL",
      "WDJB-MJH!",
      "ＷDJBMJHT",
      "",
    ])
      expect(normalizeUserCode(bad)).toBeNull();
  });
});

describe("device codes", () => {
  it("are 32 random bytes in base64url, stored as a SHA-256 hash", () => {
    const code = generateDeviceCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateDeviceCode()).not.toBe(code);
    expect(hashDeviceCode(code)).toMatch(/^[0-9a-f]{64}$/);
  });
});
