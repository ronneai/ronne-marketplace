import { describe, expect, it } from "vitest";
import * as i from "@/server/domains/items/exceptions/errors";
import * as s from "@/server/domains/submissions/exceptions/errors";
import { inLocale } from "@/test/intl";
import { errorText } from "./errors";

/**
 * The submissions and items errors the authoring and review screens show (feature 131): each reads
 * in the three languages, English is the error's own message word for word (so the API's stays as
 * it was), and the values it carries land in the sentence.
 */
type L = "en" | "pt" | "fr";
const text = (locale: L, error: Error) => inLocale(locale, () => errorText(error));
const error = { severity: "error" as const, code: "x", message: "`name` is required." };

/** One of each class and of each of its variants, with values that show up in the sentence. */
const CASES: [Error, string[]][] = [
  [new s.SubmissionNotFoundError(), []],
  [new s.InvalidItemNameError("empty"), []],
  [new s.InvalidItemNameError("too_long"), ["64"]],
  [new s.InvalidItemNameError("characters"), []],
  [new s.InvalidItemNameError("edges"), []],
  [new s.InvalidItemNameError("reserved"), []],
  [new s.InvalidItemTypeError("skil"), ["skil"]],
  [new s.InvalidItemTypeError(""), []],
  [new s.DraftScopeNotFoundError("acme/x"), ["@acme/x"]],
  [new s.SubmissionNotEditableError("submitted"), []],
  [new s.HasReviewHistoryError(), []],
  [new s.InvalidStatusTransitionError("withdrawn", "withdraw"), []],
  [new s.InvalidStatusTransitionError("changes_requested", "approve"), []],
  [new s.InvalidStatusTransitionError("published", "publish"), []],
  [new s.SubmissionInvalidError([error]), ["1"]],
  [new s.SubmissionInvalidError([error, error]), ["2"]],
  [new s.SubmissionInvalidError([error], "release"), ["`name` is required."]],
  [new s.SubmissionInvalidError([error, error, error], "release"), ["`name` is required.", "2"]],
  [new s.ItemNameTakenError("@a/x", "published"), ["@a/x"]],
  [new s.ItemNameTakenError("@a/x", "alias"), ["@a/x"]],
  [new s.ItemNameTakenError("@a/x", "taken"), ["@a/x"]],
  [new s.ItemNameTakenError("@a/x", "submission"), ["@a/x"]],
  [new s.DependencyNotVisibleError("@a/x"), ["@a/x"]],
  [new s.DependencyNotFoundError("@a/x"), ["@a/x"]],
  [new s.DependencyClosedError("@a/x", "rejected"), ["@a/x"]],
  [new s.DependencyClosedError("@a/x", "withdrawn"), ["@a/x"]],
  [new s.DependencyNotPublishedError("@a/x"), ["@a/x"]],
  [new s.DependencyUnreleasedError("@a/x", "submitted"), ["@a/x"]],
  [new s.DependencyUnreleasedError("@a/x", "approved"), ["@a/x"]],
  [new s.DependencyRangeUnmatchedError("@a/x", "^2.0.0"), ["@a/x", "^2.0.0"]],
  [new s.DependencyDraftError("@a/x"), ["@a/x"]],
  [new s.InvalidFilePathError("../x", "outside"), ["../x"]],
  [new s.InvalidFilePathError("", "empty"), []],
  [new s.InvalidFilePathError("a\\b", "backslash"), ["a\\b"]],
  [new s.InvalidFilePathError("/a", "absolute"), ["/a"]],
  [new s.InvalidFilePathError("a//b", "segment"), ["a//b"]],
  [new s.InvalidFilePathError("a\u0001", "control"), []],
  [new s.InvalidFilePathError("x".repeat(256), "too_long"), ["255"]],
  [new s.InvalidFilePathError("a.md", { twice: "upload" }), ["a.md", "upload"]],
  [new s.InvalidFileContentError("a.png"), ["a.png"]],
  [new s.ManifestRequiredError("deleted"), []],
  [new s.ManifestRequiredError("missing"), []],
  [new s.StartingFileError("SKILL.md", "skill"), ["SKILL.md", "skill"]],
  [new s.FileTooLargeError("big.md", 2_000_000, 1_048_576), ["big.md", "1.9 MB", "1 MB"]],
  [new s.DraftLimitError("files", 101, 100), ["101", "100"]],
  [new s.DraftLimitError("total", 6_000_000, 5_242_880), ["5.7 MB", "5 MB"]],
  [new s.DraftQuotaError(50), ["50"]],
  [
    new s.DraftMismatchError({ name: "@a/x", type: "skill", baseVersion: "1.0.0" }),
    ["@a/x", "skill", "1.0.0"],
  ],
  [new s.DraftMismatchError({ name: "@a/x", type: "skill", baseVersion: null }), ["@a/x"]],
  [new s.StaleFilesError(["a.md"]), ["a.md"]],
  [new s.StaleFilesError(["a.md", "b.md"]), ["a.md, b.md"]],
  [new s.ZipImportError("it isn't a .zip file.", { code: "not_zip" }), []],
  [
    new s.ZipImportError("it uses ZIP64, which is only needed for archives far over the limits.", {
      code: "zip64",
    }),
    [],
  ],
  [new s.ZipImportError("its file list is damaged.", { code: "damaged_list" }), []],
  [new s.ZipImportError("it's encrypted.", { code: "encrypted" }), []],
  [new s.ZipImportError("a.md is damaged.", { code: "damaged", entry: "a.md" }), ["a.md"]],
  [
    new s.ZipImportError("a.md uses a compression method other than deflate.", {
      code: "method",
      entry: "a.md",
    }),
    ["a.md"],
  ],
  [new s.ZipImportError("it's over 5 MB.", { code: "too_big", maxText: "5 MB" }), ["5 MB"]],
  [
    new s.ZipImportError("a is a link or special file, not a regular file.", {
      code: "link",
      entry: "a",
    }),
    ["a"],
  ],
  [
    new s.ZipImportError('the path ../a goes outside the item with "..".', {
      code: "bad_path",
      entry: "../a",
      pathCode: "outside",
    }),
    ["../a"],
  ],
  [new s.ZipImportError("it has no files.", { code: "empty" }), []],
  [
    new s.ZipImportError("it has 101 files; the limit is 100.", {
      code: "too_many",
      count: 101,
      max: 100,
    }),
    ["101", "100"],
  ],
  [
    new s.ZipImportError("a.md is 2 MB; a file can be at most 1 MB.", {
      code: "file_too_big",
      entry: "a.md",
      sizeText: "2 MB",
      maxText: "1 MB",
    }),
    ["a.md", "2 MB", "1 MB"],
  ],
  [
    new s.ZipImportError("its files add up to 6 MB; the limit is 5 MB.", {
      code: "total_too_big",
      sizeText: "6 MB",
      maxText: "5 MB",
    }),
    ["6 MB", "5 MB"],
  ],
  [new s.ZipImportError("it has a.md twice.", { code: "twice", entry: "a.md" }), ["a.md"]],
  [
    new s.ZipImportError(
      "it has no ronne.yaml, and replacing would leave the draft without one. Merge it instead.",
      { code: "no_manifest" },
    ),
    ["ronne.yaml"],
  ],
  [new s.OwnSubmissionError(true), []],
  [new s.OwnSubmissionError(false), []],
  [new s.ReviewMessageError("required", "Requesting changes"), []],
  [new s.ReviewMessageError("required", "Rejecting"), []],
  [new s.ReviewMessageError("required", "A comment"), []],
  [new s.ReviewMessageError("required", "Sending its dependents back"), []],
  [new s.ReviewMessageError("too_long", ""), []],
  [new s.BulkLimitError(60, 50), ["60", "50"]],
  [new s.ConversationClosedError(), []],
  [new s.OverrideNotNeededError(), []],
  [new s.ReleaseVersionError(), []],
  [new s.VersionExistsError("@a/x", "1.0.0"), ["@a/x", "1.0.0"]],
  [
    new s.ReleaseTagError(
      "A tag is 1 to 32 lowercase letters, digits and hyphens, starting with a letter.",
      "format",
      "Beta!",
    ),
    ["32"],
  ],
  [new s.ReleaseTagError("x reads as a version range, so it can't be a tag.", "range", "x"), ["x"]],
  [
    new s.ReleaseTagError(
      "latest can only point to a stable version, not a pre-release.",
      "latest_prerelease",
      "latest",
    ),
    ["latest"],
  ],
  [new s.ReleaseNotesError(), []],
  [new s.ProposalRenameError(), []],
  [new s.ProposalArtifactError("@a/x", "1.0.0"), ["@a/x", "1.0.0"]],
  [new s.RevisionChangedError(2, 3), ["2", "3"]],
  [new s.RevisionChangedError(null, 3), ["–", "3"]],
  [new s.ScopeMovedError("@a/x"), ["@a/x"]],
  [new s.WorkspaceRenamedError("old", "new"), ["old", "new"]],
  [new s.SubmissionStaleError("@a/x", "1.0.0", "1.1.0"), ["@a/x", "1.0.0", "1.1.0"]],
  [new s.TypeChangedError("@a/x", "skill", "agent"), ["@a/x", "skill", "agent"]],
  [new s.NotAProposalError(), []],
  [new s.ProposalCurrentError("1.0.0"), ["1.0.0"]],
  [new s.ConflictNotFoundError("a.md"), ["a.md"]],
  [new i.ItemNotFoundError("@a/x"), ["@a/x"]],
  [new i.VersionNotFoundError("@a/x", "9.9.9"), ["@a/x", "9.9.9"]],
  [
    new i.TagRuleError({
      message: "1.0.0 is yanked, so no tag can point to it.",
      code: "yanked",
      tag: "beta",
      version: "1.0.0",
      max: 20,
    }),
    ["1.0.0"],
  ],
  [
    new i.TagRuleError({
      message: "An item can have at most 20 tags.",
      code: "too_many",
      tag: "beta",
      version: "1.0.0",
      max: 20,
    }),
    ["20"],
  ],
  [
    new i.TagRuleError({
      message: "latest can't be removed; point it at another version instead.",
      code: "latest_kept",
      tag: "latest",
      version: "",
      max: 20,
    }),
    ["latest"],
  ],
  [
    new i.TagRuleError({
      message: "x reads as a version range, so it can't be a tag.",
      code: "range",
      tag: "x",
      version: "1.0.0",
      max: 20,
    }),
    ["x"],
  ],
  [new i.VersionMessageError("deprecate"), ["300"]],
  [new i.VersionMessageError("yank"), ["300"]],
  [new i.ArtifactUnavailableError("@a/x", "1.0.0"), ["@a/x", "1.0.0"]],
  [new i.VersionDependsOnPrivateError("1.0.0", "@b/y"), ["1.0.0", "@b/y"]],
];

