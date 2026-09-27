import { describe, expect, it } from "vitest";
import { InvalidTokenLifetimeError, InvalidTokenNameError } from "../exceptions/errors";
import {
  generateToken,
  hashToken,
  isTokenFormat,
  normalizeTokenName,
  parseTokenLifetime,
  tokenExpiry,
  tokenPreview,
  tokenStatus,
} from "./access-token";

describe("tokens", () => {
  it("are rmk_ and 43 base64url characters, and never repeat", () => {
    const tokens = Array.from({ length: 1000 }, generateToken);
    for (const token of tokens) {
      expect(token).toMatch(/^rmk_[A-Za-z0-9_-]{43}$/);
      expect(token).toHaveLength(47);
      expect(isTokenFormat(token)).toBe(true);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("are stored as a SHA-256 hex hash", () => {
    // printf "rmk_test" | shasum -a 256
    expect(hashToken("rmk_test")).toBe(
      "e544716fe251b8622f8a40ceb2e831c9ad546d9f8e78c0353454d20ab6f79134",
    );
    expect(hashToken(generateToken())).toMatch(/^[0-9a-f]{64}$/);
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });

  it("keep only rmk_ and 8 characters as a preview", () => {
    expect(tokenPreview("rmk_AbC1dEf2GhI3jKl4mNo5pQr6sTu7vWx8yZ9_0-abcdE")).toBe("rmk_AbC1dEf2");
  });

  it("refuse anything that isn't the format", () => {
    for (const value of [
      "",
      "rmk_",
      "rmk_short",
      `rmk_${"a".repeat(42)}`,
      `rmk_${"a".repeat(44)}`,
      `RMK_${"a".repeat(43)}`,
      `rmk_${"a".repeat(42)}=`,
      `rmk_${"a".repeat(42)}+`,
      `ghp_${"a".repeat(43)}`,
    ]) {
      expect(isTokenFormat(value), value).toBe(false);
    }
  });
});

describe("names and lifetimes", () => {
  it("trims names and allows 1 to 100 characters", () => {
    expect(normalizeTokenName("  laptop  ")).toBe("laptop");
    expect(normalizeTokenName("x".repeat(100))).toHaveLength(100);
    expect(() => normalizeTokenName("   ")).toThrow(InvalidTokenNameError);
    expect(() => normalizeTokenName("x".repeat(101))).toThrow(InvalidTokenNameError);
  });

  it("reads 30, 90 (the default), 365 and none", () => {
    expect(parseTokenLifetime(undefined)).toBe(90);
    expect(parseTokenLifetime("")).toBe(90);
    expect(parseTokenLifetime("30")).toBe(30);
    expect(parseTokenLifetime(365)).toBe(365);
    expect(parseTokenLifetime("none")).toBeNull();
    expect(parseTokenLifetime(null)).toBeNull();
    for (const bad of ["7", "0", "-1", "forever", "90.5"]) {
      expect(() => parseTokenLifetime(bad), bad).toThrow(InvalidTokenLifetimeError);
    }
  });

  it("works out the expiry and the status", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(tokenExpiry(90, now)).toEqual(new Date("2026-12-26T12:00:00Z"));
    expect(tokenExpiry(null, now)).toBeNull();

    const expiresAt = new Date("2026-09-28T12:00:00Z");
    expect(tokenStatus({ expiresAt, revokedAt: null }, now)).toBe("active");
    expect(tokenStatus({ expiresAt, revokedAt: null }, expiresAt)).toBe("expired");
    expect(tokenStatus({ expiresAt: null, revokedAt: null }, now)).toBe("active");
    expect(tokenStatus({ expiresAt, revokedAt: now }, now)).toBe("revoked");
  });
});
