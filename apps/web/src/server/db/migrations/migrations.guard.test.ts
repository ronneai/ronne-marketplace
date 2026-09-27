import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// MySQL 8.4 accepts inline column REFERENCES but silently ignores them: no foreign key is created.
// Every migration must use table-level .addForeignKeyConstraint() instead.
const dir = new URL("./", import.meta.url);
const migrationFiles = readdirSync(dir).filter(
  (f) => /^\d{4}_.+\.ts$/.test(f) && !f.includes(".test."),
);

describe("migrations", () => {
  it("finds the migration files", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it.each(migrationFiles)("%s declares foreign keys as table-level constraints", (file) => {
    const source = readFileSync(new URL(file, dir), "utf8");
    expect(
      source,
      `${file} uses inline .references(); use .addForeignKeyConstraint() instead`,
    ).not.toMatch(/\.references\(/);
  });
});
