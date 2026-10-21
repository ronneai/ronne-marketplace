import { describe, expect, it } from "vitest";
import { UserNotFoundError } from "@/server/domains/identity/exceptions/errors";
import {
  ItemRenamedMeanwhileError,
  NotAMemberError,
  ProposalArtifactError,
  ProposalBaseNotFoundError,
  SubmissionNotFoundError,
} from "@/server/domains/submissions/exceptions/errors";
import * as w from "@/server/domains/workspaces/exceptions/errors";
import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import { inLocale } from "@/test/intl";
import { errorText } from "./errors";

/**
 * The workspaces domain's errors, and the ones the browse screens can show besides (feature 130):
 * each reads in the three languages, English is the error's own message word for word, and the
 * values it carries land in the sentence.
 */
type L = "en" | "pt" | "fr";
const text = (locale: L, error: Error) => inLocale(locale, () => errorText(error));

const impact = {} as MoveImpact;

/** One of each class, with values that show up in the sentence. */
const CASES: [Error, string[]][] = [
  [new w.InvalidWorkspaceNameError("empty"), []],
  [new w.InvalidWorkspaceNameError("too_long"), ["64"]],
  [new w.InvalidWorkspaceNameError("characters"), []],
  [new w.InvalidWorkspaceNameError("edges"), []],
  [new w.InvalidWorkspaceNameError("reserved"), []],
  [new w.InvalidWorkspaceDescriptionError(), ["300"]],
  [new w.InvalidWorkspaceVisibilityError(), []],
  [new w.WorkspaceNameTakenError("acme"), ["acme"]],
  [new w.WorkspaceNotFoundError(), []],
  [new w.GlobalWorkspaceError(), []],
  [new w.WorkspaceNotEmptyError(2), []],
  [new w.GlobalMembershipError(), []],
  [new w.RootMembershipError(), []],
  [new w.MemberUserNotFoundError(), []],
  [new UserNotFoundError(), []],
  [new w.NotAWorkspaceMemberError("acme"), ["acme"]],
  [new w.InvalidMemberRoleError("owner"), ["owner"]],
  [new w.OwnMembershipError(), []],
  [new w.WorkspaceHasOutsideDependentsError("acme", ["@a/x"]), ["acme", "@a/x"]],
  [new w.WorkspaceHasOutsideDependentsError("acme", ["@a/x", "@b/y"]), ["@a/x, @b/y"]],
  [new w.AccessRequestNotFoundError(), []],
  [new w.AccessRequestAnsweredError(), []],
  [new w.InvalidAccessRequestTextError("message"), ["500"]],
  [new w.InvalidAccessRequestTextError("reason"), ["500"]],
  [new w.TooManyAccessRequestsError(10), ["10"]],
  [new w.AccessRequestTooSoonError(new Date("2026-10-16T09:00:00Z")), ["2026-10-16"]],
  [new w.InvalidRequestRoleError("admin"), ["admin"]],
  [new w.WorkspaceRenameAliasError([], 1), []],
  [new w.WorkspaceRenameAliasError(["@a/x"]), ["@a/x"]],
  [new w.WorkspaceRenameAliasError(["@a/x", "@b/y"], 3), ["@a/x, @b/y", "3"]],
  [new w.PersonalWorkspaceError("members"), []],
  [new w.PersonalWorkspaceError("visibility"), []],
  [new w.PersonalWorkspaceError("delete"), []],
  [new w.ScopeMoveScopeNotFoundError(), []],
  [new w.ScopeMoveSameWorkspaceError("acme"), ["acme"]],
  [new w.ScopeMoveRefusedError(impact), []],
  [new w.ScopeMoveOpenError("acme"), ["acme"]],
  [new w.ScopeMoveConfirmationError("infra"), ["infra"]],
  [new w.ScopeMoveNotFoundError(), []],
  [new w.ScopeMoveAnsweredError(), []],
  [new w.ScopeMoveAskerLostRoleError(), []],
  [new w.InvalidScopeMoveTextError("message"), ["500"]],
  [new w.InvalidScopeMoveTextError("reason"), ["500"]],
  [new NotAMemberError("acme"), ["acme"]],
  [new NotAMemberError("acme", "release"), ["acme"]],
  [new NotAMemberError("acme", "comment"), ["acme"]],
  [new SubmissionNotFoundError(), []],
  [new ProposalBaseNotFoundError("@a/x"), ["@a/x"]],
  [new ProposalBaseNotFoundError("@a/x", "1.2.0"), ["@a/x", "1.2.0"]],
  [new ProposalArtifactError("@a/x", "1.2.0"), ["@a/x", "1.2.0"]],
  [new ItemRenamedMeanwhileError("@a/x", "@a/y"), ["@a/x", "@a/y"]],
];

