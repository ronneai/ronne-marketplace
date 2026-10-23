import { describe, expect, it, vi } from "vitest";
import {
  HasReviewHistoryError,
  ReleasePackError,
  StaleFilesError,
  SubmissionInvalidError,
  SubmissionNotFoundError,
} from "@/server/domains/submissions/exceptions/errors";
import { inLocaleAsync } from "@/test/intl";

const submissions = vi.hoisted(() => ({
  withdrawSubmission: vi.fn(),
  submitDraft: vi.fn(),
  deleteSubmission: vi.fn(),
}));
const drafts = vi.hoisted(() => ({ saveDraftFiles: vi.fn(), importZip: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/drafts", () => drafts);
vi.mock("@/server/domains/submissions/actions/submissions", () => submissions);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const {
  deleteSubmissionAction,
  importZipAction,
  saveDraftAction,
  submitDraftAction,
  withdrawAction,
} = await import("./actions");

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

describe("what the actions say, in the person's language (131)", () => {
  const issue = { severity: "error" as const, code: "x", message: "`name` is required." };

  it("words a domain error, the stale files and the invalid draft too", async () => {
    submissions.withdrawSubmission.mockRejectedValueOnce(new SubmissionNotFoundError());
    expect(await inLocaleAsync("pt", () => withdrawAction("s1"))).toEqual({
      ok: false,
      error: "Essa submissão não existe.",
    });
    drafts.saveDraftFiles.mockRejectedValueOnce(new StaleFilesError(["a.md", "b.md"]));
    expect(
      await inLocaleAsync("fr", () => saveDraftAction("s1", { writes: [], deletes: [] })),
    ).toEqual({
      ok: false,
      error: expect.stringContaining("a.md, b.md ont changé depuis que vous les avez ouverts"),
      stale: ["a.md", "b.md"],
    });
    submissions.submitDraft.mockRejectedValueOnce(new SubmissionInvalidError([issue]));
    expect(await inLocaleAsync("pt", () => submitDraftAction("s1"))).toEqual({
      ok: false,
      error: "O rascunho tem 1 problema a corrigir antes de ser submetido.",
      // Core's own words stay English (131).
      issues: [issue],
    });
  });

  it("an error with no translation still shows its English message", async () => {
    const error = new ReleasePackError("The package is over 5 MB.");
    submissions.deleteSubmission.mockRejectedValueOnce(error);
    expect(await inLocaleAsync("fr", () => deleteSubmissionAction("s1"))).toEqual({
      ok: false,
      error: "The package is over 5 MB.",
    });
  });

  it("its own line is in the language too", async () => {
    expect(await inLocaleAsync("fr", () => importZipAction("s1", new FormData()))).toEqual({
      ok: false,
      error: "Choisissez un fichier .zip à importer.",
    });
  });

  it("anything that isn't a domain error is thrown on", async () => {
    submissions.deleteSubmission.mockRejectedValueOnce(new Error("database down"));
    await expect(deleteSubmissionAction("s1")).rejects.toThrow("database down");
  });
});
