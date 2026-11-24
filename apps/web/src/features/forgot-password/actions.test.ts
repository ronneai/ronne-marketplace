import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({
  set: vi.fn(),
  delete: vi.fn(),
  value: "token" as string | undefined,
}));
const reset = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  checkResetCode: vi.fn(),
  checkResetTwoFactor: vi.fn(),
  completePasswordReset: vi.fn(),
}));
vi.mock("@/server/domains/identity/actions/password-reset", () => reset);
vi.mock("@/server/config", () => ({
  loadConfig: () => ({
    authSecret: "test-secret-test-secret-test-secret-00",
    publicUrl: "https://ronne.example",
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value ? { value: jar.value } : undefined),
    set: jar.set,
    delete: jar.delete,
  }),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/server/http/server-action", () => ({
  serverAction: <A extends unknown[], R>(action: (...args: A) => Promise<R>) => action,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const actions = await import("./actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  jar.set.mockReset();
  jar.delete.mockReset();
  for (const fn of Object.values(reset)) fn.mockReset();
});

describe("the reset pages' actions (194)", () => {
  it("sets the flow's cookie as the spec says, over https", async () => {
    reset.requestPasswordReset.mockResolvedValue({
      ok: true,
      token: "new-token",
      expiresAt: new Date(),
    });
    await expect(actions.requestResetFromForm({}, form({ email: "a@acme.com" }))).rejects.toThrow(
      "REDIRECT /sign-in/forgot/code",
    );
    expect(jar.set).toHaveBeenCalledWith("__Secure-ronne.reset", "new-token", {
      httpOnly: true,
      sameSite: "strict",
      path: "/sign-in/forgot",
      secure: true,
      maxAge: 3600,
    });
  });

  it("clears it with the same options, so a Secure cookie is really replaced", async () => {
    await expect(actions.startAgainFromForm(new FormData())).rejects.toThrow(
      "REDIRECT /sign-in/forgot",
    );
    expect(jar.delete).not.toHaveBeenCalled();
    expect(jar.set).toHaveBeenCalledWith(
      "__Secure-ronne.reset",
      "",
      expect.objectContaining({ secure: true, path: "/sign-in/forgot", httpOnly: true, maxAge: 0 }),
    );
  });

  it("posts the token box ticked or not, and lands on sign-in once done", async () => {
    reset.completePasswordReset.mockResolvedValue({ ok: true, done: true });
    await expect(
      actions.newPasswordFromForm({}, form({ password: "p", confirm: "p" })),
    ).rejects.toThrow("REDIRECT /sign-in?reset=done");
    expect(reset.completePasswordReset).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ token: "token", revokeTokens: false }),
    );
    await expect(
      actions.newPasswordFromForm({}, form({ password: "p", confirm: "p", revokeTokens: "on" })),
    ).rejects.toThrow();
    expect(reset.completePasswordReset).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ revokeTokens: true }),
    );
  });
});
