import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The audit log is insert-only (spec 007): nothing in the app may update or delete its rows. This
 * reads every source file outside the migrations and fails on a Kysely or SQL update or delete of
 * audit_log. Test files are skipped, and so is this one.
 *
 * The one kind of exception is personal data (MVP §15, Personal data; feature 102): the events
 * stay for ever, but an IP address or a typed email in them is kept only as long as root's
 * retention says. The files allowed to update `audit_log` are listed here by name, each with what
 * it may change; nothing deletes a row, and no other file is allowed.
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

/** Files allowed to update (never delete) audit_log rows, and what they change. */
const ALLOWED_UPDATES: Record<string, string> = {
  "src/server/jobs/retention-purge.ts":
    "clears ip_address past the IP retention, and the typed email of a failed sign-in (102)",
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

  it("has no update or delete of audit_log outside the migrations and the allowed files", () => {
    const offenders = files.flatMap((file) =>
      relative(appDir, file) in ALLOWED_UPDATES
        ? []
        : offendingLines(readFileSync(file, "utf8")).map(
            (line) => `${relative(appDir, file)}: ${line.trim()}`,
          ),
    );
    expect(offenders).toEqual([]);
  });

  it("lets the allowed files update audit_log, never delete from it", () => {
    for (const file of Object.keys(ALLOWED_UPDATES)) {
      const source = readFileSync(join(appDir, file), "utf8");
      const lines = offendingLines(source);
      expect(lines.length, file).toBeGreaterThan(0);
      expect(lines.filter((line) => /deleteFrom|delete\s+from|truncate|drop/i.test(line))).toEqual(
        [],
      );
    }
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
