import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidProviderConfigError, ProviderFlowError } from "../exceptions/errors";
import type { ProviderWithSecret } from "../models/auth-provider-type";
import { issuerFromPreset, OIDC_PRESETS, oidcPreset } from "../models/oidc-presets";
import { type FakeOidc, followAuthorize, startFakeOidc } from "../testing/fake-oidc-server";
import { checkIssuer, createOidcProviderType, oidcProviderType } from "./oidc-provider-type";

const REDIRECT = "http://localhost:3000/api/auth/sso/callback/acme";
let fake: FakeOidc;

beforeEach(async () => {
  fake = await startFakeOidc();
});
afterEach(() => fake.close());

const provider = (overrides: Partial<ProviderWithSecret> = {}): ProviderWithSecret => ({
  id: "acme",
  type: "oidc",
  preset: "okta",
  name: "Acme",
  enabled: true,
  config: { issuer: fake.issuer, clientId: fake.clientId, scopes: ["openid", "email", "profile"] },
  hasSecret: true,
  secret: fake.clientSecret,
  domains: [],
  linkByEmail: true,
  groupsClaim: "groups",
  testedAt: null,
  testedBy: null,
  lastSignedInAt: null,
  failures: 0,
  lastFailureAt: null,
  lastFailureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/** Start, let the fake sign the person in, and complete: the whole browser round trip. */
const signIn = async (p = provider(), type = oidcProviderType) => {
  const started = await type.start(p, { redirectUri: REDIRECT });
  const back = await followAuthorize(started.url);
  return type.complete(p, { url: back, redirectUri: REDIRECT, keep: started.keep });
};

const refusedWith = async (
  reason: "invalid_response" | "provider_error",
  run: Promise<unknown>,
) => {
  const error = await run.then(
    () => expect.fail("the sign-in was accepted"),
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProviderFlowError);
  expect((error as ProviderFlowError).reason).toBe(reason);
};

describe("the issuer rule", () => {
  it.each([
    "https://idp.acme.com",
    "https://idp.acme.com/realms/acme",
    "https://login.microsoftonline.com/x/v2.0",
    "http://localhost:8080",
    "http://127.0.0.1:9000/oidc",
    "https://10.0.0.5/realms/acme",
  ])("accepts %s", (issuer) => {
    expect(checkIssuer(issuer)).not.toBeNull();
  });

  it.each([
    "http://idp.acme.com",
    "http://10.0.0.5",
    "ftp://idp.acme.com",
    "https://user:pass@idp.acme.com",
    "https://idp.acme.com/?x=1",
    "https://idp.acme.com/#x",
    "idp.acme.com",
    "",
    42,
  ])("refuses %s", (issuer) => {
    expect(checkIssuer(issuer)).toBeNull();
  });
});

describe("parsing the form", () => {
  it("keeps the issuer as typed, always asks for openid, and splits out the secret", () => {
    expect(
      oidcProviderType.parse(
        {
          issuer: " https://idp.acme.com/ ",
          clientId: " ronne ",
          clientSecret: "s3",
          scopes: "email profile groups",
        },
        null,
      ),
    ).toEqual({
      config: {
        issuer: "https://idp.acme.com/",
        clientId: "ronne",
        scopes: ["openid", "email", "profile", "groups"],
      },
      secret: "s3",
    });
  });

  it("needs a secret for a new provider, and keeps the stored one when left blank on edit", () => {
    expect(() =>
      oidcProviderType.parse({ issuer: "https://idp.acme.com", clientId: "ronne" }, null),
    ).toThrow(InvalidProviderConfigError);
    expect(
      oidcProviderType.parse(
        { issuer: "https://idp.acme.com", clientId: "ronne", clientSecret: "" },
        { issuer: "x" },
      ).secret,
    ).toBeUndefined();
  });

  it("names every wrong field", () => {
    try {
      oidcProviderType.parse({ issuer: "http://idp.acme.com", clientId: "" }, null);
      expect.fail("accepted");
    } catch (error) {
      expect(Object.keys((error as InvalidProviderConfigError).fields).sort()).toEqual([
        "clientId",
        "clientSecret",
        "issuer",
      ]);
    }
  });

  it("needs a new test when the issuer, client or scopes change, not otherwise", () => {
    const a = { issuer: "https://a", clientId: "c", scopes: ["openid"] };
    expect(oidcProviderType.needsRetest(a, { ...a })).toBe(false);
    expect(oidcProviderType.needsRetest(a, { ...a, issuer: "https://b" })).toBe(true);
    expect(oidcProviderType.needsRetest(a, { ...a, clientId: "d" })).toBe(true);
    expect(oidcProviderType.needsRetest(a, { ...a, scopes: ["openid", "groups"] })).toBe(true);
  });
});

describe("starting a sign-in", () => {
  it("sends PKCE (S256), a state and a nonce, and keeps the verifier for the callback", async () => {
    const started = await oidcProviderType.start(provider(), { redirectUri: REDIRECT });
    const url = new URL(started.url);
    expect(url.origin + url.pathname).toBe(`${fake.issuer}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: fake.clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "openid email profile",
      code_challenge_method: "S256",
      state: started.state,
    });
    expect(url.searchParams.get("nonce")).toBe(started.keep.nonce);
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(started.keep.verifier).toMatch(/^[\w-]{43,}$/);
    expect(started.keep.state).toBe(started.state);
    // Fresh each time.
    const again = await oidcProviderType.start(provider(), { redirectUri: REDIRECT });
    expect(again.state).not.toBe(started.state);
    expect(again.keep.nonce).not.toBe(started.keep.nonce);
  });
});

describe("completing a sign-in", () => {
  it("returns the verified identity", async () => {
    expect(await signIn()).toEqual({
      subject: "sub-ana",
      email: "ana@acme.com",
      emailVerified: true,
      name: "Ana Acme",
      groups: ["engineering"],
    });
  });

  it("says when the email isn't verified (Ronne then refuses)", async () => {
    fake.user = { ...fake.user, emailVerified: false };
    expect((await signIn()).emailVerified).toBe(false);
    fake.user = { ...fake.user, emailVerified: undefined };
    expect((await signIn()).emailVerified).toBe(false);
    fake.user = { ...fake.user, emailVerified: "true" };
    expect((await signIn()).emailVerified).toBe(true);
  });

  it("takes Entra's xms_edov as verified, only for the Entra preset and only without email_verified", async () => {
    fake.user = { ...fake.user, emailVerified: undefined, claims: { xms_edov: true } };
    expect((await signIn(provider({ preset: "entra" }))).emailVerified).toBe(true);
    expect((await signIn(provider({ preset: "okta" }))).emailVerified).toBe(false);
    fake.user = { ...fake.user, emailVerified: false, claims: { xms_edov: true } };
    expect((await signIn(provider({ preset: "entra" }))).emailVerified).toBe(false);
  });

  it("returns null groups when the claim is missing, and reads a single string or another claim", async () => {
    fake.user = { ...fake.user, groups: undefined };
    expect((await signIn()).groups).toBeNull();
    fake.user = { ...fake.user, groups: "admins" };
    expect((await signIn()).groups).toEqual(["admins"]);
    fake.user = {
      ...fake.user,
      groups: undefined,
      claims: { "https://ronne.ai/groups": ["a", "b"] },
    };
    expect((await signIn(provider({ groupsClaim: "https://ronne.ai/groups" }))).groups).toEqual([
      "a",
      "b",
    ]);
    expect((await signIn(provider({ groupsClaim: null }))).groups).toBeNull();
  });

  it("refuses a token signed with a key the provider didn't publish", async () => {
    fake.switches.badSignature = true;
    await refusedWith("invalid_response", signIn());
  });

  it("refuses a wrong nonce, a token from another issuer, and no ID token", async () => {
    fake.switches.wrongNonce = true;
    await refusedWith("invalid_response", signIn());
    fake.switches.wrongNonce = false;
    fake.switches.wrongTokenIssuer = true;
    await refusedWith("invalid_response", signIn());
    fake.switches.wrongTokenIssuer = false;
    fake.switches.noIdToken = true;
    await refusedWith("invalid_response", signIn());
  });

  it("allows five minutes of clock skew on exp, and refuses more", async () => {
    fake.switches.expIn = -200;
    expect((await signIn()).subject).toBe("sub-ana");
    fake.switches.expIn = -400;
    await refusedWith("invalid_response", signIn());
  });

  it("refuses an iat in the future beyond five minutes", async () => {
    fake.switches.iatOffset = 120;
    expect((await signIn()).subject).toBe("sub-ana");
    for (const offset of [600, 365 * 86400]) {
      fake.switches.iatOffset = offset;
      fake.switches.expIn = 300 + offset;
      await refusedWith("invalid_response", signIn());
    }
  });

  it("accepts an iat from before the sign-in started (Entra reuses the person's session)", async () => {
    for (const offset of [-120, -3600, -30 * 86400]) {
      fake.switches.iatOffset = offset;
      expect((await signIn()).subject).toBe("sub-ana");
    }
  });

  it("refuses a missing email", async () => {
    fake.user = { ...fake.user, email: undefined };
    await refusedWith("invalid_response", signIn());
  });

  it("refuses a callback whose state isn't the one it started with", async () => {
    const started = await oidcProviderType.start(provider(), { redirectUri: REDIRECT });
    const back = await followAuthorize(started.url);
    back.searchParams.set("state", "forged");
    await refusedWith(
      "invalid_response",
      oidcProviderType.complete(provider(), {
        url: back,
        redirectUri: REDIRECT,
        keep: started.keep,
      }),
    );
  });

  it("refuses a code used twice, or with another verifier", async () => {
    const started = await oidcProviderType.start(provider(), { redirectUri: REDIRECT });
    const back = await followAuthorize(started.url);
    await oidcProviderType.complete(provider(), {
      url: back,
      redirectUri: REDIRECT,
      keep: started.keep,
    });
    await refusedWith(
      "provider_error",
      oidcProviderType.complete(provider(), {
        url: back,
        redirectUri: REDIRECT,
        keep: started.keep,
      }),
    );
    const two = await oidcProviderType.start(provider(), { redirectUri: REDIRECT });
    await refusedWith(
      "provider_error",
      oidcProviderType.complete(provider(), {
        url: await followAuthorize(two.url),
        redirectUri: REDIRECT,
        keep: { ...two.keep, verifier: started.keep.verifier as string },
      }),
    );
  });

  it("calls a refusal, an error or a wrong secret at the provider a provider error", async () => {
    fake.switches.deny = true;
    await refusedWith("provider_error", signIn());
    fake.switches.deny = false;
    fake.switches.tokenError = true;
    await refusedWith("provider_error", signIn());
    fake.switches.tokenError = false;
    await refusedWith("provider_error", signIn(provider({ secret: "wrong" })));
  });

  it("gives up on a slow provider", async () => {
    fake.switches.delayMs = 400;
    await refusedWith(
      "provider_error",
      signIn(provider(), createOidcProviderType({ timeoutMs: 100 })),
    );
  });
});

describe("discovery", () => {
  it("refuses a document naming another issuer, and a redirect", async () => {
    fake.switches.wrongIssuer = true;
    await refusedWith(
      "invalid_response",
      oidcProviderType.start(provider(), { redirectUri: REDIRECT }),
    );
    fake.switches.wrongIssuer = false;
    fake.switches.redirectDiscovery = true;
    await refusedWith(
      "invalid_response",
      oidcProviderType.start(provider(), { redirectUri: REDIRECT }),
    );
  });

  it("is kept for 10 minutes for starts, only when good; callbacks and Test connection always ask", async () => {
    let clock = 1_000_000;
    const type = createOidcProviderType({ now: () => clock });
    const asked = () =>
      fake.requests.filter((path) => path === "/.well-known/openid-configuration").length;
    await signIn(provider(), type);
    await signIn(provider(), type);
    // The first start and both callbacks ask; the second start uses the kept document.
    expect(asked()).toBe(3);
    // A failed Test connection drops the document still kept: the next start asks again.
    fake.switches.wrongIssuer = true;
    expect((await type.test(provider())).ok).toBe(false);
    fake.switches.wrongIssuer = false;
    await type.start(provider(), { redirectUri: REDIRECT });
    expect(asked()).toBe(5);
    clock += 600_000;
    await type.start(provider(), { redirectUri: REDIRECT });
    expect(asked()).toBe(6);
    await type.test(provider());
    await type.test(provider());
    expect(asked()).toBe(8);
    // A bad answer isn't kept.
    clock += 600_000;
    fake.switches.wrongIssuer = true;
    await refusedWith("invalid_response", type.start(provider(), { redirectUri: REDIRECT }));
    fake.switches.wrongIssuer = false;
    await type.start(provider(), { redirectUri: REDIRECT });
    expect(asked()).toBe(10);
  });

  it("verifies a callback against the provider's current keys, even with a kept document", async () => {
    const type = createOidcProviderType();
    await signIn(provider(), type);
    // Rotated under the same key id, within the 10 minutes a start keeps the document.
    fake.switches.rotatedKey = true;
    expect((await signIn(provider(), type)).subject).toBe("sub-ana");
  });

  it("refuses an issuer that isn't https or loopback without asking it anything", async () => {
    await refusedWith(
      "invalid_response",
      oidcProviderType.start(
        provider({ config: { issuer: "http://idp.acme.com", clientId: "c" } }),
        {
          redirectUri: REDIRECT,
        },
      ),
    );
  });

  it("is what Test connection reports, in words", async () => {
    const ok = await oidcProviderType.test(provider());
    expect(ok.ok).toBe(true);
    expect(ok.lines.join(" ")).toContain("The keys were fetched: 1.");

    fake.switches.noKeys = true;
    expect((await oidcProviderType.test(provider())).ok).toBe(false);
    fake.switches.noKeys = false;
    fake.switches.insecureJwks = true;
    const insecure = await oidcProviderType.test(provider());
    expect(insecure.ok).toBe(false);
    expect(insecure.lines.join(" ")).toContain("isn't https");
    fake.switches.insecureJwks = false;
    fake.switches.noS256 = true;
    expect((await oidcProviderType.test(provider())).ok).toBe(false);
    fake.switches.noS256 = false;
    fake.switches.wrongIssuer = true;
    const wrong = await oidcProviderType.test(provider());
    expect(wrong.ok).toBe(false);
    expect(wrong.lines.join(" ")).toContain("names another issuer");
  });
});

describe("presets", () => {
  it.each([
    ["google", {}, "https://accounts.google.com"],
    [
      "entra",
      { tenant: "8a3f0c2e-1111-2222-3333-444455556666" },
      "https://login.microsoftonline.com/8a3f0c2e-1111-2222-3333-444455556666/v2.0",
    ],
    ["okta", { domain: "acme.okta.com" }, "https://acme.okta.com"],
    [
      "keycloak",
      { host: "sso.acme.internal:8443", realm: "acme" },
      "https://sso.acme.internal:8443/realms/acme",
    ],
    [
      "authentik",
      { host: "auth.acme.com", slug: "ronne" },
      "https://auth.acme.com/application/o/ronne/",
    ],
    ["auth0", { domain: "acme.eu.auth0.com" }, "https://acme.eu.auth0.com/"],
  ])("%s makes its issuer from the pieces", (id, pieces, issuer) => {
    const made = issuerFromPreset(oidcPreset(id), pieces as Record<string, string>);
    expect(made).toBe(issuer);
    expect(checkIssuer(made)).not.toBeNull();
  });

  it("makes nothing while a piece is missing, or when a piece tries to be a path or another host", () => {
    expect(issuerFromPreset(oidcPreset("okta"), {})).toBeNull();
    expect(issuerFromPreset(oidcPreset("okta"), { domain: "evil.com/x" })).toBeNull();
    expect(issuerFromPreset(oidcPreset("okta"), { domain: "evil.com?x" })).toBeNull();
    expect(issuerFromPreset(oidcPreset("keycloak"), { host: "a@b.com", realm: "r" })).toBeNull();
    expect(issuerFromPreset(oidcPreset("other"), {})).toBeNull();
  });

  it("has the seven presets, each with steps; an unknown preset is Other", () => {
    expect(OIDC_PRESETS.map((p) => p.id)).toEqual([
      "google",
      "entra",
      "okta",
      "keycloak",
      "authentik",
      "auth0",
      "other",
    ]);
    for (const p of OIDC_PRESETS) {
      expect(p.scopes).toContain("openid");
      expect(p.steps.length).toBeGreaterThan(1);
    }
    expect(oidcPreset("nope").id).toBe("other");
  });

  it("starts the instructions with the redirect URI to copy", () => {
    const steps = oidcProviderType.instructions(null, { redirectUri: REDIRECT, preset: "entra" });
    expect(steps[0]).toMatchObject({ copy: REDIRECT });
    expect(steps.map((s) => s.body).join(" ")).toContain("xms_edov");
  });
});
