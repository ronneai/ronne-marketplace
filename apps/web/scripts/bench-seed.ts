// The data set the benchmarks seed (079, 099): skills with a small artifact each, as an instance
// with that many items would hold them, in a throwaway database from createTestDb.
import { packItem } from "@ronneai/core/pack";
import { toDbDate } from "../src/server/db/dates";
import { GLOBAL_WORKSPACE_ID } from "../src/server/db/migrations/0019_workspaces";
import type { createTestDb } from "../src/server/db/testing/test-db";
import { createRoot } from "../src/server/domains/identity/actions/root-account";
import { kyselyItemRepository } from "../src/server/domains/items/repositories/kysely-item-repository";
import { UNFILTERED } from "../src/server/domains/workspaces/models/viewer";
import { localStorage } from "../src/server/storage/local-storage";

/** The local servers from docker/test-databases.compose.yml, as scripts/test-db.mjs uses them. */
export const SERVERS: Record<string, string | undefined> = {
  sqlite: undefined,
  postgres: "postgres://postgres:ronne-test@127.0.0.1:54315/postgres",
  mysql: "mysql://root:ronne-test@127.0.0.1:53384/ronne",
};

const text = (value: string) => new TextEncoder().encode(value);

/** About as long as a real description: entries are then about the size the spec assumes. */
export const DESCRIPTION =
  "Checks code for common security mistakes such as injection, unsafe deserialisation and leaked secrets. Use when writing or reviewing code that handles input.";

/** Seeds `count` skills, each released as 1.0.0 with its artifact in a storage folder at `root`. */
export const seedSkills = async (
  t: Awaited<ReturnType<typeof createTestDb>>,
  root: string,
  count: number,
) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const now = new Date();
  const { id: publisher } = await createRoot(t.db, t.dialect, {
    email: "bench@example.com",
    name: "Bench",
    password: "correct horse battery",
  });
  await t.db
    .insertInto("scopes")
    .values({
      id: "bench-scope",
      name: "bench",
      description: "",
      created_by: null,
      created_at: toDbDate(now, t.dialect),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
  const storage = localStorage(root);
  for (let i = 0; i < count; i++) {
    const name = `skill-${String(i).padStart(5, "0")}`;
    const manifest = `name: "@bench/${name}"\ntype: skill\ndescription: ${DESCRIPTION}\nskill:\n  entry: SKILL.md\n`;
    const files = [
      { path: "ronne.yaml", bytes: text(manifest) },
      { path: "SKILL.md", bytes: text(`---\nname: ${name}\ndescription: A skill.\n---\nDo it.\n`) },
    ];
    const packed = await packItem(files, { version: "1.0.0" });
    const artifactPath = `bench/${name}/1.0.0.tgz`;
    await storage.put(artifactPath, packed.tgz);
    await items.transaction(async (repo) => {
      const itemId = await repo.insertItem({
        scopeId: "bench-scope",
        name,
        type: "skill",
        description: DESCRIPTION,
        ownerId: null,
        createdAt: now,
      });
      const versionId = await repo.insertVersion({
        itemId,
        version: "1.0.0",
        manifest: {
          name: `@bench/${name}`,
          type: "skill",
          description: DESCRIPTION,
          version: "1.0.0",
        },
        readme: null,
        files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
        notes: null,
        artifactPath,
        sha256: packed.sha256,
        size: packed.size,
        publishedBy: publisher,
        publishedAt: now,
        submissionId: null,
        dependencies: [],
        riskFlags: [],
      });
      await repo.setTag(itemId, "latest", versionId);
    });
  }
  return storage;
};
