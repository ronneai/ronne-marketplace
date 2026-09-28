import { describe, expect, it, vi } from "vitest";
import type { Auth } from "./better-auth";
import { betterAuthSessionStore } from "./better-auth-session-store";

/**
 * Better Auth's APIError as another copy of the module throws it: the same name and status, but
 * not the class this module imports. Under `next dev` a wrong password crashed the sign-in page
 * this way instead of showing "Invalid email or password".
 */
class ForeignAPIError extends Error {
  override name = "APIError";
  constructor(
    readonly statusCode: number,
    readonly body?: { code: string },
  ) {
    super("Invalid email or password");
  }
}

const authThrowing = (error: unknown) =>
  ({
    api: {
      signInEmail: vi.fn().mockRejectedValue(error),
      changePassword: vi.fn().mockRejectedValue(error),
    },
  }) as unknown as Auth;

describe("betterAuthSessionStore", () => {
  it("treats a refusal from another copy of better-auth as wrong credentials, not a crash", async () => {
    const store = betterAuthSessionStore(authThrowing(new ForeignAPIError(401)));
    await expect(
      store.signIn(new Headers(), { email: "a@example.com", password: "wrong", rememberMe: false }),
    ).resolves.toBeNull();
  });

  it("still throws real failures", async () => {
    const store = betterAuthSessionStore(authThrowing(new ForeignAPIError(500)));
    await expect(
      store.signIn(new Headers(), { email: "a@example.com", password: "x", rememberMe: false }),
    ).rejects.toThrow();
    const broken = betterAuthSessionStore(authThrowing(new Error("database down")));
    await expect(
      broken.signIn(new Headers(), { email: "a@example.com", password: "x", rememberMe: false }),
    ).rejects.toThrow("database down");
  });

  it("treats a wrong current password from another copy as a wrong password", async () => {
    const store = betterAuthSessionStore(
      authThrowing(new ForeignAPIError(400, { code: "INVALID_PASSWORD" })),
    );
    await expect(store.changePassword(new Headers(), "wrong", "a new passphrase")).resolves.toBe(
      false,
    );
  });
});
