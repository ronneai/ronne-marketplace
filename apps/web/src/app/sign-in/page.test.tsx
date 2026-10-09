import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/config", () => ({ loadConfig: () => ({ publicUrl: "https://ronne.example" }) }));
vi.mock("@/server/domains/identity/actions/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/features/sign-in/actions", () => ({ signInFromForm: vi.fn() }));

const { default: SignIn } = await import("./page");

const render = async () =>
  renderToStaticMarkup(await SignIn({ searchParams: Promise.resolve({}) }));

afterEach(() => vi.unstubAllEnvs());

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
