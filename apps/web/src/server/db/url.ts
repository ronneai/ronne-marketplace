import { isAbsolute, resolve } from "node:path";

export type DatabaseDialect = "sqlite" | "mysql" | "postgres";

export type DatabaseConfig =
  | { dialect: "sqlite"; filename: string }
  | { dialect: "mysql"; uri: string }
  | { dialect: "postgres"; connectionString: string };

export const SUPPORTED_URL_FORMATS = [
  "file:./data/ronne.db (SQLite)",
  "mysql://user:password@host:3306/database (MySQL or MariaDB)",
  "postgres://user:password@host:5432/database (PostgreSQL)",
] as const;

export class UnsupportedDatabaseUrlError extends Error {
  constructor(url: string) {
    super(
      `Unsupported DATABASE_URL "${redactDatabaseUrl(url)}". Use one of:\n${SUPPORTED_URL_FORMATS.map((f) => `  ${f}`).join("\n")}`,
    );
    this.name = "UnsupportedDatabaseUrlError";
  }
}

/** Hides the password in a database URL, so it's safe to show in errors and logs. */
export function redactDatabaseUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/@]*:)[^@]*@/i, "$1***@");
}

/**
 * Turns DATABASE_URL into driver settings. SQLite paths are resolved against `baseDir`
 * (the app root); `file::memory:` opens an in-memory database.
 */
export function parseDatabaseUrl(url: string, baseDir: string = process.cwd()): DatabaseConfig {
  const trimmed = url.trim();

  if (trimmed.startsWith("file:")) {
    const path = trimmed.slice("file:".length);
    if (path === "") throw new UnsupportedDatabaseUrlError(url);
    if (path === ":memory:") return { dialect: "sqlite", filename: ":memory:" };
    return { dialect: "sqlite", filename: isAbsolute(path) ? path : resolve(baseDir, path) };
  }
  if (/^mysql:\/\/[^/]+\/[^/?]+/.test(trimmed)) {
    return { dialect: "mysql", uri: trimmed };
  }
  if (/^postgres(ql)?:\/\/[^/]+\/[^/?]+/.test(trimmed)) {
    return { dialect: "postgres", connectionString: trimmed };
  }
  throw new UnsupportedDatabaseUrlError(url);
}
