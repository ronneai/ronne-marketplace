import { createHmac, timingSafeEqual } from "node:crypto";
import { isAPIError } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import type { Db } from "../../../db/create-db";
import { toDbDate } from "../../../db/dates";
import { isUniqueViolation } from "../../../db/locks";
import type { DatabaseDialect } from "../../../db/url";
import type { Auth } from "./better-auth";
import type { ChallengeRefusal, TwoFactorStore } from "./two-factor-store";

/** Better Auth's refusal code, when the error is one of its refusals. */
const refusal = (error: unknown): string | undefined =>
  isAPIError(error) && error.statusCode < 500
    ? (error.body?.code as string | undefined)
    : undefined;

/**
 * Better Auth's 401 without a refusal of its own: the request's session is gone (replaced by
 * another tab's confirm or turn-off). A wrong code is a 401 too, but carries `INVALID_CODE` or
 * `INVALID_BACKUP_CODE`; every caller checks those first.
 */
const signedOut = (error: unknown) =>
  isAPIError(error) &&
  error.statusCode === 401 &&
  !String(refusal(error) ?? "").startsWith("INVALID");

/** RFC 4648 base32 without padding: how an `otpauth://` URI spells the secret. */
const base32 = (text: string): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of Buffer.from(text)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
};

/** Which session started a user's pending setup: a row in Better Auth's `verification` table. */
const setupKey = (userId: string) => `two-factor-setup:${userId}`;
/** A pending setup is shown again for a day at most; after that a start makes a new one. */
const SETUP_KEPT_MS = 24 * 60 * 60 * 1000;

/**
 * How long an accepted TOTP code is remembered: it's valid one 30-second period either side of its
 * own, so 90 seconds, and a little more for clocks.
 */
const USED_CODE_KEPT_MS = 120_000;

/** A session that lasts longer than this was made with Remember me (30 days; without, a day). */
const REMEMBERED_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * The `verification` row that records a used code: its primary key is derived from the user and
 * the code, so writing it twice fails on every database (Better Auth's own reservation makes a
 * 43-character id, longer than our 26). It's an HMAC keyed with AUTH_SECRET: a plain hash of a
 * 6-digit code could be reversed by trying all million.
 */
const usedCodeId = (secret: string, userId: string, code: string) =>
  createHmac("sha256", secret)
    .update(`two-factor-used:${userId}:${code}`)
    .digest("base64url")
    .replace(/[-_]/g, "0")
    .slice(0, 26);

/**
 * The second step's cookie, read as Better Auth reads it: only the name it uses for this address
 * (`__Secure-` over https), only when there's exactly one, and only with a valid signature
 * (HMAC-SHA256 with AUTH_SECRET, better-call's format). Its value names the challenge's
 * `verification` row.
 */
const challengeId = (headers: Headers, name: string, secret: string): string | null => {
  // Split and trimmed as better-call parses a Cookie header (it trims each name and value and keeps
  // the first of a name): with more than one, ours and Better Auth's could differ, so it's none.
  const values = (headers.get("cookie") ?? "")
    .split(";")
    .filter((part) => part.includes("="))
    .filter((part) => part.slice(0, part.indexOf("=")).trim() === name)
    .map((part) => part.slice(part.indexOf("=") + 1).trim());
  if (values.length !== 1) return null;
  let value: string;
  try {
    value = decodeURIComponent(values[0] ?? "");
  } catch {
    return null;
  }
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const signed = value.slice(0, dot);
  const signature = Buffer.from(value.slice(dot + 1), "base64");
  const expected = createHmac("sha256", secret).update(signed).digest();
  return signature.length === expected.length && timingSafeEqual(signature, expected)
    ? signed
    : null;
};

/** Better Auth's refusals at the second step, as ours. */
const CHALLENGE_REFUSALS: Record<string, ChallengeRefusal> = {
  INVALID_CODE: "wrong_code",
  INVALID_BACKUP_CODE: "wrong_code",
  INVALID_TWO_FACTOR_COOKIE: "expired",
  TOTP_NOT_ENABLED: "expired",
  BACKUP_CODES_NOT_ENABLED: "expired",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "too_many",
  ACCOUNT_TEMPORARILY_LOCKED: "locked",
  // The session hook's answer for a disabled account (better-auth.ts).
  INVALID_EMAIL_OR_PASSWORD: "refused",
};

