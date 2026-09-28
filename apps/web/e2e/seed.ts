// Adds the end-to-end test users, and a scope, to the instance that setup just created (DATABASE_URL). Run by
// the harness with tsx; root comes from setup itself.
import { packItem } from "@ronneai/core/pack";
import { createDb } from "../src/server/db/create-db";
import { argon2PasswordHasher } from "../src/server/domains/identity/repositories/argon2-password-hasher";
import { kyselyIdentityRepository } from "../src/server/domains/identity/repositories/kysely-identity-repository";
import { kyselyItemRepository } from "../src/server/domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../src/server/domains/items/repositories/kysely-scope-repository";
import { localStorage } from "../src/server/storage/local-storage";
import {
  E2E_MODERATORS,
  E2E_NAMES,
  E2E_PASSWORD,
  E2E_PROPOSAL_ITEM,
  E2E_SCOPE,
  E2E_SKILL,
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

// A skill with a README, for the catalogue and the item page (feature 018).
const skillId = await items.insertItem({
  scopeId,
  name: E2E_SKILL,
  type: "skill",
  description: "Finds leaked secrets and other security mistakes.",
  ownerId: ids.releaser ?? "",
  createdAt: new Date(),
});
const skillVersion = await items.insertVersion({
  itemId: skillId,
  version: "1.0.0",
  manifest: {
    name: `@${E2E_SCOPE}/${E2E_SKILL}`,
    type: "skill",
    description: "Finds leaked secrets and other security mistakes.",
    license: "MIT",
    keywords: ["security", "owasp"],
  },
  readme: "# Secret scanner\n\nReviews your changes for **leaked secrets** and injection.\n",
  files: [
    { path: "README.md", size: 70, executable: false },
    { path: "SKILL.md", size: 300, executable: false },
    { path: "ronne.yaml", size: 150, executable: false },
  ],
  notes: null,
  artifactPath: `${E2E_SCOPE}/${E2E_SKILL}/1.0.0.tgz`,
  sha256: "1".repeat(64),
  size: 900,
  publishedBy: ids.releaser ?? "",
  publishedAt: new Date(),
  submissionId: null,
  dependencies: [],
  riskFlags: [],
});
await items.setTag(skillId, "latest", skillVersion);

// A skill released as 1.0.0 with a real artifact in storage, which a change proposal starts from
// (feature 017).
const storagePath = process.env.STORAGE_PATH;
if (!storagePath) throw new Error("STORAGE_PATH is required");
const description = "Prompts for writing good commit messages.";
const kitFiles = {
  "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}"\ntype: skill\ndescription: ${description}\nlicense: MIT\nskill:\n  entry: SKILL.md\n`,
  "SKILL.md": `---\nname: ${E2E_PROPOSAL_ITEM}\ndescription: ${description}\n---\n\nWrite the why, not the what.\n`,
  "README.md": "# Prompt kit\n\nThe first version.\n",
};
const kit = await packItem(
  Object.entries(kitFiles).map(([path, text]) => ({ path, bytes: new TextEncoder().encode(text) })),
  { version: "1.0.0" },
);
const kitPath = `${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}/1.0.0.tgz`;
await localStorage(storagePath).put(kitPath, kit.tgz);
const kitId = await items.insertItem({
  scopeId,
  name: E2E_PROPOSAL_ITEM,
  type: "skill",
  description,
  ownerId: ids.releaser ?? "",
  createdAt: new Date(),
});
const kitVersion = await items.insertVersion({
  itemId: kitId,
  version: "1.0.0",
  manifest: {
    name: `@${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}`,
    type: "skill",
    description,
    license: "MIT",
  },
  readme: kitFiles["README.md"],
  files: Object.entries(kitFiles).map(([path, text]) => ({
    path,
    size: text.length,
    executable: false,
  })),
  notes: null,
  artifactPath: kitPath,
  sha256: kit.sha256,
  size: kit.size,
  publishedBy: ids.releaser ?? "",
  publishedAt: new Date(),
  submissionId: null,
  dependencies: [],
  riskFlags: [],
});
await items.setTag(kitId, "latest", kitVersion);
await db.destroy();
