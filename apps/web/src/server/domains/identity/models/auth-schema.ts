/**
 * How Better Auth's field names map to our snake_case columns (migration 0001_identity).
 * Shared by the Better Auth setup in this domain and the test that checks the migration against it,
 * so the two can't drift apart. Plain data: it doesn't import Better Auth.
 */
const timestamps = { createdAt: "created_at", updatedAt: "updated_at" } as const;

export const authSchema = {
  user: {
    fields: { emailVerified: "email_verified", ...timestamps },
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
        fieldName: "role",
      },
      disabledAt: { type: "date", required: false, input: false, fieldName: "disabled_at" },
      erasedAt: { type: "date", required: false, input: false, fieldName: "erased_at" },
    },
  },
  session: {
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      ...timestamps,
    },
  },
  account: {
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      ...timestamps,
    },
  },
  verification: {
    fields: { expiresAt: "expires_at", ...timestamps },
  },
} as const;

/**
 * The two-factor plugin's names (feature 105, migration 0025_two_factor), passed as its `schema`
 * option: Better Auth's `twoFactor` model and `twoFactorEnabled` field, in snake_case.
 */
export const twoFactorSchema = {
  twoFactor: {
    modelName: "two_factor",
    fields: {
      backupCodes: "backup_codes",
      userId: "user_id",
      failedVerificationCount: "failed_verification_count",
      lockedUntil: "lock_expires_at",
    },
  },
  user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
} as const;
