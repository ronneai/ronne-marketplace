import { describe, expect, it } from "vitest";
import {
  GENERATED_PASSWORD_LENGTH,
  generatePassword,
  PASSWORD_ALPHABET,
} from "./generated-password";
import { validatePassword } from "./password";

describe("generatePassword", () => {
  it("has no look-alike characters, and 56 distinct ones", () => {
    expect(new Set(PASSWORD_ALPHABET).size).toBe(56);
    expect(PASSWORD_ALPHABET).not.toMatch(/[0Oo1lI]/);
  });

  it("makes 20 characters from the alphabet, which pass 003's rules", () => {
    const password = generatePassword();
    expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect([...password].every((c) => PASSWORD_ALPHABET.includes(c))).toBe(true);
    expect(() => validatePassword(password)).not.toThrow();
  });

  it("doesn't repeat, and uses the whole alphabet, over many draws", () => {
    const draws = Array.from({ length: 2000 }, () => generatePassword());
    expect(new Set(draws).size).toBe(draws.length);
    const seen = new Set(draws.join(""));
    expect(seen.size).toBe(PASSWORD_ALPHABET.length);
  });
});
