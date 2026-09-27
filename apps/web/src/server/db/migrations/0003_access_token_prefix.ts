import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * The first 12 characters of each access token (`rmk_` + 8), stored in plain text so its owner can
 * tell tokens apart in the list (feature 009). The other 35 characters, about 210 bits, stay secret:
 * only the SHA-256 hash of the whole token is stored. Nullable, for any token made before this.
 */
export const accessTokenPrefix: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema.alterTable("access_tokens").addColumn("token_prefix", t.string(12)).execute();
  },
});
