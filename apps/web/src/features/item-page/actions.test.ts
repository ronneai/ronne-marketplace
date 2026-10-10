import { describe, expect, it, vi } from "vitest";
import {
  NotAMemberError,
  ProposalBaseNotFoundError,
} from "@/server/domains/submissions/exceptions/errors";

const proposals = vi.hoisted(() => ({ proposeChange: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/proposals", () => proposals);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { proposeChangeAction } = await import("./actions");

describe("proposeChangeAction", () => {
  it("starts a proposal from the shown version, or says why it can't", async () => {
    proposals.proposeChange.mockResolvedValue({ id: "01J0000000000000000000000A" });
    expect(await proposeChangeAction("@team/fmt", "1.0.0")).toEqual({
      ok: true,
      id: "01J0000000000000000000000A",
    });
    expect(proposals.proposeChange).toHaveBeenCalledWith(expect.any(Headers), {
      item: "@team/fmt",
      version: "1.0.0",
    });
    proposals.proposeChange.mockRejectedValue(new ProposalBaseNotFoundError("@team/fmt", "9.9.9"));
    expect(await proposeChangeAction("@team/fmt", "9.9.9")).toEqual({
      ok: false,
      error: "@team/fmt has no version 9.9.9 to propose a change to.",
    });
    // Not a member of the item's workspace (091): the page adds Ask to join it (094).
    proposals.proposeChange.mockRejectedValue(new NotAMemberError("acme"));
    expect(await proposeChangeAction("@acme/fmt", "1.0.0")).toEqual({
      ok: false,
      error: new NotAMemberError("acme").message,
      joinWorkspace: "acme",
    });
    proposals.proposeChange.mockRejectedValue(new Error("boom"));
    await expect(proposeChangeAction("@team/fmt", "1.0.0")).rejects.toThrow("boom");
  });
});
