import { fromDbDate } from "../../../db/dates";
import { decodeJson } from "../../../db/json";
import { IdentityError } from "../exceptions/errors";
import type { InstructionStep, ProviderField } from "../models/auth-provider-type";
import { clientIp } from "../models/client-ip";
import {
  type IdentityProvider,
  type ProviderStatus,
  providerStatus,
  redirectUriFor,
} from "../models/identity-provider";
import { OIDC_PRESETS, type OidcPreset } from "../models/oidc-presets";
import { requirePermission } from "../models/permissions";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { PROVIDER_TYPES } from "../repositories/provider-type-registry";
import * as service from "../services/identity-providers";
import { getCurrentUser } from "./session";
import { type SsoOptions, startSsoSignIn } from "./sso";
import { type TestSignInResult, testKey } from "./test-sign-in";

export type { ProviderInput } from "../services/identity-providers";
export type { TestSignInResult } from "./test-sign-in";

/**
 * Admin › Settings › Authentication › Identity providers (feature 106): thin adapters over the
 * provider service for the panel and the Add/Edit form, plus the two tests. Root only, checked by
 * the service (and here for the reads that skip it).
 */
const deps = async (app: AppAuth): Promise<service.IdentityProviderDeps> => ({
  repo: kyselyIdentityProviderRepository(app.db, app.dialect),
  types: PROVIDER_TYPES,
  authSecret: (await app.auth.$context).secret,
});

const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

const baseUrl = async (app: AppAuth) =>
  String((await app.auth.$context).options.baseURL ?? "http://localhost:3000").replace(/\/+$/, "");

/** One row of the panel. */
export type ProviderRow = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  presetLabel: string;
  issuer: string;
  domains: string[];
  status: ProviderStatus;
  enabled: boolean;
  lastSignedInAt: Date | null;
  lastFailureReason: string | null;
};

const presetLabel = (id: string) => OIDC_PRESETS.find((p) => p.id === id)?.label ?? "Other";

const row = (p: IdentityProvider): ProviderRow => ({
  id: p.id,
  name: p.name,
  type: p.type,
  typeLabel: PROVIDER_TYPES.get(p.type).label,
  presetLabel: presetLabel(p.preset),
  issuer: String(p.config.issuer ?? ""),
  domains: p.domains,
  status: providerStatus(p),
  enabled: p.enabled,
  lastSignedInAt: p.lastSignedInAt,
  lastFailureReason: p.lastFailureReason,
});

export const providerRows = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  (await service.listProviders(await deps(app), await actor(headers, app))).map(row);

/** Everything the Add/Edit page shows. */
export type ProviderPage = {
  provider: IdentityProvider | null;
  status: ProviderStatus | null;
  mappings: Awaited<ReturnType<typeof service.listGroupMappings>>;
  workspaces: { id: string; name: string }[];
  presets: readonly OidcPreset[];
  fields: readonly ProviderField[];
  redirectUri: string | null;
  /** `<PUBLIC_URL>/api/auth/sso/callback/`: the form adds the id as it's typed. */
  callbackBase: string;
  /** The setup steps for each preset, for the form to show beside it. */
  steps: Record<string, InstructionStep[]>;
  /** Whether the root viewing it may turn it on (a passing test of this version, by them). */
  canEnable: boolean;
  lastTest: TestSignInResult | null;
};

export const providerPage = async (
  headers: Headers,
  id: string | null,
  app: AppAuth = getAppAuth(),
): Promise<ProviderPage> => {
  const d = await deps(app);
  const who = await actor(headers, app);
  requirePermission(who.user, "settings.manage");
  const provider = id ? await service.getProvider(d, who, id) : null;
  const type = PROVIDER_TYPES.get(provider?.type ?? "oidc");
  const base = await baseUrl(app);
  const redirectUri = provider ? redirectUriFor(base, provider.id) : null;
  const shown = redirectUri ?? redirectUriFor(base, "<id>");
  const steps = Object.fromEntries(
    OIDC_PRESETS.map((preset) => [
      preset.id,
      type.instructions(provider, { redirectUri: shown, preset: preset.id }),
    ]),
  );
  const workspaces = await app.db
    .selectFrom("workspaces")
    .select(["id", "name"])
    .where("owner_id", "is", null)
    .orderBy("name")
    .execute();
  let lastTest: TestSignInResult | null = null;
  if (provider && who.user) {
    const stored = await app.db
      .selectFrom("verification")
      .select(["identifier", "value", "expires_at"])
      .where("identifier", "=", testKey(provider.id, who.user.id))
      .executeTakeFirst();
    if (
      stored &&
      stored.identifier === testKey(provider.id, who.user.id) &&
      fromDbDate(stored.expires_at).getTime() > Date.now()
    )
      lastTest = decodeJson<TestSignInResult>(stored.value);
  }
  return {
    provider,
    status: provider ? providerStatus(provider) : null,
    mappings: provider ? await service.listGroupMappings(d, who, provider.id) : [],
    workspaces,
    presets: OIDC_PRESETS,
    fields: type.fields,
    redirectUri,
    callbackBase: redirectUriFor(base, ""),
    steps,
    canEnable: Boolean(
      provider && !provider.enabled && provider.testedAt && provider.testedBy === who.user?.id,
    ),
    lastTest,
  };
};

