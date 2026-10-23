import { describe, expect, it, vi } from "vitest";
import {
  HasReviewHistoryError,
  SubmissionNotFoundError,
} from "@/server/domains/submissions/exceptions/errors";

const submissions = vi.hoisted(() => ({ withdrawSubmission: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/submissions", () => submissions);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const { withdrawAction } = await import("./actions");

describe("withdrawAction", () => {
  it("flags a refusal because reviewers took part, so the dialog offers only archiving (057)", async () => {
    submissions.withdrawSubmission.mockRejectedValueOnce(new HasReviewHistoryError());
    expect(await withdrawAction("s1", "delete")).toEqual({
      ok: false,
      error: new HasReviewHistoryError().message,
      reviewHistory: true,
    });
    // Any other refusal has no flag: the dialog shows it and keeps the choice.
    submissions.withdrawSubmission.mockRejectedValueOnce(new SubmissionNotFoundError());
    expect(await withdrawAction("s1", "delete")).toEqual({
      ok: false,
      error: new SubmissionNotFoundError().message,
    });
    submissions.withdrawSubmission.mockResolvedValueOnce(undefined);
    expect(await withdrawAction("s1", "archive")).toEqual({ ok: true });
  });
});
