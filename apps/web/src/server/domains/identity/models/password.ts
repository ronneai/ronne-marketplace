import { InvalidPasswordError } from "../exceptions/errors";

/** Password length rules, following NIST SP 800-63B: a minimum length and no composition rules. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Throws InvalidPasswordError when the password is too short or too long. Counts characters, not bytes. */
export const validatePassword = (password: string): void => {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH)
    throw new InvalidPasswordError("too_short", PASSWORD_MIN_LENGTH);
  if (length > PASSWORD_MAX_LENGTH) throw new InvalidPasswordError("too_long", PASSWORD_MAX_LENGTH);
};
