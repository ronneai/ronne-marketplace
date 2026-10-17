import * as oauth from "oauth4webapi";
import { InvalidProviderConfigError, ProviderFlowError } from "../exceptions/errors";
import type {
  AuthProviderType,
  InstructionStep,
  ProviderWithSecret,
  VerifiedIdentity,
} from "../models/auth-provider-type";
import { oidcPreset } from "../models/oidc-presets";

/**
 * The OpenID Connect provider type (feature 106): the authorization-code flow with PKCE (S256),
 * `state` and `nonce`, on `oauth4webapi` (Decision 3). Discovery is fetched for every sign-in, so
 * an edited provider needs no restart; every request refuses redirects (the library's
 * `redirect: 'manual'`) and gives up after 10 seconds.
 *
 * The library checks the ID token's `iss`, `aud`, `exp`, `nbf` and `nonce`. It skips the signature
 * for a token straight from the token endpoint (OIDC Core 3.1.3.7), so `complete` always calls
 * `validateApplicationLevelSignature`, and it only checks that `iat` is a number, so `complete`
 * checks it against when the sign-in started (PLAN.md's task 1 Notes).
 */

/** Leeway for clocks that disagree: on `exp`/`nbf` (the library) and `iat` (here). */
export const CLOCK_TOLERANCE_SECONDS = 300;
const DEFAULT_SCOPES = ["openid", "email", "profile"];

/** `http://` only for a loopback issuer: development and tests. */
const isLoopback = (url: URL) =>
  url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

/** An issuer root may type: https, or http on loopback; no credentials, query or fragment. */
export const checkIssuer = (value: unknown): URL | null => {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && !isLoopback(url)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url;
};

const parseScopes = (value: unknown): string[] => {
  const parts = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  const scopes = [
    ...new Set(parts.map((s) => s.trim()).filter((s) => /^[\x21\x23-\x5b\x5d-\x7e]+$/.test(s))),
  ];
  return scopes.includes("openid") ? scopes : ["openid", ...scopes];
};

type OidcConfig = { issuer: string; clientId: string; scopes: string[] };

const configOf = (provider: ProviderWithSecret): OidcConfig => ({
  issuer: String(provider.config.issuer ?? ""),
  clientId: String(provider.config.clientId ?? ""),
  scopes: Array.isArray(provider.config.scopes)
    ? (provider.config.scopes as string[])
    : DEFAULT_SCOPES,
});

