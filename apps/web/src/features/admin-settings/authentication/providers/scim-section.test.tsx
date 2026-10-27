import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoScimTokenError, ScimOffError } from "@/server/domains/identity/exceptions/errors";

// The SCIM section of a provider's page (108), in each of its states, and its server actions.
const scim = vi.hoisted(() => ({
  turnOnScim: vi.fn(),
  turnOffScim: vi.fn(),
  generateScimToken: vi.fn(),
  rotateScimToken: vi.fn(),
  revokeScimToken: vi.fn(),
  scimPanel: vi.fn(),
}));
vi.mock("@/server/domains/identity/actions/scim-settings", () => scim);
vi.mock("@/server/domains/identity/actions/identity-providers", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

const actions = await import("./actions");
const { NewToken, ScimSection } = await import("./ScimSection");
const { HELP } = await import("@/components/help/Help");
const { DOCS_URL, topicOf } = await import("@/components/help/topics");

const BASE = "https://ronne.example/api/v1/scim/v2";
const TOKEN = `scim_${"A".repeat(43)}`;
const section = (overrides: Partial<Parameters<typeof ScimSection>[0]> = {}) =>
  renderToStaticMarkup(
    <ScimSection
      id="acme"
      name="Acme SSO"
      preset="okta"
      enabledAt={null}
      base={BASE}
      tokens={[]}
      {...overrides}
    />,
  );
/** How often a text appears: a closed confirm dialog is in the markup too. */
const count = (html: string, text: string) => html.split(text).length - 1;
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  for (const fn of Object.values(scim)) fn.mockReset();
});

describe("the SCIM section", () => {
  it("off: says so, and offers only Turn on SCIM, with the helper", () => {
    const html = section();
    expect(html).toContain("Provisioning (SCIM)");
    expect(html).toContain(">Off<");
    expect(html).toContain("Turn on SCIM");
    expect(html).not.toContain(BASE);
    expect(html).not.toContain("Generate token");
    expect(html).toContain("What does the provider need?");
  });

  it("on without a token: the base URL to copy, Generate, Turn off, and the provider's steps", () => {
    const html = section({ enabledAt: "2026-10-18T12:00:00.000Z" });
    expect(html).toContain(">On<");
    expect(html).toContain(BASE);
    expect(html).toContain("No token yet");
    expect(html).toContain("Generate token");
    // Rotate and Revoke only inside their (closed) dialogs, never as buttons on the page.
    expect(count(html, ">Rotate<")).toBe(1);
    expect(count(html, ">Revoke<")).toBe(1);
    expect(html).toContain("Turn off SCIM");
    // Okta's steps.
    expect(html).toContain("SCIM connector base URL");
  });

  it("on with a token: when and by whom it was made, last used, Rotate and Revoke", () => {
    const html = section({
      enabledAt: "2026-10-18T12:00:00.000Z",
      tokens: [
        {
          id: "t1",
          createdAt: "2026-10-18T12:00:00.000Z",
          createdBy: "root@example.com",
          expiresAt: null,
          lastUsedAt: null,
        },
      ],
    });
    expect(html).toContain("by root@example.com");
    expect(html).toContain("Never");
    // Each as a button on the page, and in its confirm dialog.
    expect(count(html, ">Rotate<")).toBe(2);
    expect(count(html, ">Revoke<")).toBe(2);
    expect(html).not.toContain("Generate token");
    expect(html).not.toContain(TOKEN);
  });

  it("after a rotation: says until when the token before still works", () => {
    const html = section({
      enabledAt: "2026-10-18T12:00:00.000Z",
      tokens: [
        {
          id: "t2",
          createdAt: "2026-10-18T13:00:00.000Z",
          createdBy: null,
          expiresAt: null,
          lastUsedAt: null,
        },
        {
          id: "t1",
          createdAt: "2026-10-18T12:00:00.000Z",
          createdBy: null,
          expiresAt: "2026-10-19T13:00:00.000Z",
          lastUsedAt: "2026-10-18T12:30:00.000Z",
        },
      ],
    });
    expect(html).toContain("The token before the last rotation works until");
    expect(html).toContain("last used");
  });

  it("shows Entra's steps, objectId mapped to externalId, and generic ones for other presets", () => {
    expect(section({ preset: "entra", enabledAt: "2026-10-18T12:00:00.000Z" })).toContain(
      "map objectId to externalId",
    );
    expect(section({ preset: "keycloak", enabledAt: "2026-10-18T12:00:00.000Z" })).toContain(
      "an id that never changes as externalId",
    );
  });

  it("shows a new token once, with when the one before stops after a rotation, and nothing otherwise", () => {
    const made = renderToStaticMarkup(<NewToken state={{ token: TOKEN }} />);
    expect(made).toContain("Copy the token now");
    expect(made).toContain(TOKEN);
    expect(made).not.toContain("keeps working until");
    const rotated = renderToStaticMarkup(
      <NewToken state={{ token: TOKEN, previousExpiresAt: "2026-10-19T12:00:00.000Z" }} />,
    );
    expect(rotated).toContain("The token before keeps working until");
    expect(renderToStaticMarkup(<NewToken state={{}} />)).toBe("");
    expect(renderToStaticMarkup(<NewToken state={{ error: "Nope" }} />)).toBe("");
  });

  it("its helper leads to the Authentication topic's SCIM section", () => {
    expect(HELP["scim-provider"].href).toBe(`${DOCS_URL}/authentication#scim`);
    expect(HELP["scim-managed"].href).toBe(`${DOCS_URL}/authentication#scim`);
    expect(topicOf("authentication")?.sections.map((s) => s.id)).toEqual(
      expect.arrayContaining(["scim", "scim-groups"]),
    );
  });
});

