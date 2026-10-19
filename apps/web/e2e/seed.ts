// Adds the end-to-end test users, and a scope, to the instance that setup just created (DATABASE_URL). Run by
// the harness with tsx; root comes from setup itself.
import { packItem } from "@ronneai/core/pack";
import { parse } from "yaml";
import { createDb } from "../src/server/db/create-db";
import { toDbDate } from "../src/server/db/dates";
import { newId } from "../src/server/db/ids";
import { argon2PasswordHasher } from "../src/server/domains/identity/repositories/argon2-password-hasher";
import { kyselyIdentityRepository } from "../src/server/domains/identity/repositories/kysely-identity-repository";
import { kyselyItemRepository } from "../src/server/domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../src/server/domains/items/repositories/kysely-scope-repository";
import { dayOf, daysBefore } from "../src/server/domains/usage/models/usage-event";
import { kyselyUsageRepository } from "../src/server/domains/usage/repositories/kysely-usage-repository";
import { UNFILTERED } from "../src/server/domains/workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../src/server/domains/workspaces/models/workspace";
import { kyselyWorkspaceRepository } from "../src/server/domains/workspaces/repositories/kysely-workspace-repository";
import { localStorage } from "../src/server/storage/local-storage";
import {
  E2E_ACME,
  E2E_ACME_MEMBERS,
  E2E_DATA,
  E2E_DOOR,
  E2E_ERASE,
  E2E_FALLBACK_ITEMS,
  E2E_FOCUS,
  E2E_JOIN,
  E2E_JOIN_MODERATORS,
  E2E_LONG_SCOPE,
  E2E_MODERATORS,
  E2E_MOVE,
  E2E_NAMES,
  E2E_PASSWORD,
  E2E_PROPOSAL_ITEM,
  E2E_RENAME,
  E2E_RMK_ITEMS,
  E2E_ROOTS,
  E2E_SCOPE,
  E2E_SHELF,
  E2E_SKILL,
  E2E_TWIN,
  E2E_TWIN_OLD_NAME,
  E2E_USAGE_PEAK,
  E2E_USERS,
  E2E_VAULT,
  E2E_VERSIONED_ITEM,
  E2E_WORKSPACE,
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
      role: E2E_ROOTS.includes(key) ? "root" : "user",
      // Moderators of global, as every moderator was before workspaces (091).
      globalRole: E2E_MODERATORS.includes(key) ? "moderator" : "user",
      passwordHash,
    },
    new Date(),
  );
}
const scopeId = await kyselyScopeRepository(db, dialect, UNFILTERED).insert({
  name: E2E_SCOPE,
  description: "Created by the end-to-end seed.",
  workspaceId: GLOBAL_WORKSPACE_ID,
  createdBy: null,
  createdAt: new Date(),
});

await kyselyWorkspaceRepository(db, dialect).insert({
  name: E2E_WORKSPACE,
  description: "Created by the end-to-end seed.",
  visibility: "public",
  createdBy: null,
  createdAt: new Date(),
});