/**
 * A stored secret that won't decrypt with this AUTH_SECRET (changed since, or a restore with
 * another): the cipher's own error, not a Better Auth refusal.
 */
const undecryptable = (error: unknown) => error instanceof Error && error.message === "invalid tag";

export const betterAuthTwoFactorStore = (
  auth: Auth,
  db: Db,
  dialect: DatabaseDialect,
): TwoFactorStore => {
  return {
    async status(userId) {
      const row = await db
        .selectFrom("user")
        .leftJoin("two_factor", "two_factor.user_id", "user.id")
        .select(["user.two_factor_enabled", "two_factor.verified"])
        .where("user.id", "=", userId)
        .executeTakeFirst();
      const enabled = Boolean(row?.two_factor_enabled) && Boolean(row?.verified);
      if (!enabled) return { enabled: false, backupCodesLeft: 0 };
      const { backupCodes } = await auth.api.viewBackupCodes({ body: { userId } });
      return { enabled: true, backupCodesLeft: backupCodes.length };
    },

    async checkPassword(userId, password) {
      const ctx = await auth.$context;
      const account = (await ctx.internalAdapter.findAccounts(userId)).find(
        (a) => a.providerId === "credential",
      );
      if (!account?.password) return false;
      return ctx.password.verify({ hash: account.password, password });
    },

    async begin(headers, password) {
      try {
        const result = await auth.api.enableTwoFactor({
          body: { password, method: "totp" },
          headers,
        });
        if (result.method !== "totp")
          throw new Error("Better Auth enrolled a method other than TOTP.");
        return { ok: true, enrolment: { uri: result.totpURI, backupCodes: result.backupCodes } };
      } catch (error) {
        const code = refusal(error);
        if (code === "INVALID_PASSWORD") return { ok: false, error: "wrong_password" };
        if (code === "TOTP_ALREADY_ENABLED") return { ok: false, error: "already_on" };
        // Two enrolments at once: the unique index on two_factor.user_id kept the other one.
        if (isUniqueViolation(error)) return { ok: false, error: "another_tab" };
        if (signedOut(error)) return { ok: false, error: "signed_out" };
        throw error;
      }
    },

    async pending(headers, userId, password) {
      const row = await db
        .selectFrom("two_factor")
        .select("verified")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!row || row.verified) return null;
      try {
        const { totpURI } = await auth.api.getTOTPURI({ body: { password }, headers });
        const { backupCodes } = await auth.api.viewBackupCodes({ body: { userId } });
        return { uri: totpURI, backupCodes };
      } catch (error) {
        if (refusal(error) === "TOTP_NOT_ENABLED") return null;
        if (signedOut(error)) return "signed_out";
        throw error;
      }
    },

    async setupSession(userId) {
      const ctx = await auth.$context;
      const row = await ctx.internalAdapter.findVerificationValue(setupKey(userId));
      return row && new Date(row.expiresAt).getTime() > Date.now() ? row.value : null;
    },

    async rememberSetupSession(userId, sessionId) {
      const ctx = await auth.$context;
      await ctx.internalAdapter.deleteVerificationByIdentifier(setupKey(userId));
      await ctx.internalAdapter.createVerificationValue({
        identifier: setupKey(userId),
        value: sessionId,
        expiresAt: new Date(Date.now() + SETUP_KEPT_MS),
      });
    },

    async holds(userId, uri) {
      const row = await db
        .selectFrom("two_factor")
        .select("secret")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!row || !URL.canParse(uri)) return false;
      const sent = new URL(uri).searchParams.get("secret");
      if (!sent) return false;
      const ctx = await auth.$context;
      const secret = await symmetricDecrypt({ key: ctx.secretConfig, data: row.secret });
      return sent === base32(secret);
    },

    async confirm(headers, code) {
      try {
        const { headers: responseHeaders } = await auth.api.verifyTOTP({
          body: { code },
          headers,
          returnHeaders: true,
        });
        return responseHeaders;
      } catch (error) {
        const code = refusal(error);
        if (code === "INVALID_CODE") return "wrong_code";
        if (code === "TOTP_NOT_ENABLED") return "not_started";
        if (signedOut(error)) return "signed_out";
        throw error;
      }
    },

    async checkCode(headers, code) {
      try {
        await auth.api.verifyTOTP({ body: { code }, headers });
        return "totp";
      } catch (error) {
        if (refusal(error) !== "INVALID_CODE") {
          if (signedOut(error)) return "signed_out";
          throw error;
        }
      }
      try {
        // A session already exists: nothing is set, the code is only checked and used up.
        await auth.api.verifyBackupCode({ body: { code, disableSession: true }, headers });
        return "backup_code";
      } catch (error) {
        if (refusal(error) === "INVALID_BACKUP_CODE") return false;
        if (signedOut(error)) return "signed_out";
        throw error;
      }
    },

    async regenerateBackupCodes(headers, password) {
      try {
        const { backupCodes } = await auth.api.generateBackupCodes({ body: { password }, headers });
        return backupCodes;
      } catch (error) {
        if (refusal(error) === "INVALID_PASSWORD") return null;
        if (signedOut(error)) return "signed_out";
        throw error;
      }
    },

    async disable(headers, password) {
      try {
        const { headers: responseHeaders } = await auth.api.disableTwoFactor({
          body: { password },
          headers,
          returnHeaders: true,
        });
        return responseHeaders;
      } catch (error) {
        if (refusal(error) === "INVALID_PASSWORD") return null;
        if (signedOut(error)) return "signed_out";
        throw error;
      }
    },

    async challengeUser(headers) {
      const ctx = await auth.$context;
      const id = challengeId(headers, ctx.createAuthCookie("two_factor").name, ctx.secret);
      if (!id) return null;
      // A signed cookie names a real challenge, even one that ran out: Better Auth refuses that
      // one itself (expired), and the refusal is audited under its person.
      const row = await ctx.internalAdapter.findVerificationValue(id);
      return row?.value ?? null;
    },

    async verifyChallenge(headers, code, method) {
      try {
        const { headers: responseHeaders, response } =
          method === "totp"
            ? await auth.api.verifyTOTP({ body: { code }, headers, returnHeaders: true })
            : await auth.api.verifyBackupCode({ body: { code }, headers, returnHeaders: true });
        const ctx = await auth.$context;
        const found = response.token ? await ctx.internalAdapter.findSession(response.token) : null;
        if (!found)
          throw new Error("Better Auth verified the code but its session can't be found.");
        return {
          ok: true,
          headers: responseHeaders,
          userId: found.user.id,
          sessionId: found.session.id,
          // Remember me as Better Auth applied it from the first step's signed cookie: a 30-day
          // session, or one that ends within a day. Never what the form says.
          remember: new Date(found.session.expiresAt).getTime() - Date.now() > REMEMBERED_AFTER_MS,
        };
      } catch (error) {
        const known = CHALLENGE_REFUSALS[refusal(error) ?? ""];
        if (known) return { ok: false, error: known };
        // The same backup code in two challenges at once: Better Auth's 409 for the one that lost.
        if (isAPIError(error) && error.statusCode === 409)
          return { ok: false, error: "wrong_code" };
        if (undecryptable(error)) return { ok: false, error: "unreadable" };
        throw error;
      }
    },

    async codeUsed(userId, code) {
      const ctx = await auth.$context;
      const row = await db
        .selectFrom("verification")
        .select("expires_at")
        .where("id", "=", usedCodeId(ctx.secret, userId, code))
        .executeTakeFirst();
      return Boolean(row) && new Date(row?.expires_at ?? 0).getTime() > Date.now();
    },

    async spendCode(userId, code) {
      const ctx = await auth.$context;
      const id = usedCodeId(ctx.secret, userId, code);
      const now = new Date();
      // The same code can come round again much later: forget an old record of it first.
      await db
        .deleteFrom("verification")
        .where("id", "=", id)
        .where("expires_at", "<", toDbDate(now, dialect))
        .execute();
      try {
        await db
          .insertInto("verification")
          .values({
            id,
            identifier: `two-factor-used:${userId}`,
            value: "",
            expires_at: toDbDate(new Date(now.getTime() + USED_CODE_KEPT_MS), dialect),
            created_at: toDbDate(now, dialect),
            updated_at: toDbDate(now, dialect),
          })
          .execute();
        return true;
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },

    async endSession(sessionId) {
      await db.deleteFrom("session").where("id", "=", sessionId).execute();
    },
  };
};
