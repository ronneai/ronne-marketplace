/**
 * The OpenID Connect presets (feature 106): data, not code. A preset fills the Add provider form
 * (the issuer, from a pattern with the pieces root fills in, the scopes and the groups claim) and
 * chooses the setup steps shown beside it. The full guides, with screenshots, are in the
 * Documentation (`authentication#<id>`); these are the short version. Checked against each vendor's
 * documentation in October 2026; vendors move their screens often.
 */
export type OidcPreset = {
  id: string;
  label: string;
  /** The issuer with `{piece}` placeholders root fills in; empty when root types it whole. */
  issuer: string;
  /** What each placeholder is, in the form's words. */
  pieces: Record<string, { label: string; example: string }>;
  scopes: string[];
  /** The scope that asks for groups, added when groups are mapped; null when none is needed. */
  groupsScope: string | null;
  /** Where the groups are, or null when the provider can't send them in the ID token. */
  groupsClaim: string | null;
  /**
   * A claim that also says the email is verified when `email_verified` is absent: Entra sends
   * `xms_edov` (the email's domain is verified by the tenant) and never `email_verified`.
   */
  verifiedClaim?: string;
  /** The steps after "copy the redirect URI": what to create, what to bring back, which claims. */
  steps: { title: string; body: string }[];
};

const CLAIMS_STEP = {
  title: "Check the claims",
  body: "Ronne reads sub, email, email_verified (it must be true), name, and the groups claim if you map groups. Test sign-in shows what arrived.",
};

