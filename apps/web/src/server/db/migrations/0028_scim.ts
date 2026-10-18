import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * SCIM provisioning (feature 108): an identity provider (106) creates, updates and deprovisions
 * accounts, and keeps its groups' members in step.
 *
 * `identity_providers.scim_enabled_at`: when root turned SCIM on for it; null while it's off, and
 * every SCIM request for it is refused.
 *
 * `scim_tokens`: the provider's bearer tokens, `scim_` + 32 random bytes, of which only the SHA-256
 * hash is kept. `expires_at` is null for the current token; a rotation gives the old one 24 hours.
 * `revoked_at` stops one at once. `last_used_at` is for the panel.
 *
 * `scim_users`: the link between a provider's SCIM user and a Ronne account, with what the provider
 * last sent (`user_name` is the email, lowercased; `external_id` the provider's own id, compared
 * byte for byte). Its `id` is the SCIM resource's id. `active` is the provider's word; the account
 * is disabled when no live link says it's active. A deprovisioning `DELETE` sets `deleted_at` and
 * clears `user_name`: the link is a tombstone (404 to the provider, for *Deprovisioned by* in Admin ›
 * Users) and the account stays disabled. It keeps `external_id`, the only way back: a later create
 * with it replaces the tombstone with a new link, new id. Without `user_name` it holds no email
 * against anyone, which the account's own email does instead (RFC 7644 §3.6).
 *
 * `scim_groups` and `scim_group_members`: the provider's groups and who's in them, which its group
 * mappings (106) turn into workspace memberships marked with `workspace_members.source`.
 */
export const scim: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .alterTable("identity_providers")
      .addColumn("scim_enabled_at", t.timestamp())
      .execute();

    await db.schema
      .createTable("scim_tokens")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("provider_id", t.string(32), (c) => c.notNull())
      .addForeignKeyConstraint(
        "scim_tokens_provider_id_fk",
        ["provider_id"],
        "identity_providers",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("token_hash", t.string(64), (c) => c.notNull().unique())
      .addColumn("created_by", t.id())
      .addForeignKeyConstraint("scim_tokens_created_by_fk", ["created_by"], "user", ["id"], (fk) =>
        fk.onDelete("set null"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("expires_at", t.timestamp())
      .addColumn("revoked_at", t.timestamp())
      .addColumn("last_used_at", t.timestamp())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("scim_tokens_provider_id_idx")
      .on("scim_tokens")
      .column("provider_id")
      .execute();

    await db.schema
      .createTable("scim_users")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("provider_id", t.string(32), (c) => c.notNull())
      .addForeignKeyConstraint(
        "scim_users_provider_id_fk",
        ["provider_id"],
        "identity_providers",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("scim_users_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("external_id", t.exactString(255))
      // Lowercased; byte for byte, so `kate@` and `kåte@` are two users on MySQL too. Null on a
      // tombstone (several nulls never collide).
      .addColumn("user_name", t.exactString(255))
      .addColumn("given_name", t.string(100))
      .addColumn("family_name", t.string(100))
      .addColumn("display_name", t.string(100))
      .addColumn("active", t.boolean(), (c) => c.notNull())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .addColumn("deleted_at", t.timestamp())
      .addUniqueConstraint("scim_users_provider_user_uq", ["provider_id", "user_id"])
      .addUniqueConstraint("scim_users_provider_user_name_uq", ["provider_id", "user_name"])
      .addUniqueConstraint("scim_users_provider_external_id_uq", ["provider_id", "external_id"])
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("scim_users_user_id_idx")
      .on("scim_users")
      .column("user_id")
      .execute();

    await db.schema
      .createTable("scim_groups")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("provider_id", t.string(32), (c) => c.notNull())
      .addForeignKeyConstraint(
        "scim_groups_provider_id_fk",
        ["provider_id"],
        "identity_providers",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      // Compared byte for byte, like the mappings' group names (106).
      .addColumn("display_name", t.exactString(255), (c) => c.notNull())
      .addColumn("external_id", t.exactString(255))
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .addUniqueConstraint("scim_groups_provider_external_id_uq", ["provider_id", "external_id"])
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("scim_groups_provider_display_name_idx")
      .on("scim_groups")
      .columns(["provider_id", "display_name"])
      .execute();

    await db.schema
      .createTable("scim_group_members")
      .addColumn("group_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "scim_group_members_group_id_fk",
        ["group_id"],
        "scim_groups",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("scim_group_members_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addPrimaryKeyConstraint("scim_group_members_pk", ["group_id", "user_id"])
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("scim_group_members_user_id_idx")
      .on("scim_group_members")
      .column("user_id")
      .execute();
  },
});
