// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Feature 194, task 6: the reset pages' own states, around their forms.
const state = vi.hoisted(() => ({
  signedIn: false,
  cookie: null as string | null,
  open: true,
}));
vi.mock("@/server/config", () => ({
  loadConfig: () => ({
    authSecret: "test-secret-test-secret-test-secret-00",
    publicUrl: "https://ronne.example",
  }),
}));
vi.mock("@/server/domains/identity/actions/session", () => ({
  getCurrentUser: async () => (state.signedIn ? { id: "u" } : null),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/i18n/server", () => ({
  currentPath: async () => "/sign-in/forgot",
  requestChoosableLocales: async () => ["en"],
  requestLocale: async () => "en",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookie && name === "__Secure-ronne.reset" ? { value: state.cookie } : undefined,
  }),
}));
vi.mock("@/server/domains/identity/repositories/auth-instance", () => ({
  getAppAuthIfConfigured: () => ({}),
}));
vi.mock("@/server/domains/identity/actions/password-reset", () => ({
  passwordResetOpenness: async () => ({ open: state.open, codeMinutes: 15, challenge: false }),
}));
vi.mock("@/features/forgot-password/actions", () => ({
  requestResetFromForm: vi.fn(),
  resetCodeFromForm: vi.fn(),
  resetTwoFactorFromForm: vi.fn(),
  newPasswordFromForm: vi.fn(),
  startAgainFromForm: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

const { default: Forgot } = await import("./page");
const { default: ForgotCode } = await import("./code/page");
const { default: ForgotTwoFactor } = await import("./two-factor/page");
const { default: ForgotNewPassword } = await import("./new-password/page");

const text = (element: Awaited<ReturnType<typeof Forgot>>) =>
  renderToStaticMarkup(element).replaceAll("&#x27;", "'");
const twoFactor = () => ForgotTwoFactor({ searchParams: Promise.resolve({}) });

afterEach(() => {
  state.signedIn = false;
  state.cookie = null;
  state.open = true;
});

describe("the reset pages (194)", () => {
  it("send a signed-in person to Account › Change password, every one of them", async () => {
    state.signedIn = true;
    state.cookie = "token";
    for (const page of [Forgot, ForgotCode, twoFactor, ForgotNewPassword])
      await expect(page()).rejects.toThrow("redirect:/account/password");
  });

  it("the request page goes back to sign-in while reset by email is closed", async () => {
    state.open = false;
    await expect(Forgot()).rejects.toThrow("redirect:/sign-in");
    state.open = true;
    expect(text(await Forgot())).toContain('id="email"');
  });

  it("the next pages say to start again here without the flow's cookie", async () => {
    for (const page of [ForgotCode, twoFactor, ForgotNewPassword]) {
      const html = text(await page());
      expect(html).toContain("started in another browser");
      expect(html).toContain('href="/sign-in/forgot"');
      expect(html).not.toContain('name="code"');
    }
  });

  it("with the cookie, the code page says the same for every address, and its lifetime", async () => {
    state.cookie = "token";
    const html = text(await ForgotCode());
    expect(html).toContain("If an account can reset its password with this address");
    expect(html).toContain("15 minutes");
    expect(html).toContain('name="code"');
  });

  it("a code already sent still works when reset by email is turned off meanwhile", async () => {
    state.cookie = "token";
    state.open = false;
    expect(text(await ForgotCode())).toContain('name="code"');
    expect(text(await ForgotNewPassword())).toContain('name="password"');
  });
});
