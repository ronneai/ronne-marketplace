import { InvalidEmailError, InvalidNameError } from "../exceptions/errors";

export type Role = "root" | "moderator" | "user";

export type RootAccount = { id: string; email: string; name: string; disabledAt: Date | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails are stored trimmed and lowercase, so the unique index works on every database. */
export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 255 || !EMAIL.test(normalized)) throw new InvalidEmailError(email);
  return normalized;
}

export function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 255) throw new InvalidNameError();
  return trimmed;
}
