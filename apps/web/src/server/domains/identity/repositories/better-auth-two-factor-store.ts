import { isAPIError } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import type { Db } from "../../../db/create-db";
import { isUniqueViolation } from "../../../db/locks";
import type { Auth } from "./better-auth";
import type { TwoFactorStore } from "./two-factor-store";

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

export const betterAuthTwoFactorStore = (auth: Auth, db: Db): TwoFactorStore => {
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
        return true;
      } catch (error) {
        if (refusal(error) !== "INVALID_CODE") {
          if (signedOut(error)) return "signed_out";
          throw error;
        }
      }
      try {
        // A session already exists: nothing is set, the code is only checked and used up.
        await auth.api.verifyBackupCode({ body: { code, disableSession: true }, headers });
        return true;
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
  };
};