export const OIDC_PRESETS: readonly OidcPreset[] = [
  {
    id: "google",
    label: "Google Workspace",
    issuer: "https://accounts.google.com",
    pieces: {},
    scopes: ["openid", "email", "profile"],
    groupsScope: null,
    groupsClaim: null,
    steps: [
      {
        title: "Create an OAuth client",
        body: "In the Google Cloud console, APIs & Services › Credentials, create an OAuth client ID of type Web application, and add the redirect URI under Authorized redirect URIs. Set the consent screen to Internal so only your Workspace can use it.",
      },
      {
        title: "Bring back the client ID and secret",
        body: "Copy the client ID and the client secret into this form.",
      },
      {
        title: "No groups",
        body: "Google doesn't put groups in the ID token, so group mappings can't be used with this preset. List your Workspace domain under Who may sign in.",
      },
      CLAIMS_STEP,
    ],
  },
  {
    id: "entra",
    label: "Microsoft Entra ID",
    issuer: "https://login.microsoftonline.com/{tenant}/v2.0",
    pieces: { tenant: { label: "Directory (tenant) ID", example: "8a3f…-…" } },
    scopes: ["openid", "email", "profile"],
    groupsScope: null,
    groupsClaim: "groups",
    verifiedClaim: "xms_edov",
    steps: [
      {
        title: "Register an application",
        body: "In the Entra admin center, App registrations › New registration, single tenant, with the redirect URI as a Web platform URI. Then Certificates & secrets › New client secret.",
      },
      {
        title: "Bring back three values",
        body: "The Directory (tenant) ID, the Application (client) ID and the secret's Value (not its ID).",
      },
      {
        title: "Turn on the email claims",
        body: "Token configuration › Add optional claim › ID: email and xms_edov. Entra never sends email_verified; Ronne accepts xms_edov (the email's domain is verified in your tenant) instead. Without it, Ronne refuses the sign-in.",
      },
      {
        title: "Groups (optional)",
        body: "Token configuration › Add groups claim › Security groups. Entra sends group object IDs; map those. With more than 200 groups the claim is left out: assign only the groups Ronne maps to the application.",
      },
      CLAIMS_STEP,
    ],
  },
  {
    id: "okta",
    label: "Okta",
    issuer: "https://{domain}",
    pieces: { domain: { label: "Okta domain", example: "acme.okta.com" } },
    scopes: ["openid", "email", "profile"],
    groupsScope: "groups",
    groupsClaim: "groups",
    steps: [
      {
        title: "Create an app integration",
        body: "Applications › Create App Integration › OIDC, Web Application, with the redirect URI as a Sign-in redirect URI. Assign the people or groups who may use Ronne.",
      },
      {
        title: "Bring back the client ID and secret",
        body: "From the application's General tab. The issuer is your Okta domain (the org authorization server).",
      },
      {
        title: "Groups (optional)",
        body: "On the application's Sign On tab, set the Groups claim: name groups, filter Matches regex .* (or only the groups Ronne maps).",
      },
      CLAIMS_STEP,
    ],
  },
  {
    id: "keycloak",
    label: "Keycloak",
    issuer: "https://{host}/realms/{realm}",
    pieces: {
      host: { label: "Keycloak address", example: "sso.acme.internal" },
      realm: { label: "Realm", example: "acme" },
    },
    scopes: ["openid", "email", "profile"],
    groupsScope: null,
    groupsClaim: "groups",
    steps: [
      {
        title: "Create a client",
        body: "In the realm, Clients › Create client, OpenID Connect, Client authentication on, Standard flow only, and the redirect URI under Valid redirect URIs.",
      },
      {
        title: "Bring back the client ID and secret",
        body: "The secret is on the client's Credentials tab. The issuer is the realm's address.",
      },
      {
        title: "Groups (optional)",
        body: "Client scopes › the client's dedicated scope › Add mapper › Group Membership, token claim name groups, Full group path off.",
      },
      CLAIMS_STEP,
    ],
  },
  {
    id: "authentik",
    label: "authentik",
    issuer: "https://{host}/application/o/{slug}/",
    pieces: {
      host: { label: "authentik address", example: "auth.acme.com" },
      slug: { label: "Application slug", example: "ronne" },
    },
    scopes: ["openid", "email", "profile"],
    groupsScope: null,
    groupsClaim: "groups",
    steps: [
      {
        title: "Create a provider and an application",
        body: "Applications › Providers › Create › OAuth2/OpenID Provider, Confidential, with the redirect URI as a strict redirect URI. Then an application using it; its slug is in the issuer.",
      },
      {
        title: "Bring back the client ID and secret",
        body: "From the provider's page. The issuer ends with a slash; keep it.",
      },
      {
        title: "Groups",
        body: "The profile scope already sends groups (the group names).",
      },
      CLAIMS_STEP,
    ],
  },
  {
    id: "auth0",
    label: "Auth0",
    issuer: "https://{domain}/",
    pieces: { domain: { label: "Auth0 domain", example: "acme.eu.auth0.com" } },
    scopes: ["openid", "email", "profile"],
    groupsScope: null,
    groupsClaim: "https://ronne.ai/groups",
    steps: [
      {
        title: "Create an application",
        body: "Applications › Create Application › Regular Web Application, and the redirect URI under Allowed Callback URLs.",
      },
      {
        title: "Bring back the domain, client ID and secret",
        body: "From the application's Settings tab. The issuer ends with a slash; keep it.",
      },
      {
        title: "Groups (optional)",
        body: "Auth0 has no groups claim of its own: add a post-login Action that sets the custom claim https://ronne.ai/groups on the ID token (from roles or app metadata).",
      },
      CLAIMS_STEP,
    ],
  },
  {
    id: "other",
    label: "Other OpenID Connect",
    issuer: "",
    pieces: {},
    scopes: ["openid", "email", "profile"],
    groupsScope: null,
    groupsClaim: "groups",
    steps: [
      {
        title: "Register a web application",
        body: "A confidential client using the authorization code flow with PKCE, and the redirect URI exactly as shown.",
      },
      {
        title: "Bring back the issuer, client ID and secret",
        body: "The issuer is the address whose /.well-known/openid-configuration the provider publishes, exactly as that document's issuer says it.",
      },
      CLAIMS_STEP,
    ],
  },
];

export const oidcPreset = (id: string): OidcPreset =>
  OIDC_PRESETS.find((p) => p.id === id) ?? (OIDC_PRESETS.at(-1) as OidcPreset);

/** The issuer a preset makes from the pieces root typed; null while one is missing or unsafe. */
export const issuerFromPreset = (
  preset: OidcPreset,
  pieces: Record<string, string>,
): string | null => {
  let missing = false;
  const issuer = preset.issuer.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = (pieces[key] ?? "").trim();
    // A piece is a host name, a tenant id, a realm or a slug: never a path, query or another URL.
    if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(value)) missing = true;
    return value;
  });
  return missing || !issuer ? null : issuer;
};
