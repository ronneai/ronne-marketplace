import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Better Auth's tables (user, session, account, verification) with our snake_case columns, plus
 * our own access_tokens. Foreign keys are table-level constraints: MySQL 8.4 silently ignores
 * inline column REFERENCES (see migrations.guard.test.ts). Checked against Better Auth in 0001_identity.db.test.ts; the field
 * mapping lives in domains/identity/models/auth-schema.ts. See docs/features/002-db-layer/SPEC.md.
 */
export const identity: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    const defaults = tableDefaults(dialect);

    await db.schema
      .createTable("user")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("name", t.string(255), (c) => c.notNull())
      .addColumn("email", t.string(255), (c) => c.notNull().unique())
      .addColumn("email_verified", t.boolean(), (c) => c.notNull())
      .addColumn("image", t.text())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .addColumn("role", t.string(16), (c) => c.notNull().defaultTo("user"))
      .addColumn("disabled_at", t.timestamp())
      .$call(defaults)
      .execute();

    await db.schema
      .createTable("session")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      .addColumn("token", t.string(255), (c) => c.notNull().unique())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .addColumn("ip_address", t.text())
      .addColumn("user_agent", t.text())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("session_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .$call(defaults)
      .execute();
    await db.schema.createIndex("session_user_id_idx").on("session").column("user_id").execute();

    await db.schema
      .createTable("account")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("account_id", t.text(), (c) => c.notNull())
      .addColumn("provider_id", t.text(), (c) => c.notNull())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("account_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("access_token", t.text())
      .addColumn("refresh_token", t.text())
      .addColumn("id_token", t.text())
      .addColumn("access_token_expires_at", t.timestamp())
      .addColumn("refresh_token_expires_at", t.timestamp())
      .addColumn("scope", t.text())
      .addColumn("password", t.text())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .$call(defaults)
      .execute();
    await db.schema.createIndex("account_user_id_idx").on("account").column("user_id").execute();

    await db.schema
      .createTable("verification")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("identifier", t.string(255), (c) => c.notNull())
      .addColumn("value", t.text(), (c) => c.notNull())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .$call(defaults)
      .execute();
    await db.schema
      .createIndex("verification_identifier_idx")
      .on("verification")
      .column("identifier")
      .execute();

    // Personal access tokens for rmk and the MCP server (MVP §9.5). Only a sha256 hash is stored.
    await db.schema
      .createTable("access_tokens")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("access_tokens_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("name", t.string(100), (c) => c.notNull())
      .addColumn("token_hash", t.string(64), (c) => c.notNull().unique())
      .addColumn("last_used_at", t.timestamp())
      .addColumn("expires_at", t.timestamp())
      .addColumn("revoked_at", t.timestamp())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .$call(defaults)
      .execute();
    await db.schema
      .createIndex("access_tokens_user_id_idx")
      .on("access_tokens")
      .column("user_id")
      .execute();
  },
});
