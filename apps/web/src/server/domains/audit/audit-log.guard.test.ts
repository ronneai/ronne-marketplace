import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The audit log is insert-only (spec 007): nothing in the app may update or delete its rows. This
 * reads every source file outside the migrations and fails on a Kysely or SQL update or delete of
 * audit_log. Test files are skipped, and so is this one.
 */
const appDir = new URL("../../../../", import.meta.url).pathname;
const roots = ["src", "scripts", "e2e"].map((d) => join(appDir, d));
const migrationsDir = join(appDir, "src/server/db/migrations");

const sourceFiles = (dir: string): string[] => {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return path === migrationsDir ? [] : sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
};

const FORBIDDEN = [
  /\.(updateTable|deleteFrom|replaceInto|mergeInto)\(\s*["'`]audit_log["'`]/,
  /\b(update|delete\s+from|truncate(\s+table)?|drop\s+table)\s+["'`]?audit_log\b/i,
];

const offendingLines = (source: string): string[] => {
  return source.split("\n").filter((line) => FORBIDDEN.some((pattern) => pattern.test(line)));
};

describe("audit_log is insert-only", () => {
  const files = roots.flatMap((root) => {
    try {
      return sourceFiles(root);
    } catch {
      return [];
    }
  });

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no update or delete of audit_log outside the migrations", () => {
    const offenders = files.flatMap((file) =>
      offendingLines(readFileSync(file, "utf8")).map(
        (line) => `${relative(appDir, file)}: ${line.trim()}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("catches the forms it's meant to", () => {
    for (const bad of [
      'db.updateTable("audit_log").set({ action: "x" })',
      "trx.deleteFrom('audit_log').execute()",
      "sql`update audit_log set action = ''`",
      'sql`DELETE FROM "audit_log"`',
      "sql`truncate table audit_log`",
    ]) {
      expect(offendingLines(bad), bad).toHaveLength(1);
    }
    expect(offendingLines('db.insertInto("audit_log").values(row)')).toEqual([]);
    expect(offendingLines('db.selectFrom("audit_log")')).toEqual([]);
  });
});
