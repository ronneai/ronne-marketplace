import { describe, expect, it } from "vitest";
import { InvalidEmailError, InvalidNameError, InvalidPasswordError } from "../exceptions/errors";
import { validatePassword } from "./password";
import { normalizeEmail, normalizeName } from "./user";

describe("validatePassword", () => {
  it.each(["a".repeat(12), "a".repeat(128), "correct horse battery", "ééééééééééééé"])(
    "accepts %j",
    (password) => {
      expect(() => validatePassword(password)).not.toThrow();
    },
  );

  it("rejects 11 characters as too short, and 129 as too long", () => {
    expect(() => validatePassword("a".repeat(11))).toThrowError(InvalidPasswordError);
    expect(() => validatePassword("a".repeat(129))).toThrowError(/at most 128/);
  });

  it("counts characters, not bytes", () => {
    expect(() => validatePassword("🔑".repeat(12))).not.toThrow();
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Root@Example.COM ")).toBe("root@example.com");
  });

  it.each(["", "root", "root@", "@example.com", "root@example", "ro ot@example.com"])(
    "rejects %j",
    (email) => {
      expect(() => normalizeEmail(email)).toThrowError(InvalidEmailError);
    },
  );
});

describe("normalizeName", () => {
  it("trims, and rejects empty or over-long names", () => {
    expect(normalizeName("  Root  ")).toBe("Root");
    expect(() => normalizeName("   ")).toThrowError(InvalidNameError);
    expect(() => normalizeName("x".repeat(256))).toThrowError(InvalidNameError);
  });
});
