import { symmetricEncrypt } from "better-auth/crypto";

/**
 * A value encrypted as Better Auth stores a two-factor secret, with a key from `authSecret` (105):
 * for tests outside identity that need a record one AUTH_SECRET reads and another doesn't.
 */
export const encryptedAsTwoFactor = (authSecret: string, data: string): Promise<string> =>
  symmetricEncrypt({ key: authSecret, data });
