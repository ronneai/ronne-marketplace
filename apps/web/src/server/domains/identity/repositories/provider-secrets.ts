import { open, SealedValueUnreadableError, seal } from "../../../crypto/sealed";
import { ProviderSecretUnreadableError } from "../exceptions/errors";

/**
 * Identity providers' client secrets at rest (feature 106), sealed by `crypto/sealed.ts`: its own
 * HKDF `info`, and the provider's id as associated data, so a value copied onto another provider's
 * row doesn't decrypt. The stored format is the helper's `v1.<nonce>.<ciphertext and tag>`.
 */
const INFO = "ronne:identity-provider-secret:v1";

export const encryptSecret = (authSecret: string, providerId: string, secret: string): string =>
  seal(authSecret, { info: INFO, boundTo: providerId }, secret);

/** The secret, or ProviderSecretUnreadableError when another AUTH_SECRET sealed it (or it's damaged). */
export const decryptSecret = (authSecret: string, providerId: string, stored: string): string => {
  try {
    return open(authSecret, { info: INFO, boundTo: providerId }, stored);
  } catch (error) {
    if (error instanceof SealedValueUnreadableError) throw new ProviderSecretUnreadableError();
    throw error;
  }
};