/** A library or network error as one of the spec's reasons; its text is for the log only. */
const flowError = (error: unknown, stage: string): ProviderFlowError => {
  if (error instanceof ProviderFlowError) return error;
  const providerSide =
    error instanceof oauth.ResponseBodyError ||
    error instanceof oauth.AuthorizationResponseError ||
    // The provider answered 5xx: it's failing, not sending something wrong.
    (error instanceof oauth.OperationProcessingError &&
      error.cause instanceof Response &&
      error.cause.status >= 500) ||
    (error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError" || error.name === "TypeError"));
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new ProviderFlowError(
    providerSide ? "provider_error" : "invalid_response",
    `${stage}: ${detail}`,
  );
};

/**
 * The type, with how long a request to the provider may take (10 seconds; tests make it shorter)
 * and how long a discovery document is kept for sign-ins (10 minutes).
 */
export const createOidcProviderType = ({
  timeoutMs = 10_000,
  discoveryTtlMs = 600_000,
  now = Date.now,
}: {
  timeoutMs?: number;
  discoveryTtlMs?: number;
  now?: () => number;
} = {}): AuthProviderType => {
  /** Options for every request: a timeout, and plain http only for a loopback issuer. */
  const requestOptions = (issuer: URL) => ({
    signal: () => AbortSignal.timeout(timeoutMs),
    ...(isLoopback(issuer) ? { [oauth.allowInsecureRequests]: true } : {}),
  });

  /**
   * Discovery documents by issuer, for starting a sign-in: a start then costs no request to the
   * provider. Only good answers are kept. The callback and *Test connection* always ask again:
   * `oauth4webapi` keeps the provider's keys on the document, so a kept one would verify ID
   * tokens against keys the provider may have rotated.
   */
  const discovered = new Map<string, { as: oauth.AuthorizationServer; until: number }>();

  const discover = async (provider: ProviderWithSecret, { fresh = false } = {}) => {
    const { issuer } = configOf(provider);
    const url = checkIssuer(issuer);
    if (!url)
      throw new ProviderFlowError("invalid_response", "discovery: the issuer isn't allowed");
    const cached = fresh ? undefined : discovered.get(url.href);
    if (cached && cached.until > now()) return { as: cached.as, url };
    try {
      const response = await oauth.discoveryRequest(url, requestOptions(url));
      // Checks that the document's issuer is exactly what root typed.
      const as = await oauth.processDiscoveryResponse(url, response);
      // Issuers are root's few providers; expired entries go as new ones arrive.
      for (const [key, entry] of discovered) if (entry.until <= now()) discovered.delete(key);
      discovered.set(url.href, { as, until: now() + discoveryTtlMs });
      return { as, url };
    } catch (error) {
      discovered.delete(url.href);
      throw flowError(error, "discovery");
    }
  };

  const clientOf = (provider: ProviderWithSecret): oauth.Client => ({
    client_id: configOf(provider).clientId,
    [oauth.clockTolerance]: CLOCK_TOLERANCE_SECONDS,
  });

  /** The groups claim's values, or null when the claim is missing (or isn't a list of strings). */
  const groupsFrom = (claims: Record<string, unknown>, claim: string | null): string[] | null => {
    if (!claim) return null;
    const value = claims[claim];
    if (typeof value === "string") return [value];
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value as string[];
    return null;
  };

  return {
    id: "oidc",
    label: "OpenID Connect",
    fields: [
      {
        key: "issuer",
        label: "Issuer URL",
        kind: "url",
        required: true,
        help: "Exactly as the provider's discovery document says it, trailing slash included.",
      },
      { key: "clientId", label: "Client ID", kind: "text", required: true },
      {
        key: "clientSecret",
        label: "Client secret",
        kind: "secret",
        required: true,
        help: "Stored encrypted and never shown again.",
      },
      {
        key: "scopes",
        label: "Scopes",
        kind: "list",
        required: true,
        help: "openid is always asked for.",
      },
    ],

    parse(input, previous) {
      const errors: Record<string, string> = {};
      const issuer = checkIssuer(input.issuer);
      if (!issuer)
        errors.issuer =
          "The issuer must be an https:// address (http:// only for localhost), without a query.";
      const clientId = typeof input.clientId === "string" ? input.clientId.trim() : "";
      if (!clientId || clientId.length > 255)
        errors.clientId = "The client ID needs 1 to 255 characters.";
      const typed = typeof input.clientSecret === "string" ? input.clientSecret.trim() : "";
      if (typed.length > 4096) errors.clientSecret = "The client secret is too long.";
      if (!typed && !previous) errors.clientSecret = "The client secret is required.";
      if (Object.keys(errors).length > 0) throw new InvalidProviderConfigError(errors);
      const scopes = parseScopes(input.scopes ?? DEFAULT_SCOPES);
      return {
        // Kept as typed (trimmed): discovery compares it to the document's issuer exactly.
        config: { issuer: String(input.issuer).trim(), clientId, scopes },
        secret: typed || undefined,
      };
    },

    needsRetest: (before, after) =>
      before.issuer !== after.issuer ||
      before.clientId !== after.clientId ||
      JSON.stringify(before.scopes) !== JSON.stringify(after.scopes),

    async start(provider, { redirectUri }) {
      const { as } = await discover(provider);
      if (!as.authorization_endpoint)
        throw new ProviderFlowError("invalid_response", "discovery: no authorization_endpoint");
      const verifier = oauth.generateRandomCodeVerifier();
      const state = oauth.generateRandomState();
      const nonce = oauth.generateRandomNonce();
      const url = new URL(as.authorization_endpoint);
      url.search = new URLSearchParams({
        client_id: configOf(provider).clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: configOf(provider).scopes.join(" "),
        state,
        nonce,
        code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
      }).toString();
      return { url: url.href, state, keep: { verifier, nonce, state } };
    },

    async complete(provider, { url, redirectUri, keep, startedAt }): Promise<VerifiedIdentity> {
      const { as, url: issuer } = await discover(provider, { fresh: true });
      const client = clientOf(provider);
      let claims: oauth.IDToken;
      try {
        const params = oauth.validateAuthResponse(as, client, url, keep.state ?? "");
        const response = await oauth.authorizationCodeGrantRequest(
          as,
          client,
          oauth.ClientSecretBasic(provider.secret ?? ""),
          params,
          redirectUri,
          keep.verifier ?? "",
          requestOptions(issuer),
        );
        const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
          expectedNonce: keep.nonce ?? "",
          requireIdToken: true,
        });
        // Not done by default for a token from the token endpoint: Ronne always checks it.
        await oauth.validateApplicationLevelSignature(as, response, requestOptions(issuer));
        claims = oauth.getValidatedIdTokenClaims(result) as oauth.IDToken;
      } catch (error) {
        throw flowError(error, "callback");
      }
      const now = Date.now() / 1000;
      const started = startedAt.getTime() / 1000;
      if (
        claims.iat < started - CLOCK_TOLERANCE_SECONDS ||
        claims.iat > now + CLOCK_TOLERANCE_SECONDS
      )
        throw new ProviderFlowError("invalid_response", "callback: iat outside the sign-in");
      if (typeof claims.sub !== "string" || !claims.sub)
        throw new ProviderFlowError("invalid_response", "callback: no sub");
      const email = typeof claims.email === "string" ? claims.email.trim() : "";
      if (!email) throw new ProviderFlowError("invalid_response", "callback: no email");
      const preset = oidcPreset(provider.preset);
      const verified =
        claims.email_verified === true ||
        claims.email_verified === "true" ||
        (claims.email_verified === undefined &&
          preset.verifiedClaim !== undefined &&
          (claims[preset.verifiedClaim] === true || claims[preset.verifiedClaim] === "true"));
      return {
        subject: claims.sub,
        email,
        emailVerified: verified,
        name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : null,
        groups: groupsFrom(claims, provider.groupsClaim),
      };
    },

    async test(provider) {
      const lines: string[] = [];
      try {
        const { as, url } = await discover(provider, { fresh: true });
        lines.push(
          `Issuer ${url.href} answered, and its discovery document names the same issuer.`,
        );
        if (!as.authorization_endpoint || !as.token_endpoint || !as.jwks_uri) {
          lines.push("The discovery document lacks an authorization, token or keys endpoint.");
          return { ok: false, lines };
        }
        const methods = as.code_challenge_methods_supported;
        if (Array.isArray(methods) && !methods.includes("S256")) {
          lines.push("The provider doesn't list PKCE with S256, which Ronne uses.");
          return { ok: false, lines };
        }
        // The same rule as the issuer: a sign-in's key fetch would refuse plain http elsewhere.
        const jwksUrl = checkIssuer(as.jwks_uri);
        if (!jwksUrl) {
          lines.push(`The keys address ${as.jwks_uri} isn't https.`);
          return { ok: false, lines };
        }
        const keys = await fetch(jwksUrl, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: "application/json" },
        });
        const body = keys.ok ? ((await keys.json()) as { keys?: unknown }) : null;
        if (!body || !Array.isArray(body.keys) || body.keys.length === 0) {
          lines.push(`The keys at ${as.jwks_uri} couldn't be fetched (HTTP ${keys.status}).`);
          return { ok: false, lines };
        }
        lines.push(`The keys were fetched: ${body.keys.length}.`);
        return { ok: true, lines };
      } catch (error) {
        const e = flowError(error, "test");
        lines.push(
          e.reason === "provider_error"
            ? "The issuer didn't answer, or answered with an error."
            : "The issuer's discovery document isn't valid, or names another issuer.",
        );
        return { ok: false, lines };
      }
    },

    instructions(_provider, { redirectUri, preset }): InstructionStep[] {
      return [
        {
          title: "Copy the redirect URI",
          body: "Register this exact address at the provider. It contains the provider's id, which can't change.",
          copy: redirectUri,
        },
        ...oidcPreset(preset).steps,
      ];
    },
  };
};

export const oidcProviderType = createOidcProviderType();
