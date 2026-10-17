import { InvalidProviderConfigError } from "../exceptions/errors";
import type { AuthProviderType } from "../models/auth-provider-type";

/**
 * A provider type for tests of what's written against the contract (106): an issuer, a client id
 * and a secret, no network. `complete` returns whatever `identity` is set to.
 */
export const fakeProviderType = (
  identity: Awaited<ReturnType<AuthProviderType["complete"]>> = {
    subject: "sub-1",
    email: "ana@example.com",
    emailVerified: true,
    name: "Ana",
    groups: [],
  },
): AuthProviderType => ({
  id: "fake",
  label: "Fake",
  fields: [
    { key: "issuer", label: "Issuer", kind: "url", required: true },
    { key: "clientId", label: "Client ID", kind: "text", required: true },
    { key: "clientSecret", label: "Client secret", kind: "secret", required: true },
  ],
  parse(input, previous) {
    const issuer = typeof input.issuer === "string" ? input.issuer.trim() : "";
    const clientId = typeof input.clientId === "string" ? input.clientId.trim() : "";
    const typed = typeof input.clientSecret === "string" ? input.clientSecret : "";
    const errors: Record<string, string> = {};
    if (!issuer) errors.issuer = "The issuer is required.";
    if (!clientId) errors.clientId = "The client ID is required.";
    if (!typed && !previous) errors.clientSecret = "The client secret is required.";
    if (Object.keys(errors).length > 0) throw new InvalidProviderConfigError(errors);
    return { config: { issuer, clientId }, secret: typed || undefined };
  },
  needsRetest: (before, after) =>
    before.issuer !== after.issuer || before.clientId !== after.clientId,
  start: async () => ({ url: "https://idp.example/authorize", state: "state", keep: {} }),
  complete: async () => identity,
  test: async () => ({ ok: true, lines: ["The fake answered."] }),
  instructions: (_provider, { redirectUri }) => [
    { title: "Copy the redirect URI", body: "Paste it at the provider.", copy: redirectUri },
  ],
});
