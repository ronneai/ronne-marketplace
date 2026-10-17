import type { IdentityProvider } from "./identity-provider";

/**
 * A kind of identity provider (feature 106): OpenID Connect first, SAML or LDAP later as one more
 * module each. The panel, the sign-in page, linking, provisioning, group mapping and audit are
 * written against this contract; only the type knows its protocol.
 */

/** One value root types in the Add/Edit form; the form is rendered from these. */
export type ProviderField = {
  key: string;
  label: string;
  kind: "text" | "url" | "secret" | "list";
  required: boolean;
  /** A short hint under the field. */
  help?: string;
};

/** What a type's `parse` returns: the config to store, and the secret to encrypt (if typed). */
export type ParsedProviderConfig = {
  config: Record<string, unknown>;
  /** The secret root typed, or undefined to keep the stored one. Never stored in `config`. */
  secret: string | undefined;
};

/** The person a provider vouched for, whatever its protocol. */
export type VerifiedIdentity = {
  /** The provider's stable id for the person (OIDC `sub`). */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  /** The values of the groups claim, or null when the claim was missing. */
  groups: string[] | null;
};

/** A provider with its secret decrypted, for the type's network calls only. */
export type ProviderWithSecret = IdentityProvider & { secret: string | null };

/** The sign-in in progress the type needs back at the callback (kept server-side by Ronne). */
export type SignInState = Record<string, string>;

export type StartResult = { url: string; state: string; keep: SignInState };

/** One step of the setup instructions shown beside the form. */
export type InstructionStep = { title: string; body: string; copy?: string };

export type ProviderTestResult = {
  ok: boolean;
  /** What was checked, written out for root ("Issuer … answered; the keys were fetched"). */
  lines: string[];
};

export interface AuthProviderType {
  id: string;
  label: string;
  fields: readonly ProviderField[];
  /**
   * Checks what root typed and splits it into the stored config and the secret. Throws
   * InvalidProviderConfigError naming the fields that are wrong. `previous` is the stored config
   * when editing, so a blank secret keeps the stored one.
   */
  parse(
    input: Record<string, unknown>,
    previous: Record<string, unknown> | null,
  ): ParsedProviderConfig;
  /** Whether a change from `before` to `after` must clear the passing test (issuer, client, scopes). */
  needsRetest(before: Record<string, unknown>, after: Record<string, unknown>): boolean;
  start(provider: ProviderWithSecret, options: { redirectUri: string }): Promise<StartResult>;
  complete(
    provider: ProviderWithSecret,
    callback: { url: URL; redirectUri: string; keep: SignInState; startedAt: Date },
  ): Promise<VerifiedIdentity>;
  test(provider: ProviderWithSecret): Promise<ProviderTestResult>;
  instructions(
    provider: IdentityProvider | null,
    options: { redirectUri: string; preset: string },
  ): InstructionStep[];
}