export const createProvider = async (
  headers: Headers,
  id: unknown,
  input: service.ProviderInput,
  app: AppAuth = getAppAuth(),
) => service.createProvider(await deps(app), await actor(headers, app), id, input);

export const updateProvider = async (
  headers: Headers,
  id: string,
  input: Omit<service.ProviderInput, "type">,
  expectedUpdatedAt: Date,
  app: AppAuth = getAppAuth(),
) =>
  service.updateProvider(await deps(app), await actor(headers, app), id, input, expectedUpdatedAt);

export const enableProvider = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.enableProvider(await deps(app), await actor(headers, app), id);

export const disableProvider = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.disableProvider(await deps(app), await actor(headers, app), id);

export const deleteProvider = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.deleteProvider(await deps(app), await actor(headers, app), id);

/**
 * *Test connection*: discovery, the issuer, the keys. A failure marks the provider *Failing*
 * until a test or a sign-in passes.
 */
export const testConnection = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) => {
  const d = await deps(app);
  const who = await actor(headers, app);
  const provider = await service.getProvider(d, who, id);
  const result = await PROVIDER_TYPES.get(provider.type).test({ ...provider, secret: null });
  if (!result.ok) await d.repo.recordFailure(id, "test_failed", new Date());
  return result;
};

/**
 * *Test sign-in*: a sign-in with the provider in a new tab, by this root, of this version of the
 * provider. The callback shows what came back and what a real sign-in would do, and changes
 * nothing but the record that this root passed the test.
 */
export const startTestSignIn = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  options: SsoOptions = {},
) => {
  const d = await deps(app);
  const who = await actor(headers, app);
  const provider = await service.getProvider(d, who, id);
  if (!who.user) throw new Error("unreachable: getProvider checked the permission");
  return startSsoSignIn(
    headers,
    {
      provider: id,
      next: `/admin/settings?tab=authentication&provider=${encodeURIComponent(id)}`,
      test: { by: who.user.id, version: provider.updatedAt.toISOString() },
    },
    app,
    options,
  );
};

/**
 * The route behind *Test sign-in*'s button: a POST from Ronne's own page (the Origin must be
 * PUBLIC_URL's), by root. Sends the browser to the provider with the state cookie set, or back to
 * the provider's page saying why not.
 */
export const startTestSignInFromRequest = async (
  request: Request,
  id: string,
  app: AppAuth = getAppAuth(),
  options: SsoOptions = {},
): Promise<Response> => {
  const base = await baseUrl(app);
  const back = (reason: string) =>
    new Response(null, {
      status: 303,
      headers: {
        location: `${base}/admin/settings?tab=authentication&provider=${encodeURIComponent(id)}&test=${reason}`,
      },
    });
  if (request.headers.get("origin") !== new URL(base).origin)
    return new Response("Forbidden", { status: 403 });
  let started: Awaited<ReturnType<typeof startTestSignIn>>;
  try {
    started = await startTestSignIn(request.headers, id, app, options);
  } catch (error) {
    if (error instanceof IdentityError) return back("unavailable");
    throw error;
  }
  if (!started.ok) return back(started.error);
  const { name, value, options: cookie } = started.cookie;
  const response = new Response(null, { status: 303, headers: { location: started.url } });
  response.headers.append(
    "set-cookie",
    `${name}=${encodeURIComponent(value)}; Path=${cookie.path}; Max-Age=${cookie.maxAge}; HttpOnly; SameSite=Lax${cookie.secure ? "; Secure" : ""}`,
  );
  return response;
};