describe("the SCIM section's actions", () => {
  it("Generate answers the new token, once", async () => {
    scim.generateScimToken.mockResolvedValue({ token: TOKEN, id: "t1" });
    expect(await actions.generateScimFromForm({}, form({ id: "acme" }))).toEqual({ token: TOKEN });
    expect(scim.generateScimToken).toHaveBeenCalledWith(expect.any(Headers), "acme");
  });

  it("Rotate answers the new token and when the one before stops", async () => {
    scim.rotateScimToken.mockResolvedValue({
      token: TOKEN,
      id: "t2",
      previousExpiresAt: new Date("2026-10-19T12:00:00.000Z"),
    });
    expect(await actions.generateScimFromForm({}, form({ id: "acme", rotate: "yes" }))).toEqual({
      token: TOKEN,
      previousExpiresAt: "2026-10-19T12:00:00.000Z",
    });
  });

  it("says what went wrong instead of throwing", async () => {
    scim.generateScimToken.mockRejectedValue(new ScimOffError());
    expect(await actions.generateScimFromForm({}, form({ id: "acme" }))).toEqual({
      error: new ScimOffError().message,
    });
    scim.rotateScimToken.mockRejectedValue(new NoScimTokenError());
    expect(await actions.generateScimFromForm({}, form({ id: "acme", rotate: "yes" }))).toEqual({
      error: new NoScimTokenError().message,
    });
  });

  it("Turn on, Turn off and Revoke go back to the provider's page", async () => {
    const page = "/admin/settings?tab=authentication&provider=acme";
    for (const [action, run] of [
      [actions.turnOnScimFromForm, scim.turnOnScim],
      [actions.turnOffScimFromForm, scim.turnOffScim],
      [actions.revokeScimFromForm, scim.revokeScimToken],
    ] as const) {
      run.mockResolvedValue({});
      await expect(action({}, form({ id: "acme" }))).rejects.toThrow(`NEXT_REDIRECT ${page}`);
      expect(run).toHaveBeenCalledWith(expect.any(Headers), "acme");
    }
  });
});