// A workspace with members (091), written directly until 092 adds them in the app.
const acmeId = await kyselyWorkspaceRepository(db, dialect).insert({
  name: E2E_ACME,
  description: "Acme's teams, for the end-to-end tests.",
  visibility: "public",
  createdBy: null,
  createdAt: new Date(),
});
for (const [key, role] of Object.entries(E2E_ACME_MEMBERS) as [keyof typeof E2E_USERS, string][]) {
  const now = toDbDate(new Date(), dialect);
  await db
    .insertInto("workspace_members")
    .values({
      workspace_id: acmeId,
      user_id: ids[key] ?? "",
      role: role as "moderator" | "user",
      added_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

// A workspace people ask to join (094), with each project's join moderator.
const joinId = await kyselyWorkspaceRepository(db, dialect).insert({
  name: E2E_JOIN,
  description: "Ask to join it, for the end-to-end tests.",
  visibility: "public",
  createdBy: null,
  createdAt: new Date(),
});
for (const key of E2E_JOIN_MODERATORS) {
  const now = toDbDate(new Date(), dialect);
  await db
    .insertInto("workspace_members")
    .values({
      workspace_id: joinId,
      user_id: ids[key] ?? "",
      role: "moderator",
      added_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

// Two published versions, recorded directly: the Versions page manages them (feature 016).
const items = kyselyItemRepository(db, dialect, UNFILTERED);
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
// Installs of 1.0.0 yesterday (047): enough usage for the Versions page and its dialogs to show it.
await kyselyUsageRepository(db, dialect, UNFILTERED).add([
  {
    itemId,
    day: daysBefore(dayOf(new Date()), 1),
    version: "1.0.0",
    tool: "claude-code",
    event: "install",
    trigger: "",
    outcome: "",
    count: 25,
  },
]);

const storagePath = process.env.STORAGE_PATH;
if (!storagePath) throw new Error("STORAGE_PATH is required");

// A skill with a README, for the catalogue and the item page (018), with a real artifact whose
// files the item page shows (044).
const skillManifest = {
  name: `@${E2E_SCOPE}/${E2E_SKILL}`,
  type: "skill",
  description: "Finds leaked secrets and other security mistakes.",
  license: "MIT",
  keywords: ["security", "owasp"],
};
const skillFiles = [
  {
    path: "README.md",
    text: "# Secret scanner\n\nReviews your changes for **leaked secrets** and injection.\n",
  },
  {
    path: "SKILL.md",
    text: `---\nname: ${E2E_SKILL}\ndescription: ${skillManifest.description}\n---\n\n# Scanning for secrets\n\nLook for keys, tokens and passwords in the diff.\n`,
  },
  {
    path: "ronne.yaml",
    text: `name: "${skillManifest.name}"\ntype: skill\ndescription: ${skillManifest.description}\nlicense: MIT\nkeywords: [security, owasp]\n`,
  },
].map((file) => ({ path: file.path, bytes: new TextEncoder().encode(file.text) }));
const skillPacked = await packItem(skillFiles, { version: "1.0.0" });
await localStorage(storagePath).put(`${E2E_SCOPE}/${E2E_SKILL}/1.0.0.tgz`, skillPacked.tgz);
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
  manifest: { ...skillManifest, version: "1.0.0" },
  readme: "# Secret scanner\n\nReviews your changes for **leaked secrets** and injection.\n",
  files: skillFiles.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
  notes: null,
  artifactPath: `${E2E_SCOPE}/${E2E_SKILL}/1.0.0.tgz`,
  sha256: skillPacked.sha256,
  size: skillPacked.size,
  publishedBy: ids.releaser ?? "",
  publishedAt: new Date(),
  submissionId: null,
  dependencies: [],
  riskFlags: [],
});
await items.setTag(skillId, "latest", skillVersion);

// Usage for the skill (047): runs over the last two weeks, the most 3 days ago, and installs, so its
// Overview shows the usage cards and the Usage card's peak.
const today = dayOf(new Date());
await kyselyUsageRepository(db, dialect, UNFILTERED).add([
  ...Array.from({ length: 14 }, (_, i) => ({
    itemId: skillId,
    day: daysBefore(today, i + 1),
    version: "1.0.0",
    tool: "claude-code",
    event: "run",
    trigger: i % 2 ? "user" : "model",
    outcome: "success",
    count: i === 2 ? E2E_USAGE_PEAK : 4,
  })),
  {
    itemId: skillId,
    day: daysBefore(today, 2),
    version: "1.0.0",
    tool: "cursor",
    event: "install",
    trigger: "",
    outcome: "",
    count: 6,
  },
]);

// A skill released as 1.0.0 with a real artifact in storage, which a change proposal starts from
// (feature 017).
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

// Items for `rmk` end to end (022, 023, 024): each with a real artifact, packed like a release.
const release = async (
  name: string,
  type: "agent" | "hook" | "mcp-server" | "rule",
  version: string,
  files: Record<string, string>,
  dependencies: { itemId: string; range: string }[] = [],
) => {
  const packed = await packItem(
    Object.entries(files).map(([path, text]) => ({ path, bytes: new TextEncoder().encode(text) })),
    { version },
  );
  const path = `${E2E_SCOPE}/${name}/${version}.tgz`;
  await localStorage(storagePath).put(path, packed.tgz);
  const existing = await items.findByName({ scope: E2E_SCOPE, name: name });
  const itemId =
    existing?.id ??
    (await items.insertItem({
      scopeId,
      name,
      type,
      description: `The ${name} item.`,
      ownerId: ids.releaser ?? "",
      createdAt: new Date(),
    }));
  const versionId = await items.insertVersion({
    itemId,
    version,
    // As a release stores it (015): the parsed ronne.yaml with its version.
    manifest: { ...parse(files["ronne.yaml"] ?? ""), version },
    readme: null,
    files: Object.entries(files).map(([p, text]) => ({
      path: p,
      size: text.length,
      executable: false,
    })),
    notes: null,
    artifactPath: path,
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: ids.releaser ?? "",
    publishedAt: new Date(),
    submissionId: null,
    dependencies,
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
  return itemId;
};
const mcpId = await release(E2E_RMK_ITEMS.mcp, "mcp-server", "1.0.0", {
  "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_RMK_ITEMS.mcp}"\ntype: mcp-server\ndescription: The kit-mcp item.\nmcp-server:\n  transport: stdio\n  command: npx\n  args: ["-y", "@example/mcp"]\n  env:\n    - name: KIT_TOKEN\n      required: true\n      secret: true\n`,
});
const agentId = await release(
  E2E_RMK_ITEMS.agent,
  "agent",
  "1.0.0",
  {
    "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_RMK_ITEMS.agent}"\ntype: agent\ndescription: The kit-agent item.\nagent:\n  prompt: prompt.md\n  tools: [read, "mcp:${E2E_RMK_ITEMS.mcp}"]\n  model: fast\ndependencies:\n  "@${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}": "^1.0.0"\n  "@${E2E_SCOPE}/${E2E_RMK_ITEMS.mcp}": "^1.0.0"\n`,
    "prompt.md": "Review with the kit.\n",
  },
  [
    { itemId: kitId, range: "^1.0.0" },
    { itemId: mcpId, range: "^1.0.0" },
  ],
);
// A few runs of the agent (047): with no minimum by default, its Overview shows them.
await kyselyUsageRepository(db, dialect, UNFILTERED).add([
  {
    itemId: agentId,
    day: daysBefore(dayOf(new Date()), 1),
    version: "1.0.0",
    tool: "claude-code",
    event: "run",
    trigger: "model",
    outcome: "success",
    count: 3,
  },
]);
for (const version of ["1.0.0", "1.1.0"])
  await release(E2E_RMK_ITEMS.hook, "hook", version, {
    "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_RMK_ITEMS.hook}"\ntype: hook\ndescription: The kit-hook item.\nhook:\n  event: tool.after\n  matcher:\n    tool: edit\n  run:\n    command: "echo kit ${version}"\n`,
  });
await release(E2E_RMK_ITEMS.rule, "rule", "1.0.0", {
  "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_RMK_ITEMS.rule}"\ntype: rule\ndescription: The kit-rule item.\nrule:\n  body: rule.md\n  activation: always\n`,
  "rule.md": "Keep functions small.\n",
});
// #141: a later fallback-b pins fallback-a to the version before the one that needs it.
const fallbackRule = (name: string) => ({
  "ronne.yaml": `name: "@${E2E_SCOPE}/${name}"\ntype: rule\ndescription: The ${name} item.\nrule:\n  body: rule.md\n  activation: always\n`,
  "rule.md": `The ${name} rule.\n`,
});
const fallbackA = await release(
  E2E_FALLBACK_ITEMS.a,
  "rule",
  "1.0.0",
  fallbackRule(E2E_FALLBACK_ITEMS.a),
);
const fallbackB = await release(
  E2E_FALLBACK_ITEMS.b,
  "rule",
  "1.1.0",
  fallbackRule(E2E_FALLBACK_ITEMS.b),
);
await release(E2E_FALLBACK_ITEMS.a, "rule", "1.1.0", fallbackRule(E2E_FALLBACK_ITEMS.a), [
  { itemId: fallbackB, range: "^1.0.0" },
]);
await release(E2E_FALLBACK_ITEMS.b, "rule", "1.2.0", fallbackRule(E2E_FALLBACK_ITEMS.b), [
  { itemId: fallbackA, range: "1.0.0" },
]);
// A private workspace with a skill its members see (093), and a public one root turns private.
const releaseSkillIn = async (
  where: { workspace: string; scope: string; item: string },
  visibility: "public" | "private",
  members: readonly (keyof typeof E2E_USERS)[],
) => {
  const workspaceId = await kyselyWorkspaceRepository(db, dialect).insert({
    name: where.workspace,
    description: `The ${where.workspace} workspace, for the end-to-end tests.`,
    visibility,
    createdBy: null,
    createdAt: new Date(),
  });
  for (const key of members) {
    const now = toDbDate(new Date(), dialect);
    await db
      .insertInto("workspace_members")
      .values({
        workspace_id: workspaceId,
        user_id: ids[key] ?? "",
        role: "user",
        added_by: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }
  const whereScopeId = await kyselyScopeRepository(db, dialect, UNFILTERED).insert({
    name: where.scope,
    description: `The ${where.workspace} workspace's scope.`,
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });
  // Outside global, the full name names the workspace (118).
  const name = `@${where.workspace}/${where.scope}/${where.item}`;
  const description = `The ${where.item} skill.`;
  const files = [
    {
      path: "ronne.yaml",
      text: `name: "${name}"\ntype: skill\ndescription: ${description}\nskill:\n  entry: SKILL.md\n`,
    },
    {
      path: "SKILL.md",
      text: `---\nname: ${where.item}\ndescription: ${description}\n---\n\nDo it.\n`,
    },
  ].map((file) => ({ path: file.path, bytes: new TextEncoder().encode(file.text) }));
  const packed = await packItem(files, { version: "1.0.0" });
  // Under the workspace, as releases store them (118), so a same-named global item's stays apart.
  const artifactPath = `@${where.workspace}/${where.scope}/${where.item}/1.0.0.tgz`;
  await localStorage(storagePath).put(artifactPath, packed.tgz);
  const itemId = await items.insertItem({
    scopeId: whereScopeId,
    name: where.item,
    type: "skill",
    description,
    ownerId: ids.releaser ?? "",
    createdAt: new Date(),
  });
  const versionId = await items.insertVersion({
    itemId,
    version: "1.0.0",
    manifest: { name, type: "skill", description, skill: { entry: "SKILL.md" }, version: "1.0.0" },
    readme: null,
    files: files.map((f) => ({ path: f.path, size: f.bytes.length, executable: false })),
    notes: null,
    artifactPath,
    sha256: packed.sha256,
    size: packed.size,
    publishedBy: ids.releaser ?? "",
    publishedAt: new Date(),
    submissionId: null,
    dependencies: [],
    riskFlags: [],
  });
  await items.setTag(itemId, "latest", versionId);
};
await releaseSkillIn(E2E_VAULT, "private", E2E_VAULT.members);
await releaseSkillIn(E2E_SHELF, "public", []);
// Work in one workspace (120): two public workspaces with each project's moderator in both, and in
// each a draft of every moderator's and a submission waiting for review.
for (const where of [E2E_FOCUS, E2E_FOCUS.other]) {
  await releaseSkillIn(where, "public", Object.values(E2E_FOCUS.moderators));
  await db
    .updateTable("workspace_members")
    .set({ role: "moderator" })
    .where(
      "user_id",
      "in",
      Object.values(E2E_FOCUS.moderators).map((key) => ids[key] ?? ""),
    )
    .where("workspace_id", "in", (eb) =>
      eb.selectFrom("workspaces").select("id").where("name", "=", where.workspace),
    )
    .execute();
  const scope = await db
    .selectFrom("scopes")
    .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
    .select("scopes.id")
    .where("workspaces.name", "=", where.workspace)
    .where("scopes.name", "=", where.scope)
    .executeTakeFirstOrThrow();
  const now = toDbDate(new Date(), dialect);
  const row = (authorId: string, name: string, status: "draft" | "submitted") => ({
    id: newId(),
    author_id: authorId,
    scope_id: scope.id,
    name,
    type: "rule",
    item_id: null,
    base_version_id: null,
    rebase_conflicts: null,
    status,
    created_at: now,
    updated_at: now,
    submitted_at: status === "draft" ? null : now,
  });
  await db
    .insertInto("submissions")
    .values([
      ...Object.entries(E2E_FOCUS.moderators).map(([project, key]) =>
        row(ids[key] ?? "", `${where.draft}-${project}`, "draft"),
      ),
      row(ids.releaser ?? "", where.waiting, "submitted"),
    ])
    .execute();
}
await releaseSkillIn(E2E_DOOR, "public", []);
await releaseSkillIn(E2E_TWIN, "public", []);
await release(E2E_TWIN.item, "rule", "1.0.0", {
  "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_TWIN.item}"\ntype: rule\ndescription: Global's ${E2E_TWIN.item}.\nrule:\n  body: rule.md\n  activation: always\n`,
  "rule.md": "Global's twin notes.\n",
});
// Released long ago, so they don't crowd the most recent items other tests look for, such as the
// composer's picker's first page.
const longAgo = toDbDate(new Date("2026-01-01T00:00:00.000Z"), dialect);
const twins = (
  await db.selectFrom("items").select("id").where("name", "=", E2E_TWIN.item).execute()
).map((row) => row.id);
await db
  .updateTable("items")
  .set({ last_published_at: longAgo })
  .where("id", "in", twins)
  .execute();
await db
  .updateTable("item_versions")
  .set({ published_at: longAgo })
  .where("item_id", "in", twins)
  .execute();
// 120's two items, aged the same way, so they don't crowd the composer's first page either.
const focusItems = (
  await db
    .selectFrom("items")
    .select("id")
    .where("name", "in", [E2E_FOCUS.item, E2E_FOCUS.other.item])
    .execute()
).map((row) => row.id);
await db
  .updateTable("items")
  .set({ last_published_at: longAgo })
  .where("id", "in", focusItems)
  .execute();
await db
  .updateTable("item_versions")
  .set({ published_at: longAgo })
  .where("item_id", "in", focusItems)
  .execute();
// A workspace per project for its admin to rename (113), each with a released skill.
for (const [project, admin] of Object.entries(E2E_RENAME.projects)) {
  const workspace = E2E_RENAME.workspace(project);
  await releaseSkillIn({ workspace, scope: E2E_RENAME.scope, item: E2E_RENAME.item }, "public", [
    admin,
  ]);
  await db
    .updateTable("workspace_members")
    .set({ role: "admin" })
    .where("user_id", "=", ids[admin] ?? "")
    .where("workspace_id", "in", (eb) =>
      eb.selectFrom("workspaces").select("id").where("name", "=", workspace),
    )
    .execute();
}
// Moving scopes (115): per project, a team workspace its admin runs, a scope in the owner's
// personal workspace, and one in global for root.
for (const [project, who] of Object.entries(E2E_MOVE.projects)) {
  const team = await kyselyWorkspaceRepository(db, dialect).insert({
    name: E2E_MOVE.team(project),
    description: "A team, for the end-to-end tests of moving scopes.",
    visibility: "public",
    createdBy: null,
    createdAt: new Date(),
  });
  const now = toDbDate(new Date(), dialect);
  await db
    .insertInto("workspace_members")
    .values({
      workspace_id: team,
      user_id: ids[who.admin] ?? "",
      role: "admin",
      added_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  const personal = await db
    .selectFrom("workspaces")
    .select("id")
    .where("owner_id", "=", ids[who.owner] ?? "")
    .executeTakeFirstOrThrow();
  for (const [name, workspaceId] of [
    [E2E_MOVE.personalScope, personal.id],
    [E2E_MOVE.rootScope(project), GLOBAL_WORKSPACE_ID],
  ] as const)
    await kyselyScopeRepository(db, dialect, UNFILTERED).insert({
      name,
      description: "To move, in the end-to-end tests.",
      workspaceId,
      createdBy: null,
      createdAt: new Date(),
    });
}
// A scope with the longest name there can be, no hyphen to break at, in global for good: every
// page that lists scopes shows it, so the phone sweep checks it fits whatever runs first (115).
await kyselyScopeRepository(db, dialect, UNFILTERED).insert({
  name: E2E_LONG_SCOPE,
  description: "The longest scope name, for the phone sweep.",
  workspaceId: GLOBAL_WORKSPACE_ID,
  createdBy: null,
  createdAt: new Date(),
});
const renameItems = (
  await db.selectFrom("items").select("id").where("name", "=", E2E_RENAME.item).execute()
).map((row) => row.id);
await db
  .updateTable("items")
  .set({ last_published_at: longAgo })
  .where("id", "in", renameItems)
  .execute();
await db
  .updateTable("item_versions")
  .set({ published_at: longAgo })
  .where("item_id", "in", renameItems)
  .execute();
// The workspace twin's old name, for "Use the new name" (118).
const workspaceTwin = await db
  .selectFrom("items")
  .innerJoin("scopes", "scopes.id", "items.scope_id")
  .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
  .select("items.id")
  .where("items.name", "=", E2E_TWIN.item)
  .where("workspaces.name", "=", E2E_TWIN.workspace)
  .executeTakeFirstOrThrow();
await db
  .insertInto("item_aliases")
  .values({
    name: E2E_TWIN_OLD_NAME,
    item_id: workspaceTwin.id,
    reason: "rename",
    created_at: toDbDate(new Date(), dialect),
  })
  .execute();
// Erasing a user (103): the erasable user published a rule and commented on the releaser's
// submission, so the test can see the pseudonym on the item's versions, the review and the audit.
{
  const erasedItemId = await release(E2E_ERASE.item, "rule", "1.0.0", {
    "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_ERASE.item}"\ntype: rule\ndescription: A rule the erasable user published.\nrule:\n  body: rule.md\n  activation: always\n`,
    "rule.md": "Written by someone who will be erased.\n",
  });
  await db
    .updateTable("items")
    .set({ owner_id: ids.erasable ?? "" })
    .where("id", "=", erasedItemId)
    .execute();
  await db
    .updateTable("item_versions")
    .set({ published_by: ids.erasable ?? "" })
    .where("item_id", "=", erasedItemId)
    .execute();
  const at = toDbDate(new Date(), dialect);
  const manifest = `name: "@${E2E_SCOPE}/${E2E_ERASE.submission}"\ntype: rule\ndescription: Under review, with a comment.\nrule:\n  body: rule.md\n  activation: always\n`;
  await db
    .insertInto("submissions")
    .values({
      id: E2E_ERASE.submissionId,
      author_id: ids.releaser ?? "",
      scope_id: scopeId,
      name: E2E_ERASE.submission,
      type: "rule",
      item_id: null,
      base_version_id: null,
      rebase_conflicts: null,
      status: "submitted",
      created_at: at,
      updated_at: at,
      submitted_at: at,
    })
    .execute();
  const files = [
    { path: "ronne.yaml", content: manifest },
    { path: "rule.md", content: "A rule under review.\n" },
  ];
  await db
    .insertInto("submission_files")
    .values(
      files.map((file) => ({
        submission_id: E2E_ERASE.submissionId,
        path: file.path,
        encoding: "utf8" as const,
        content: file.content,
        size: file.content.length,
        executable: 0,
        updated_at: at,
      })),
    )
    .execute();
  const revisionId = newId();
  await db
    .insertInto("submission_revisions")
    .values({
      id: revisionId,
      submission_id: E2E_ERASE.submissionId,
      number: 1,
      created_by: ids.releaser ?? "",
      created_at: at,
    })
    .execute();
  await db
    .insertInto("submission_revision_files")
    .values(
      files.map((file) => ({
        revision_id: revisionId,
        path: file.path,
        encoding: "utf8" as const,
        content: file.content,
        size: file.content.length,
        executable: 0,
      })),
    )
    .execute();
  await db
    .insertInto("review_events")
    .values([
      {
        id: newId(),
        submission_id: E2E_ERASE.submissionId,
        actor_id: ids.releaser ?? "",
        kind: "submit",
        body: null,
        revision: 1,
        created_at: at,
      },
      {
        id: newId(),
        submission_id: E2E_ERASE.submissionId,
        actor_id: ids.erasable ?? "",
        kind: "comment",
        body: E2E_ERASE.comment,
        revision: null,
        created_at: at,
      },
    ])
    .execute();
}

// Your data (104): the data owner published a rule and commented on the same review, so their own
// download has an item and a comment to find.
{
  const dataItemId = await release(E2E_DATA.item, "rule", "1.0.0", {
    "ronne.yaml": `name: "@${E2E_SCOPE}/${E2E_DATA.item}"\ntype: rule\ndescription: A rule the data owner published.\nrule:\n  body: rule.md\n  activation: always\n`,
    "rule.md": "Written by someone who downloads their data.\n",
  });
  await db
    .updateTable("items")
    .set({ owner_id: ids.dataOwner ?? "" })
    .where("id", "=", dataItemId)
    .execute();
  await db
    .updateTable("item_versions")
    .set({ published_by: ids.dataOwner ?? "" })
    .where("item_id", "=", dataItemId)
    .execute();
  await db
    .insertInto("review_events")
    .values({
      id: newId(),
      submission_id: E2E_ERASE.submissionId,
      actor_id: ids.dataOwner ?? "",
      kind: "comment",
      body: E2E_DATA.comment,
      revision: null,
      created_at: toDbDate(new Date(), dialect),
    })
    .execute();
}

await db.destroy();
