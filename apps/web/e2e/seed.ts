// Adds the end-to-end test users, and a scope, to the instance that setup just created (DATABASE_URL). Run by
// the harness with tsx; root comes from setup itself.
import { packItem } from "@ronneai/core/pack";
import { parse } from "yaml";
import { createDb } from "../src/server/db/create-db";
import { argon2PasswordHasher } from "../src/server/domains/identity/repositories/argon2-password-hasher";
import { kyselyIdentityRepository } from "../src/server/domains/identity/repositories/kysely-identity-repository";
import { kyselyItemRepository } from "../src/server/domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../src/server/domains/items/repositories/kysely-scope-repository";
import { dayOf, daysBefore } from "../src/server/domains/usage/models/usage-event";
import { kyselyUsageRepository } from "../src/server/domains/usage/repositories/kysely-usage-repository";
import { GLOBAL_WORKSPACE_ID } from "../src/server/domains/workspaces/models/workspace";
import { localStorage } from "../src/server/storage/local-storage";
import {
  E2E_MODERATORS,
  E2E_NAMES,
  E2E_PASSWORD,
  E2E_PROPOSAL_ITEM,
  E2E_RMK_ITEMS,
  E2E_ROOTS,
  E2E_SCOPE,
  E2E_SKILL,
  E2E_USAGE_PEAK,
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
      role: E2E_ROOTS.includes(key) ? "root" : E2E_MODERATORS.includes(key) ? "moderator" : "user",
      passwordHash,
    },
    new Date(),
  );
}
const scopeId = await kyselyScopeRepository(db, dialect).insert({
  name: E2E_SCOPE,
  description: "Created by the end-to-end seed.",
  workspaceId: GLOBAL_WORKSPACE_ID,
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
// Installs of 1.0.0 yesterday (047): enough usage for the Versions page and its dialogs to show it.
await kyselyUsageRepository(db, dialect).add([
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
await kyselyUsageRepository(db, dialect).add([
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
  const existing = await items.findByName(E2E_SCOPE, name);
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
await kyselyUsageRepository(db, dialect).add([
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
await db.destroy();
