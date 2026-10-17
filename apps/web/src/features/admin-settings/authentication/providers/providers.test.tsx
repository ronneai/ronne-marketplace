import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvalidProviderConfigError,
  ProviderNotTestedError,
  StaleProviderError,
} from "@/server/domains/identity/exceptions/errors";
import type { IdentityProvider } from "@/server/domains/identity/models/identity-provider";
import { OIDC_PRESETS } from "@/server/domains/identity/models/oidc-presets";

const providers = vi.hoisted(() => ({
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  enableProvider: vi.fn(),
  disableProvider: vi.fn(),
  deleteProvider: vi.fn(),
  testConnection: vi.fn(),
}));
vi.mock("@/server/domains/identity/actions/identity-providers", () => providers);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => (
    <a href={href} {...(rest as object)}>
      {children as never}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

const actions = await import("./actions");
const { IdentityProvidersPanel } = await import("./IdentityProvidersPanel");
const { ProviderForm, ProviderFormMessages, presetGuide } = await import("./ProviderForm");
const { DOCS_URL, topicOf } = await import("@/components/help/topics");
const { ProviderControls, ConnectionResult, TestResult, DeleteConfirm } = await import(
  "./ProviderControls"
);
const { TestNotice, UnreadableSecretNotice } = await import("./ProviderPage");

const CALLBACK = "https://ronne.example/api/auth/sso/callback/";
const REDIRECT = `${CALLBACK}acme`;

const provider: IdentityProvider = {
  id: "acme",
  type: "oidc",
  preset: "okta",
  name: "Acme SSO",
  enabled: false,
  config: {
    issuer: "https://acme.okta.com",
    clientId: "ronne",
    scopes: ["openid", "email", "profile"],
  },
  hasSecret: true,
  domains: ["acme.com"],
  linkByEmail: true,
  groupsClaim: "groups",
  testedAt: null,
  testedBy: null,
  lastSignedInAt: null,
  failures: 0,
  lastFailureAt: null,
  lastFailureReason: null,
  createdAt: new Date("2026-10-16T12:00:00Z"),
  updatedAt: new Date("2026-10-16T12:30:00.123Z"),
};

const steps = {
  okta: [
    { title: "Copy the redirect URI", body: "Register it.", copy: REDIRECT },
    { title: "Create an app", body: "…" },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("the panel", () => {
  it("says there's nothing yet, with Add provider", () => {
    const html = renderToStaticMarkup(<IdentityProvidersPanel rows={[]} />);
    expect(html).toContain("No providers yet");
    expect(html).toContain('href="/admin/settings?tab=authentication&amp;provider=new"');
  });

  it("lists each provider with its type, preset, issuer, domains and state", () => {
    const html = renderToStaticMarkup(
      <IdentityProvidersPanel
        rows={[
          {
            id: "acme",
            name: "Acme SSO",
            type: "oidc",
            typeLabel: "OpenID Connect",
            presetLabel: "Okta",
            issuer: "https://acme.okta.com",
            domains: ["acme.com"],
            status: "failing",
            enabled: true,
            lastSignedInAt: null,
            lastFailureReason: "provider_error",
          },
        ]}
      />,
    );
    expect(html).toContain("OpenID Connect · Okta");
    expect(html).toContain("https://acme.okta.com");
    expect(html).toContain("acme.com");
    expect(html).toContain("Failing");
    expect(html).toContain("Never");
  });
});

describe("Add provider", () => {
  it("opens on the presets as cards", () => {
    const html = renderToStaticMarkup(
      <ProviderForm
        provider={null}
        presets={OIDC_PRESETS}
        workspaces={[]}
        mappings={[]}
        callbackBase={CALLBACK}
        steps={{}}
      />,
    );
    for (const label of [
      "Google Workspace",
      "Microsoft Entra ID",
      "Okta",
      "Keycloak",
      "authentik",
      "Auth0",
      "Other OpenID Connect",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('name="clientId"');
  });
});

describe("Add provider, with a preset chosen", () => {
  const html = (preset: string) =>
    renderToStaticMarkup(
      <ProviderForm
        provider={null}
        presets={OIDC_PRESETS}
        workspaces={[]}
        mappings={[]}
        callbackBase={CALLBACK}
        steps={{ keycloak: steps.okta, other: steps.okta }}
        initialPreset={preset}
      />,
    );

  it("links each card to its own form (it works without JavaScript)", () => {
    const cards = renderToStaticMarkup(
      <ProviderForm
        provider={null}
        presets={OIDC_PRESETS}
        workspaces={[]}
        mappings={[]}
        callbackBase={CALLBACK}
        steps={{}}
      />,
    );
    expect(cards).toContain(
      'href="/admin/settings?tab=authentication&amp;provider=new&amp;preset=keycloak"',
    );
  });

  it("asks for the id, the preset's pieces and the secret, with the redirect URI from the id", () => {
    const form = html("keycloak");
    expect(form).toContain('id="provider-id"');
    expect(form).toContain("Keycloak address");
    expect(form).toContain("Realm");
    expect(form).toContain('name="clientSecret"');
    // The id starts as the preset's, and the redirect URI follows it.
    expect(form).toContain(`${CALLBACK}keycloak`);
    expect(form).not.toContain("&lt;id&gt;");
  });

  it("shows <id> in the redirect URI until an id is typed", () => {
    expect(html("other")).toContain(`${CALLBACK}&lt;id&gt;`);
  });
});

describe("Edit provider", () => {
  const html = () =>
    renderToStaticMarkup(
      <ProviderForm
        provider={provider}
        presets={OIDC_PRESETS}
        workspaces={[{ id: "ws1", name: "eng" }]}
        mappings={[
          { group: "Engineering", workspaceId: "ws1", role: "moderator", warning: null },
          { group: "Gone", workspaceId: null, role: "admin", warning: "workspace_deleted" },
        ]}
        callbackBase={CALLBACK}
        steps={steps}
      />,
    );

  it("never shows the secret: Secret saved, with Replace", () => {
    expect(html()).toContain("Secret saved");
    expect(html()).toContain("Replace");
    expect(html()).not.toContain('name="clientSecret"');
  });

  it("carries the version it was opened with, and no id field (it can't change)", () => {
    expect(html()).toContain('name="version" value="2026-10-16T12:30:00.123Z"');
    expect(html()).not.toContain('id="provider-id"');
  });

  it("shows the redirect URI to copy and the preset's steps beside the form", () => {
    expect(html()).toContain(REDIRECT);
    expect(html()).toContain("Create an app");
  });

  it("lists the group rows, and warns about a deleted workspace", () => {
    expect(html()).toContain('value="Engineering"');
    expect(html()).toContain("A group&#x27;s workspace was deleted");
  });

  it("has the helpers: the preset's guide, the redirect URI, and how groups apply", () => {
    expect(html()).toContain("Where do I find these values?");
    expect(html()).toContain(`href="${DOCS_URL}/authentication#okta"`);
    expect(html()).toContain("Why this address?");
    expect(html()).toContain("How are groups applied?");
  });
});

describe("the presets' guides", () => {
  it("send each preset to its own section of the Authentication topic", () => {
    const sections = (topicOf("authentication")?.sections ?? []).map((s) => s.id as string);
    for (const preset of OIDC_PRESETS) {
      const section = presetGuide(preset.id).split("#")[1] ?? "";
      expect(section, preset.id).not.toBe("providers");
      expect(sections, preset.id).toContain(section);
    }
    expect(presetGuide("unknown")).toBe(`${DOCS_URL}/authentication#providers`);
  });
});

describe("saving", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it("says a stale form is stale", async () => {
    providers.updateProvider.mockRejectedValue(new StaleProviderError(new Date()));
    const state = await actions.saveProviderFromForm(
      {},
      form({ mode: "edit", id: "acme", version: provider.updatedAt.toISOString() }),
    );
    expect(state).toMatchObject({ stale: true });
    const html = renderToStaticMarkup(<ProviderFormMessages state={state} />);
    expect(html).toContain("Someone saved this provider since you opened it");
  });

  it("passes the version through, and the field errors back", async () => {
    providers.updateProvider.mockRejectedValue(
      new InvalidProviderConfigError({ issuer: "The issuer must be https." }),
    );
    const state = await actions.saveProviderFromForm(
      {},
      form({ mode: "edit", id: "acme", version: provider.updatedAt.toISOString() }),
    );
    expect(state).toEqual({ fields: { issuer: "The issuer must be https." } });
    expect(providers.updateProvider.mock.calls[0]?.[3]).toEqual(provider.updatedAt);
  });

  it("goes to the provider's page after a save", async () => {
    providers.createProvider.mockResolvedValue(provider);
    await expect(
      actions.saveProviderFromForm({}, form({ mode: "new", id: "acme" })),
    ).rejects.toThrow("NEXT_REDIRECT /admin/settings?tab=authentication&provider=acme");
  });
});

describe("test, then turn on", () => {
  const controls = (props: {
    canEnable: boolean;
    enabled?: boolean;
    lastTest?: Parameters<typeof ProviderControls>[0]["lastTest"];
  }) =>
    renderToStaticMarkup(
      <ProviderControls
        id="acme"
        name="Acme SSO"
        status="off"
        enabled={props.enabled ?? false}
        canEnable={props.canEnable}
        lastTest={props.lastTest ?? null}
        workspaceNames={{ ws1: "eng" }}
      />,
    );

  it("can't turn on before the test", () => {
    const html = controls({ canEnable: false });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Turn on/);
    expect(html).toContain(
      "Run Test sign-in yourself, and pass it, before turning this provider on.",
    );
  });

  it("can turn on after a passing test by this root", () => {
    expect(controls({ canEnable: true })).not.toMatch(/<button[^>]*disabled=""[^>]*>Turn on/);
  });

  it("refuses a turn-on the server says wasn't tested", async () => {
    providers.enableProvider.mockRejectedValue(new ProviderNotTestedError());
    expect(await actions.enableProviderFromForm({}, form2("acme"))).toEqual({
      error: new ProviderNotTestedError().message,
    });
  });

  it("opens Test sign-in in a new tab, and shows the result and what a sign-in would do", () => {
    const html = controls({
      canEnable: true,
      lastTest: {
        at: "2026-10-16T13:00:00Z",
        ok: true,
        lines: ["The provider answered."],
        claims: {
          subject: "sub-ana",
          email: "ana@acme.com",
          emailVerified: true,
          name: "Ana",
          groups: ["engineering"],
        },
        decision:
          "Create the account ana@acme.com (a user in global, with a personal workspace), then sign in.",
        groupChanges: [{ kind: "add", workspaceId: "ws1", role: "user" }],
      },
    });
    // A plain POST form (not a server action), so the browser really opens a new tab.
    const testForm = html.match(/<form[^>]*\/api\/auth\/sso\/test\/acme[^>]*>/)?.[0] ?? "";
    expect(testForm).toContain('method="post"');
    expect(testForm).toContain('target="_blank"');
    expect(html).toContain("Your Test sign-in passed.");
    expect(html).toContain("sub-ana");
    expect(html).toContain("join eng as user");
    expect(html).toContain("Nothing was changed by the test.");
  });

  it("offers Turn off when it's on", () => {
    expect(controls({ canEnable: false, enabled: true })).toContain("Turn off");
  });
});

const form2 = (id: string) => {
  const data = new FormData();
  data.set("id", id);
  return data;
};

describe("the results", () => {
  it("writes out Test connection's answer: works, failed, or an error", () => {
    expect(
      renderToStaticMarkup(
        <ConnectionResult state={{ ok: true, lines: ["The keys were fetched: 1."] }} />,
      ),
    ).toContain("The connection works.");
    const failed = renderToStaticMarkup(
      <ConnectionResult state={{ ok: false, lines: ["The issuer didn't answer."] }} />,
    );
    expect(failed).toContain("The connection failed.");
    expect(failed).toContain("The issuer didn&#x27;t answer.");
    expect(
      renderToStaticMarkup(
        <ConnectionResult state={{ error: "That identity provider doesn't exist." }} />,
      ),
    ).toContain("ERR:");
    expect(renderToStaticMarkup(<ConnectionResult state={{}} />)).toBe("");
  });

  it("says when a Test sign-in didn't pass, and why", () => {
    const html = renderToStaticMarkup(
      <TestResult
        result={{
          at: "2026-10-16T13:00:00Z",
          ok: false,
          lines: ["The provider's answer didn't check out."],
          claims: null,
          decision: null,
          groupChanges: [],
        }}
        workspaceNames={{}}
      />,
    );
    expect(html).toContain("Your Test sign-in didn&#x27;t pass.");
    expect(html).toContain("didn&#x27;t check out");
    expect(html).not.toContain("A sign-in would");
  });

  it("says why the page came back after Test sign-in", () => {
    expect(renderToStaticMarkup(<TestNotice test="done" />)).toContain("its result is below");
    expect(renderToStaticMarkup(<TestNotice test="provider_error" />)).toContain(
      "didn&#x27;t answer",
    );
    expect(renderToStaticMarkup(<TestNotice test="rate_limited" />)).toContain("Too many attempts");
    expect(renderToStaticMarkup(<TestNotice test="something-else" />)).toBe("");
    expect(renderToStaticMarkup(<TestNotice />)).toBe("");
  });

  it("says to enter the client secret again when this AUTH_SECRET can't read it", () => {
    expect(renderToStaticMarkup(<UnreadableSecretNotice reason="secret_unreadable" />)).toContain(
      "Enter the client secret again.",
    );
    expect(renderToStaticMarkup(<UnreadableSecretNotice reason="provider_error" />)).toBe("");
    expect(renderToStaticMarkup(<UnreadableSecretNotice reason={null} />)).toBe("");
  });

  it("confirms Delete, saying what it does", () => {
    const html = renderToStaticMarkup(
      <DeleteConfirm
        id="acme"
        name="Acme SSO"
        open
        onClose={() => {}}
        action={() => {}}
        pending={false}
      />,
    );
    expect(html).toContain("Delete Acme SSO?");
    expect(html).toContain("People linked to it keep their accounts");
    expect(html).toContain("Delete provider");
  });
});
