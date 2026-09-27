import type { DatabaseDialect } from "../db/url";

export type DatabaseAnswers =
  | { dialect: "sqlite"; path: string }
  | {
      dialect: "mysql" | "postgres";
      host: string;
      port: string;
      database: string;
      user: string;
      password: string;
    };

export const DEFAULT_PORTS: Record<Exclude<DatabaseDialect, "sqlite">, string> = {
  mysql: "3306",
  postgres: "5432",
};
export const DEFAULT_SQLITE_PATH = "./data/ronne.db";

/**
 * Builds DATABASE_URL from setup's answers. The user, password and database name are URL-encoded,
 * so characters such as @, :, / or # in a password can't break the URL.
 */
export function buildDatabaseUrl(answers: DatabaseAnswers): string {
  if (answers.dialect === "sqlite") return `file:${answers.path}`;
  const credentials = `${encodeURIComponent(answers.user)}:${encodeURIComponent(answers.password)}`;
  const host =
    answers.host.includes(":") && !answers.host.startsWith("[")
      ? `[${answers.host}]`
      : answers.host;
  return `${answers.dialect}://${credentials}@${host}:${answers.port}/${encodeURIComponent(answers.database)}`;
}
