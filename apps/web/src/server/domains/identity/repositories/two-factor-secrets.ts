import { symmetricDecrypt } from "better-auth/crypto";
import type { Db } from "../../../db/create-db";

/**
 * Whether the stored two-factor secrets can be read with `secret` (105), tried on one of them:
 * Better Auth encrypts them all with a key from the same AUTH_SECRET. Null when there are none.
 */
export const twoFactorSecretsReadable = async (db: Db, secret: string): Promise<boolean | null> => {
  const row = await db.selectFrom("two_factor").select("secret").limit(1).executeTakeFirst();
  if (!row) return null;
  try {
    await symmetricDecrypt({ key: secret, data: row.secret });
    return true;
  } catch {
    return false;
  }
};
