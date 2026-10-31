import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson, encodeJson } from "../../../db/json";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { notify } from "../../notifications/services/notify";
import { kyselyIdentityRepository } from "./kysely-identity-repository";
import type { SsoRepository, SsoSignInState } from "./sso-repository";

/** Sign-ins in progress are `verification` rows under this prefix and the state's hash. */
const STATE_PREFIX = "sso-state:";

export const kyselySsoRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): SsoRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const identity = kyselyIdentityRepository(db, dialect);

  return {
    async saveState(stateHash, state, now, expiresAt) {
      await db
        .insertInto("verification")
        .values({
          id: newId(),
          identifier: `${STATE_PREFIX}${stateHash}`,
          value: encodeJson(state),
          expires_at: at(expiresAt),
          created_at: at(now),
          updated_at: at(now),
        })
        .execute();
    },

    async pruneStates(now) {
      await db
        .deleteFrom("verification")
        .where("identifier", "like", `${STATE_PREFIX}%`)
        .where("expires_at", "<", at(now))
        .execute();
    },

    async takeState(stateHash, now) {
      const identifier = `${STATE_PREFIX}${stateHash}`;
      const row = await db
        .selectFrom("verification")
        .select(["id", "identifier", "value", "expires_at"])
        .where("identifier", "=", identifier)
        .executeTakeFirst();
      if (!row || row.identifier !== identifier) return null;
      // Deleting it is what claims it: of two requests with one state, only one deletes the row.
      const deleted = await db
        .deleteFrom("verification")
        .where("id", "=", row.id)
        .executeTakeFirst();
      if (Number(deleted.numDeletedRows) !== 1) return null;
      if (fromDbDate(row.expires_at).getTime() <= now.getTime()) return null;
      return { state: decodeJson<SsoSignInState>(row.value) };
    },

    async lockProvider(providerId) {
      await forUpdate(
        db.selectFrom("identity_providers").select("id").where("id", "=", providerId),
        dialect,
      ).execute();
    },

    async scimEnabled(providerId) {
      const row = await db
        .selectFrom("identity_providers")
        .select("scim_enabled_at")
        .where("id", "=", providerId)
        .executeTakeFirst();
      return Boolean(row?.scim_enabled_at);
    },

    async findLinkedUser(providerId, subject) {
      const rows = await db
        .selectFrom("account")
        .select(["user_id", "account_id", "provider_id"])
        .where("provider_id", "=", providerId)
        .where("account_id", "=", subject)
        .execute();
      // `account_id` is text: MySQL compares it without case, and a subject is case-sensitive.
      const row = rows.find((r) => r.account_id === subject && r.provider_id === providerId);
      return row?.user_id ?? null;
    },

    async linkedSubjects(userId, providerId) {
      const rows = await db
        .selectFrom("account")
        .select(["account_id", "provider_id"])
        .where("user_id", "=", userId)
        .where("provider_id", "=", providerId)
        .execute();
      return rows.filter((r) => r.provider_id === providerId).map((r) => r.account_id);
    },

    async linkAccount(userId, providerId, subject, now) {
      await db
        .insertInto("account")
        .values({
          id: newId(),
          account_id: subject,
          provider_id: providerId,
          user_id: userId,
          access_token: null,
          refresh_token: null,
          id_token: null,
          access_token_expires_at: null,
          refresh_token_expires_at: null,
          scope: null,
          password: null,
          created_at: at(now),
          updated_at: at(now),
        })
        .execute();
    },

    findUser: (userId) => identity.findUser(userId),
    findUserByEmail: (email) => identity.findUserByEmail(email),

    createUser: (user, now) => identity.createUserWithoutPassword({ ...user, role: "user" }, now),

    async mappingsFor(providerId) {
      const rows = await db
        .selectFrom("provider_group_mappings")
        .select(["group_name", "workspace_id", "role"])
        .where("provider_id", "=", providerId)
        .execute();
      return rows.map((r) => ({ group: r.group_name, workspaceId: r.workspace_id, role: r.role }));
    },

    async membershipsOf(userId) {
      const rows = await db
        .selectFrom("workspace_members as m")
        .innerJoin("workspaces as w", "w.id", "m.workspace_id")
        .select(["m.workspace_id", "w.name", "m.role", "m.source"])
        .where("m.user_id", "=", userId)
        .execute();
      return rows.map((r) => ({
        workspaceId: r.workspace_id,
        workspaceName: r.name,
        role: r.role,
        source: r.source,
      }));
    },

    async workspaceName(workspaceId) {
      const row = await db
        .selectFrom("workspaces")
        .select("name")
        .where("id", "=", workspaceId)
        .executeTakeFirst();
      return row?.name ?? null;
    },

    async addMembership(userId, workspaceId, role, source, now) {
      await db
        .insertInto("workspace_members")
        .values({
          workspace_id: workspaceId,
          user_id: userId,
          role,
          added_by: null,
          source,
          created_at: at(now),
          updated_at: at(now),
        })
        .execute();
    },

    async setMembership(userId, workspaceId, role, source, now) {
      await db
        .updateTable("workspace_members")
        .set({ role, source, updated_at: at(now) })
        .where("workspace_id", "=", workspaceId)
        .where("user_id", "=", userId)
        .execute();
    },

    async removeMembership(userId, workspaceId) {
      await db
        .deleteFrom("workspace_members")
        .where("workspace_id", "=", workspaceId)
        .where("user_id", "=", userId)
        .execute();
    },

    // READ COMMITTED: after waiting for the provider's lock, the checks see what the sign-in
    // before committed (MySQL's REPEATABLE READ would read an older snapshot).
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselySsoRepository(trx, dialect)),
      ),

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },

    async notify(notification, now) {
      await notify(db, dialect, notification, now);
    },
  };
};
