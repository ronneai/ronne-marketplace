import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import type { TestDb } from "../../../db/testing/test-db";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { UNFILTERED } from "../../workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";

/** Rows for the shelves' database tests (feature 125): users, workspaces and items. */
export const seedUser = async (t: TestDb, name = "Uma") => {
  const id = newId();
  const at = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("user")
    .values({
      id,
      name,
      email: `${id.toLowerCase()}@example.com`,
      email_verified: 0 as never,
      created_at: at,
      updated_at: at,
      role: "user",
    } as never)
    .execute();
  return id;
};

export const seedWorkspace = (
  t: TestDb,
  name: string,
  visibility: "public" | "private" = "public",
) =>
  kyselyWorkspaceRepository(t.db, t.dialect).insert({
    name,
    description: name,
    visibility,
    createdBy: null,
    createdAt: new Date(),
  });

/** An item in a new scope of the workspace (the global one by default). */
export const seedItem = async (t: TestDb, name: string, workspaceId = GLOBAL_WORKSPACE_ID) => {
  const scopeId = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id: scopeId,
      name: `s-${name}`,
      description: name,
      created_by: null,
      created_at: toDbDate(new Date(), t.dialect),
      workspace_id: workspaceId,
    })
    .execute();
  return kyselyItemRepository(t.db, t.dialect, UNFILTERED).insertItem({
    scopeId,
    name,
    type: "skill",
    description: name,
    ownerId: null,
    createdAt: new Date(),
  });
};

/** A released item (one version, tagged `latest`) in an existing scope, so the catalogue lists it. */
export const seedReleasedItem = async (
  t: TestDb,
  scopeName: string,
  name: string,
  publishedBy: string,
) => {
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  const scope = await t.db
    .selectFrom("scopes")
    .select("id")
    .where("name", "=", scopeName)
    .executeTakeFirstOrThrow();
  const itemId = await items.insertItem({
    scopeId: scope.id,
    name,
    type: "skill",
    description: `The ${name} item.`,
    ownerId: null,
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name: `@${scopeName}/${name}`, description: `The ${name} item.` },
    readme: null,
    files: [],
    notes: null,
    artifactPath: `${scopeName}/${name}/1.0.0.tgz`,
    sha256: "0".repeat(64),
    size: 1,
    publishedBy,
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
  return { itemId, versionId };
};
