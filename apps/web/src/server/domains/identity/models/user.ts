import { InvalidEmailError, InvalidNameError } from "../exceptions/errors";

export type Role = "root" | "moderator" | "user";

/** The signed-in person, as the rest of the app sees them. */
export type CurrentUser = { id: string; email: string; name: string; role: Role };

const ROLES: readonly Role[] = ["root", "moderator", "user"];

export const isRole = (value: unknown): value is Role => {
  return ROLES.includes(value as Role);
};

/** A user as root's admin list shows them. */
export type UserSummary = {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabledAt: Date | null;
  createdAt: Date;
};

export type RootAccount = { id: string; email: string; name: string; disabledAt: Date | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails are stored trimmed and lowercase, so the unique index works on every database. */
export const normalizeEmail = (email: string): string => {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 255 || !EMAIL.test(normalized)) throw new InvalidEmailError(email);
  return normalized;
};

export const normalizeName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 255) throw new InvalidNameError();
  return trimmed;
};
