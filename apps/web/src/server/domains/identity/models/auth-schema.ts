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
