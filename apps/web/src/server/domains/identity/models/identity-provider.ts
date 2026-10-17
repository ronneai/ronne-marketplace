import { InvalidProviderDomainsError, InvalidProviderIdError } from "../exceptions/errors";

/**
 * An identity provider root set up (feature 106): an instance of a provider type (OpenID Connect
 * first). Its `id` is in the redirect URI, so it is chosen once and never changes.
 */
export type IdentityProvider = {
  id: string;
  type: string;
  preset: string;
  name: string;
  enabled: boolean;
  /** The type's settings, without the client secret. */
  config: Record<string, unknown>;
  hasSecret: boolean;
  /**
   * Email domains this provider signs in: a new address gets an account on first sign-in, an
   * existing account is linked (with `linkByEmail`). Empty: only accounts already linked.
   */
  domains: string[];
  linkByEmail: boolean;
  groupsClaim: string | null;
  testedAt: Date | null;
  testedBy: string | null;
  lastSignedInAt: Date | null;
  failures: number;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A group in the provider's claim that gives a role in a workspace. */
export type GroupMapping = {
  id: string;
  providerId: string;
  group: string;
  /** Null once the workspace is deleted: skipped at sign-in, shown as a warning. */
  workspaceId: string | null;
  role: MappedRole;
};

export const MAPPED_ROLES = ["user", "moderator", "admin"] as const;
export type MappedRole = (typeof MAPPED_ROLES)[number];
export const isMappedRole = (value: unknown): value is MappedRole =>
  typeof value === "string" && (MAPPED_ROLES as readonly string[]).includes(value);

/** Ids Better Auth or Ronne already use for an `account.provider_id`. */
const RESERVED_IDS = new Set(["credential", "new"]);
const PROVIDER_ID = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;

/** A provider id: 3–32 lowercase letters, digits and `-`, not starting or ending with `-`. */
export const checkProviderId = (value: unknown): string => {
  if (typeof value !== "string" || !PROVIDER_ID.test(value) || RESERVED_IDS.has(value))
    throw new InvalidProviderIdError(typeof value === "string" ? value : "");
  return value;
};

const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "acme.com, Example.org" → ["acme.com", "example.org"]: lowercased, unique, each a host name. */
export const parseDomains = (value: unknown): string[] => {
  const parts = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : value === undefined || value === null
        ? []
        : null;
  if (!parts) throw new InvalidProviderDomainsError("");
  const domains: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") throw new InvalidProviderDomainsError("");
    const domain = part.trim().toLowerCase().replace(/^@/, "");
    if (!domain) continue;
    if (!DOMAIN.test(domain)) throw new InvalidProviderDomainsError(domain);
    if (!domains.includes(domain)) domains.push(domain);
  }
  return domains;
};

/** Whether an email's domain is one of the provider's (exactly; a subdomain isn't). */
export const emailInDomains = (email: string, domains: readonly string[]): boolean => {
  const at = email.lastIndexOf("@");
  return at > 0 && domains.includes(email.slice(at + 1).toLowerCase());
};

/** After this many failed sign-ins or tests in a row, the panel marks the provider *Failing*. */
export const FAILING_AFTER = 3;

export type ProviderStatus = "off" | "tested" | "on" | "failing";

/** The panel's badge. */
export const providerStatus = (p: IdentityProvider): ProviderStatus => {
  // A failed test, or a secret this AUTH_SECRET can't read (after a restore), fails at once.
  if (
    p.failures >= FAILING_AFTER ||
    p.lastFailureReason === "test_failed" ||
    p.lastFailureReason === "secret_unreadable"
  )
    return "failing";
  if (p.enabled) return "on";
  return p.testedAt ? "tested" : "off";
};

/** The redirect URI root registers at the provider. */
export const redirectUriFor = (baseUrl: string, providerId: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/api/auth/sso/callback/${providerId}`;
