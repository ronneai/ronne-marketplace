import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/config", () => ({ loadConfig: () => ({ publicUrl: "https://ronne.example" }) }));
vi.mock("@/server/domains/identity/actions/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/features/sign-in/actions", () => ({ signInFromForm: vi.fn(), ssoFromForm: vi.fn() }));
const app = vi.hoisted(() => ({ configured: false }));
vi.mock("@/server/domains/identity/repositories/auth-instance", () => ({
  getAppAuthIfConfigured: () => (app.configured ? {} : null),
}));
const policy = vi.hoisted(() => ({
  signInProviders: vi.fn(async () => [{ id: "acme", name: "Acme SSO" }]),
  effectivePasswordPolicy: vi.fn(async () => "root_only"),
}));
vi.mock("@/server/domains/identity/actions/password-policy", () => policy);

const { default: SignIn } = await import("./page");

const render = async () =>
  renderToStaticMarkup(await SignIn({ searchParams: Promise.resolve({}) }));

afterEach(() => {
  vi.unstubAllEnvs();
  app.configured = false;
});

describe("/sign-in (#147)", () => {
  it.each([
    ["npm", "rmk-server reset-root-password"],
    ["docker", "docker compose exec web pnpm run reset-root-password"],
    ["", "pnpm run reset-root-password"],
  ])("reads RONNE_RUNTIME=%j for the Forgot? note", async (runtime, command) => {
    vi.stubEnv("RONNE_RUNTIME", runtime);
    expect(await render()).toContain(`>${command}</code>`);
  });
});

describe("/sign-in with identity providers (106)", () => {
  it("shows the providers that are on, and Root only's layout, with the provider's error", async () => {
    app.configured = true;
    const html = renderToStaticMarkup(
      await SignIn({ searchParams: Promise.resolve({ error: "provider_error" }) }),
    );
    expect(html).toContain("Continue with Acme SSO");
    expect(html).toContain("Use your password (root)");
    expect(html).toContain("That provider didn&#x27;t answer");
  });

  it("asks nothing of the database before setup", async () => {
    policy.signInProviders.mockClear();
    const html = await render();
    expect(policy.signInProviders).not.toHaveBeenCalled();
    expect(html).not.toContain("Continue with");
  });
});
