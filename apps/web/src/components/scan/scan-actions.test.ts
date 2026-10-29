import { beforeEach, describe, expect, it, vi } from "vitest";

const scans = vi.hoisted(() => ({ dismissFinding: vi.fn(), restoreFinding: vi.fn() }));
vi.mock("@/server/domains/scans/actions/scans", () => scans);
vi.mock("@/server/domains/identity/repositories/auth-instance", () => ({ getAppAuth: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { markFalsePositive, restoreFalsePositive } = await import("./scan-actions");

beforeEach(() => vi.clearAllMocks());

describe("the false-positive actions (137)", () => {
  it("answers a request that isn't an object with words, and never calls the service", async () => {
    for (const input of [null, undefined, "x", 1, ["scan"]]) {
      expect(await markFalsePositive(input as never)).toEqual({
        error: "That finding no longer exists, or you can't see it.",
      });
      expect(await restoreFalsePositive(input as never)).toEqual({
        error: "That finding no longer exists, or you can't see it.",
      });
    }
    expect(scans.dismissFinding).not.toHaveBeenCalled();
    expect(scans.restoreFinding).not.toHaveBeenCalled();
  });

  it("passes a request on, and says nothing when it went", async () => {
    const input = { scanId: "s", finding: 0, reason: "Why.", kind: "accepted", submissionId: "x" };
    expect(await markFalsePositive(input as never)).toEqual({});
    expect(scans.dismissFinding).toHaveBeenCalledWith(expect.any(Headers), input);
  });
});
