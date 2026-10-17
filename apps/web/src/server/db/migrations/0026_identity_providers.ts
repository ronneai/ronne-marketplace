import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Identity providers (feature 106): the company sign-in root sets up on the Authentication tab.
 * `id` is the slug root chose, in the redirect URI, so it never changes. `config` holds what the
 * provider type needs except the client secret, which is `secret_enc` (AES-256-GCM, a key derived
 * from AUTH_SECRET). `tested_at`/`tested_by` record the last passing *Test sign-in*; editing the
 * issuer, client or scopes clears them. The failure columns drive the panel's *Failing* badge.
 *
 * `provider_group_mappings`: a group in the provider's groups claim gives a role in a workspace.
 * The workspace's deletion leaves the row with a null workspace, so the panel can warn about it.
 *
 * `workspace_members.source`: null for a membership set by hand, or the provider id that gave it,
 * so a mapping only ever removes what it gave. No foreign key: deleting a provider removes its
 * memberships through the service, with their audit events.
 */
export const identityProviders: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("identity_providers")
      .addColumn("id", t.string(32), (c) => c.primaryKey())
      .addColumn("type", t.string(16), (c) => c.notNull())
      .addColumn("preset", t.string(32), (c) => c.notNull())
      .addColumn("name", t.string(100), (c) => c.notNull())
      .addColumn("enabled", t.boolean(), (c) => c.notNull().defaultTo(false))
      .addColumn("config", t.json(), (c) => c.notNull())
      .addColumn("secret_enc", t.text())
      .addColumn("domains", t.json(), (c) => c.notNull())
      .addColumn("link_by_email", t.boolean(), (c) => c.notNull().defaultTo(true))
      .addColumn("groups_claim", t.string(100))
      .addColumn("tested_at", t.timestamp())
      .addColumn("tested_by", t.id())
      .addForeignKeyConstraint(
        "identity_providers_tested_by_fk",
        ["tested_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("set null"),
      )
      .addColumn("last_signed_in_at", t.timestamp())
      .addColumn("failures", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("last_failure_at", t.timestamp())
      .addColumn("last_failure_reason", t.string(32))
      .addColumn("created_by", t.id())
      .addForeignKeyConstraint(
        "identity_providers_created_by_fk",
        ["created_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("set null"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();

    await db.schema
      .createTable("provider_group_mappings")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("provider_id", t.string(32), (c) => c.notNull())
      .addForeignKeyConstraint(
        "provider_group_mappings_provider_id_fk",
        ["provider_id"],
        "identity_providers",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      // Compared byte for byte: `Admins` and `admins` are two groups at most providers.
      .addColumn("group_name", t.exactString(255), (c) => c.notNull())
      .addColumn("workspace_id", t.id())
      .addForeignKeyConstraint(
        "provider_group_mappings_workspace_id_fk",
        ["workspace_id"],
        "workspaces",
        ["id"],
        (fk) => fk.onDelete("set null"),
      )
      .addColumn("role", t.string(16), (c) => c.notNull())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("provider_group_mappings_provider_id_idx")
      .on("provider_group_mappings")
      .column("provider_id")
      .execute();

    await db.schema.alterTable("workspace_members").addColumn("source", t.string(32)).execute();
  },
});
