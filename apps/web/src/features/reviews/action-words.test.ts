import { describe, expect, it, vi } from "vitest";
import { SubmissionInvalidError } from "@/server/domains/submissions/exceptions/errors";
import type { Why } from "@/server/domains/submissions/models/why";
import { inLocaleAsync } from "@/test/intl";

/**
 * Two refusals whose English was built on the server (131, the task 10 witness): the Release
 * button meeting a release group's refusal, and Submit selected meeting a workspace the author
 * isn't a member of. Both read in the person's language; English stays as it was.
 */
const publish = vi.hoisted(() => ({ publishSubmission: vi.fn() }));
const submissions = vi.hoisted(() => ({ submitManyDrafts: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/publish", () => publish);
vi.mock("@/server/domains/submissions/actions/submissions", () => submissions);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { publishAction } = await import("./actions");
const { submitSelectedAction } = await import("../submissions/actions");

type L = "en" | "pt" | "fr";

/** What publishSubmission throws when the group refuses, as `publish.ts` builds it. */
const refused = (why: Why, reason: string) =>
  new SubmissionInvalidError(
    [
      {
        severity: "error",
        code: "release_group",
        message: reason.replace(/^It /, "it "),
        file: "ronne.yaml",
      },
    ],
    "release",
    why,
  );

const input = { choice: { kind: "stable", bump: "minor" }, tag: "latest" } as never;

describe("the Release button's refusal (056)", () => {
  const waits: Why = { code: "waits_on", dependency: "@a/dep", status: "submitted" };
  const said = async (l: L, error: Error) => {
    publish.publishSubmission.mockRejectedValueOnce(error);
    return inLocaleAsync(l, () => publishAction("s1", input));
  };

  it("reads in the person's language, and English as the error says it", async () => {
    const error = refused(waits, "It waits on @a/dep, which is submitted.");
    expect(await said("en", error)).toEqual({ ok: false, error: error.message });
    expect(error.message).toBe("It can't be released yet: it waits on @a/dep, which is submitted.");
    expect(await said("pt", error)).toEqual({
      ok: false,
      error: "Ainda não pode ser lançada: ela espera por @a/dep, que está submetido.",
    });
    expect(await said("fr", error)).toEqual({
      ok: false,
      error: "Elle ne peut pas encore être publiée : elle attend @a/dep, qui est soumis.",
    });
  });

  it("a reason that doesn't start with the pronoun keeps its capital, as in English", async () => {
    const error = refused(
      { code: "not_releaser" },
      "Only its author, a moderator or root releases it.",
    );
    expect(await said("en", error)).toEqual({ ok: false, error: error.message });
    expect((await said("pt", error)) as { error: string }).toEqual({
      ok: false,
      error: "Ainda não pode ser lançada: Só o autor, um moderador ou o root a lança.",
    });
  });
});

describe("Submit selected, outside the author's workspaces (091)", () => {
  it("says to join the workspace in the person's language", async () => {
    submissions.submitManyDrafts.mockResolvedValue({
      results: [
        {
          id: "s1",
          result: "not_a_member",
          submission: { scope: "acme", name: "x", workspace: { name: "acme" } },
          issues: [{ severity: "error", code: "not_a_member", message: "English." }],
        },
      ],
    });
    const [pt] = await inLocaleAsync("pt", () => submitSelectedAction(["s1"]));
    expect(pt?.reasons).toEqual([expect.stringContaining("acme")]);
    expect(pt?.reasons[0]).not.toContain("You aren't");
    expect(pt?.joinWorkspace).toBe("acme");
    const [en] = await inLocaleAsync("en", () => submitSelectedAction(["s1"]));
    expect(en?.reasons).toEqual([
      "You aren't a member of the acme workspace. Ask to join acme to propose changes.",
    ]);
  });
});
