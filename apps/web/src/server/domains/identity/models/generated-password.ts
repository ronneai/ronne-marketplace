import { randomInt } from "node:crypto";

/**
 * Letters and digits without the ones people misread when copying by hand: 0, O and o; 1, l and I.
 * 56 characters, so 20 of them carry about 116 bits.
 */
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const GENERATED_PASSWORD_LENGTH = 20;

/** A new random password for root to hand over (008). Each character from `crypto.randomInt`. */
export const generatePassword = (length: number = GENERATED_PASSWORD_LENGTH): string => {
  let password = "";
  for (let i = 0; i < length; i++)
    password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return password;
};
