import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 105: every server action holds someone root requires to use two-factor who hasn't set
// it up, except the ones marked `whileHeld` (the enrolment page's, signing out).
const hold = vi.hoisted(() => ({ requirement: null as null | "reviewers" | "everyone" }));
const scope = vi.hoisted(() => ({ inRequest: true }));
const password = vi.hoisted(() => ({ held: false }));
const terms = vi.hoisted(() => ({ held: false }));
vi.mock("./terms-hold", () => ({
  TERMS_PATH: "/account/terms",
  termsHold: vi.fn(async () => terms.held),
}));
vi.mock("./password-change-hold", () => ({
  PASSWORD_PATH: "/account/password",
  passwordChangeHold: vi.fn(async () => password.held),
}));
vi.mock("./two-factor-hold", () => ({
  SECURITY_PATH: "/account/security",
  twoFactorHold: vi.fn(async () => hold.requirement),
}));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (!scope.inRequest) throw new Error("`headers` was called outside a request scope.");
    return new Headers({ cookie: "ronne.session_token=x" });
  },
  cookies: async () => {
    if (!scope.inRequest) throw new Error("`cookies` was called outside a request scope.");
    return { toString: () => "ronne.session_token=x" };
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { serverAction } = await import("./server-action");

beforeEach(() => {
  hold.requirement = null;
  password.held = false;
  terms.held = false;
  scope.inRequest = true;
});

describe("serverAction and the two-factor hold (105)", () => {
  it("sends a held person to /account/security without running the action (a stale tab too)", async () => {
    hold.requirement = "reviewers";
    const ran = vi.fn(async () => "done");
    await expect(serverAction(ran)()).rejects.toThrow("REDIRECT /account/security");
    expect(ran).not.toHaveBeenCalled();
  });

  it("runs the actions marked whileHeld for a held person", async () => {
    hold.requirement = "everyone";
    expect(await serverAction(async () => "enrolled", { whileHeld: true })()).toBe("enrolled");
  });

  it("runs every action for someone not held", async () => {
    expect(await serverAction(async (x: number) => x + 1)(1)).toBe(2);
  });

  it("holds nobody outside a request (a script or a test calling the action)", async () => {
    hold.requirement = "everyone";
    scope.inRequest = false;
    expect(await serverAction(async () => "ran")()).toBe("ran");
  });

  it("sends someone who must change their password to the change page, unless the action is whilePasswordHeld (128)", async () => {
    password.held = true;
    const ran = vi.fn(async () => "done");
    await expect(serverAction(ran)()).rejects.toThrow("REDIRECT /account/password");
    // whileHeld is for two-factor only: the enrolment page's actions wait for the new password.
    await expect(serverAction(ran, { whileHeld: true })()).rejects.toThrow(
      "REDIRECT /account/password",
    );
    expect(ran).not.toHaveBeenCalled();
    expect(await serverAction(ran, { whilePasswordHeld: true })()).toBe("done");
  });

  it("puts the password first: a person held for both reaches only the password actions (128)", async () => {
    password.held = true;
    hold.requirement = "everyone";
    const ran = vi.fn(async () => "done");
    await expect(serverAction(ran, { whileHeld: true })()).rejects.toThrow(
      "REDIRECT /account/password",
    );
    expect(await serverAction(ran, { whilePasswordHeld: true })()).toBe("done");
    password.held = false;
    await expect(serverAction(ran)()).rejects.toThrow("REDIRECT /account/security");
  });
});

describe("serverAction and the terms hold (190)", () => {
  it("sends someone who must accept new terms to the terms page, unless the action is open to them", async () => {
    terms.held = true;
    await expect(serverAction(async () => "done")()).rejects.toThrow("REDIRECT /account/terms");
    expect(await serverAction(async () => "done", { whileTermsHeld: true })()).toBe("done");
    // The password-change hold's own actions don't open to it.
    await expect(serverAction(async () => "done", { whilePasswordHeld: true })()).rejects.toThrow(
      "REDIRECT /account/terms",
    );
  });

  it("comes after the password change and before two-factor", async () => {
    terms.held = true;
    password.held = true;
    hold.requirement = "everyone";
    await expect(serverAction(async () => "done", { whileTermsHeld: true })()).rejects.toThrow(
      "REDIRECT /account/password",
    );
    password.held = false;
    await expect(serverAction(async () => "done", { whileHeld: true })()).rejects.toThrow(
      "REDIRECT /account/terms",
    );
    terms.held = false;
    expect(await serverAction(async () => "done", { whileHeld: true })()).toBe("done");
  });
});