describe("workspace and proposal errors in three languages (130)", () => {
  it.each(CASES)(
    "%s: English is the message word for word; pt and fr are their own",
    async (error, values) => {
      const english = await text("en", error);
      expect(english).toBe(error.message);
      for (const locale of ["pt", "fr"] as const) {
        const said = await text(locale, error);
        expect(said, `${error.name} in ${locale}`).not.toBe(english);
        expect(said).not.toMatch(/[{}]|errors\./);
        for (const value of values)
          expect(said, `${error.name} ${locale}: ${value}`).toContain(value);
      }
    },
  );

  it("a list and a plural: the dependents and the names that stay", async () => {
    const one = new w.WorkspaceHasOutsideDependentsError("acme", ["@a/x"]);
    const two = new w.WorkspaceHasOutsideDependentsError("acme", ["@a/x", "@b/y"]);
    expect(await text("pt", one)).toContain("1 item fora de acme depende dos itens dele: @a/x.");
    expect(await text("pt", two)).toContain(
      "2 itens fora de acme dependem dos itens dele: @a/x, @b/y.",
    );
    expect(await text("fr", one)).toContain(
      "1 élément hors de acme dépend de ses éléments : @a/x.",
    );
    expect(await text("fr", two)).toContain("2 éléments hors de acme dépendent de ses éléments");
    const hidden = new w.WorkspaceRenameAliasError(["@a/x", "@b/y"], 3);
    expect(await text("pt", hidden)).toContain(
      "tinham estes nomes antes e os mantêm: @a/x, @b/y, e mais 3. Escolha outro nome",
    );
    expect(await text("fr", hidden)).toContain(
      "avaient ces noms avant et les gardent : @a/x, @b/y, et 3 de plus.",
    );
    const only = new w.WorkspaceRenameAliasError([], 1);
    expect(await text("pt", only)).toBe(
      "Outros itens tinham este nome antes e o mantêm. Escolha outro nome para o espaço de trabalho.",
    );
  });

  it("a date is the day, in each language's sentence", async () => {
    const error = new w.AccessRequestTooSoonError(new Date("2026-10-16T09:00:00Z"));
    expect(await text("pt", error)).toBe(
      "Sua última solicitação foi recusada. Você pode pedir de novo a partir de 2026-10-16.",
    );
    expect(await text("fr", error)).toBe(
      "Votre dernière demande a été refusée. Vous pourrez redemander à partir du 2026-10-16.",
    );
  });

  it("what joining would let them do follows the action", async () => {
    expect(await text("pt", new NotAMemberError("acme", "release"))).toContain(
      "lançar seus itens lá",
    );
    expect(await text("pt", new NotAMemberError("acme", "comment"))).toContain("comentar lá");
    expect(await text("fr", new NotAMemberError("acme"))).toContain("proposer des modifications");
  });

  it("a name that looks like a placeholder is shown as typed", async () => {
    const error = new w.WorkspaceNameTakenError("{x}-<b>");
    expect(await text("pt", error)).toContain("{x}-<b>");
  });

  it("the API's message is untouched: the error's own English", () => {
    for (const [error] of CASES) expect(error.message).not.toMatch(/errors\./);
    // A value outside the three still gives the default sentence, never "undefined".
    for (const odd of ["x y", "__proto__", "constructor", "toString"])
      expect(new NotAMemberError("acme", odd as never).message, odd).toContain(
        "to propose changes.",
      );
    expect(new NotAMemberError("acme", "release").message).toBe(
      "You aren't a member of the acme workspace. Ask to join acme to release your items there.",
    );
  });
});