describe("authoring and review errors in three languages (131)", () => {
  it.each(CASES)(
    "%s: English is the message word for word; pt and fr are their own",
    async (thrown, values) => {
      const english = await text("en", thrown);
      expect(english).toBe(thrown.message);
      for (const locale of ["pt", "fr"] as const) {
        const said = await text(locale, thrown);
        expect(said, `${thrown.name} in ${locale}`).not.toBe(english);
        expect(said).not.toMatch(/errors\./);
        for (const value of values)
          expect(said, `${thrown.name} ${locale}: ${value}`).toContain(value);
      }
    },
  );

  it("counts problems by each language's plural rule", async () => {
    expect(await text("pt", new s.SubmissionInvalidError([error]))).toContain("1 problema a");
    expect(await text("pt", new s.SubmissionInvalidError([error, error]))).toContain(
      "2 problemas a",
    );
    expect(await text("fr", new s.SubmissionInvalidError([error]))).toContain("1 problème à");
    expect(await text("fr", new s.StaleFilesError(["a.md", "b.md"]))).toContain(
      "ont changé depuis que vous les avez ouverts",
    );
    expect(await text("pt", new s.StaleFilesError(["a.md"]))).toContain(
      "mudou desde que você o abriu",
    );
  });

  it("a name or path that looks like a placeholder is shown as typed", async () => {
    expect(await text("pt", new s.DependencyNotFoundError("@a/{x}"))).toContain("@a/{x}");
    expect(await text("fr", new s.ConflictNotFoundError("{path}.md"))).toContain("{path}.md");
  });

  it("names the statuses and actions in each language", async () => {
    expect(await text("pt", new s.InvalidStatusTransitionError("withdrawn", "withdraw"))).toBe(
      "Uma submissão arquivada não pode ser retirada.",
    );
    expect(await text("fr", new s.DependencyUnreleasedError("@a/x", "approved"))).toBe(
      "@a/x n’est pas encore publié (il est approuvé). Publiez-le d’abord.",
    );
  });
});
