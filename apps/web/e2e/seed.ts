// Adds the end-to-end test users, and a scope, to the instance that setup just created (DATABASE_URL). Run by
// the harness with tsx; root comes from setup itself.
import { createDb } from "../src/server/db/create-db";
import { argon2PasswordHasher } from "../src/server/domains/identity/repositories/argon2-password-hasher";
import { kyselyIdentityRepository } from "../src/server/domains/identity/repositories/kysely-identity-repository";
import { kyselyItemRepository } from "../src/server/domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../src/server/domains/items/repositories/kysely-scope-repository";
import {
  E2E_MODERATORS,
  E2E_NAMES,
  E2E_PASSWORD,
  E2E_SCOPE,
  E2E_USERS,
  E2E_VERSIONED_ITEM,
} from "./users";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { db, dialect } = createDb(url);
const repo = kyselyIdentityRepository(db, dialect);
const passwordHash = await argon2PasswordHasher.hash(E2E_PASSWORD);
const ids: Partial<Record<keyof typeof E2E_USERS, string>> = {};
for (const [key, email] of Object.entries(E2E_USERS) as [keyof typeof E2E_USERS, string][]) {
  if (key === "root") continue;
  ids[key] = await repo.createUserWithPassword(
    {
      email,
      name: E2E_NAMES[key],
      role: E2E_MODERATORS.includes(key) ? "moderator" : "user",
      passwordHash,
    },
    new Date(),
  );
}
const scopeId = await kyselyScopeRepository(db, dialect).insert({
  name: E2E_SCOPE,
  description: "Created by the end-to-end seed.",
  createdBy: null,
  createdAt: new Date(),
});

// Two published versions, recorded directly: the Versions page manages them (feature 016).
const items = kyselyItemRepository(db, dialect);
const itemId = await items.insertItem({
  scopeId,
  name: E2E_VERSIONED_ITEM,
  type: "rule",
  description: "Published twice by the end-to-end seed.",
  ownerId: ids.releaser ?? "",
  createdAt: new Date(),
});
let latest = "";
for (const version of ["1.0.0", "1.1.0"])
  latest = await items.insertVersion({
    itemId,
    version,
    manifest: {},
    readme: null,
    files: [],
    notes: null,
    artifactPath: `${E2E_SCOPE}/${E2E_VERSIONED_ITEM}/${version}.tgz`,
    sha256: "0".repeat(64),
    size: 512,
    publishedBy: ids.releaser ?? "",
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
await items.setTag(itemId, "latest", latest);
await db.destroy();
