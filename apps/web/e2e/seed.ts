// Adds the end-to-end test users, and a scope, to the instance that setup just created (DATABASE_URL). Run by
// the harness with tsx; root comes from setup itself.
import { createDb } from "../src/server/db/create-db";
import { argon2PasswordHasher } from "../src/server/domains/identity/repositories/argon2-password-hasher";
import { kyselyIdentityRepository } from "../src/server/domains/identity/repositories/kysely-identity-repository";
import { kyselyScopeRepository } from "../src/server/domains/items/repositories/kysely-scope-repository";
import { E2E_NAMES, E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { db, dialect } = createDb(url);
const repo = kyselyIdentityRepository(db, dialect);
const passwordHash = await argon2PasswordHasher.hash(E2E_PASSWORD);
for (const [key, email] of Object.entries(E2E_USERS) as [keyof typeof E2E_USERS, string][]) {
  if (key === "root") continue;
  await repo.createUserWithPassword(
    { email, name: E2E_NAMES[key], role: "user", passwordHash },
    new Date(),
  );
}
await kyselyScopeRepository(db, dialect).insert({
  name: E2E_SCOPE,
  description: "Created by the end-to-end seed.",
  createdBy: null,
  createdAt: new Date(),
});
await db.destroy();
