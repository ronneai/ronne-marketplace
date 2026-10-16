import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 105: every server action holds someone root requires to use two-factor who hasn't set
// it up, except the ones marked `whileHeld` (the enrolment page's, signing out).
const hold = vi.hoisted(() => ({ requirement: null as null | "reviewers" | "everyone" }));
const scope = vi.hoisted(() => ({ inRequest: true }));
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
});
