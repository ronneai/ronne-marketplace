import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { NotAMemberError } from "@/server/domains/submissions/exceptions/errors";
import {
  AccessRequestAnsweredError,
  AccessRequestTooSoonError,
  OwnMembershipError,
  ScopeMoveAnsweredError,
  ScopeMoveRefusedError,
  TooManyAccessRequestsError,
} from "@/server/domains/workspaces/exceptions/errors";
import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import { inLocaleAsync } from "@/test/intl";

/**
 * What the browse screens' actions say, in the person's language (feature 130): the success lines
 * and the errors, from the request's language, with the API's English messages untouched.
 */
const workspaces = vi.hoisted(() => ({
  requestAccess: vi.fn(),
  cancelAccessRequest: vi.fn(),
  addMembers: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  memberCandidates: vi.fn(),
  approveAccessRequest: vi.fn(),
  declineAccessRequest: vi.fn(),
  approveScopeMove: vi.fn(),
  declineScopeMove: vi.fn(),
}));
const proposals = vi.hoisted(() => ({ proposeChange: vi.fn() }));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("@/server/domains/submissions/actions/proposals", () => proposals);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const request = await import("./actions");
const members = await import("../workspace-members/actions");
const answers = await import("../workspace-requests/actions");
const { proposeChangeAction } = await import("../item-page/actions");

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields))
    for (const one of [value].flat()) data.append(key, one);
  return data;
};
const say = <T>(locale: "en" | "pt" | "fr", work: () => Promise<T>) => inLocaleAsync(locale, work);

beforeEach(() => vi.clearAllMocks());

describe("the request actions", () => {
  it("say sent, already in and cancelled in the language", async () => {
    workspaces.requestAccess.mockResolvedValue("sent");
    expect(
      await say("pt", () => request.requestAccessFromForm({}, form({ workspace: "acme" }))),
    ).toEqual({ done: "Solicitação enviada." });
    expect(
      await say("fr", () => request.requestAccessFromForm({}, form({ workspace: "acme" }))),
    ).toEqual({ done: "Demande envoyée." });
    workspaces.requestAccess.mockResolvedValue("already_member");
    expect(
      await say("pt", () => request.requestAccessFromForm({}, form({ workspace: "acme" }))),
    ).toEqual({ done: "Você já está nele." });
    workspaces.cancelAccessRequest.mockResolvedValue(undefined);
    expect(
      await say("fr", () =>
        request.cancelRequestFromForm({}, form({ requestId: "r1", workspace: "acme" })),
      ),
    ).toEqual({ done: "Demande annulée." });
  });

  it("show a refusal in the language, with its values", async () => {
    workspaces.requestAccess.mockRejectedValueOnce(new TooManyAccessRequestsError(10));
    expect(
      (await say("pt", () => request.requestAccessFromForm({}, form({ workspace: "acme" })))).error,
    ).toBe("Você já tem 10 solicitações abertas. Cancele uma ou espere uma resposta.");
    workspaces.requestAccess.mockRejectedValueOnce(
      new AccessRequestTooSoonError(new Date("2026-10-16T00:00:00Z")),
    );
    expect(
      (await say("fr", () => request.requestAccessFromForm({}, form({ workspace: "acme" })))).error,
    ).toContain("à partir du 2026-10-16");
    workspaces.requestAccess.mockRejectedValueOnce(new ForbiddenError("account.manage_own"));
    expect(
      (await say("fr", () => request.requestAccessFromForm({}, form({ workspace: "acme" })))).error,
    ).toContain("account.manage_own");
    // English stays the error's own message.
    workspaces.requestAccess.mockRejectedValueOnce(new TooManyAccessRequestsError(10));
    expect(
      (await say("en", () => request.requestAccessFromForm({}, form({ workspace: "acme" })))).error,
    ).toBe(new TooManyAccessRequestsError(10).message);
  });

  it("an error that isn't the domain's still throws", async () => {
    workspaces.requestAccess.mockRejectedValueOnce(new Error("boom"));
    await expect(
      say("pt", () => request.requestAccessFromForm({}, form({ workspace: "acme" }))),
    ).rejects.toThrow("boom");
  });
});

describe("the member actions", () => {
  it("count the people added and already in, by the language's plural", async () => {
    const results = (added: number, already: number) => [
      ...Array.from({ length: added }, (_, i) => ({ userId: `a${i}`, result: "added" })),
      ...Array.from({ length: already }, (_, i) => ({ userId: `b${i}`, result: "already_member" })),
    ];
    const add = (locale: "en" | "pt" | "fr", added: number, already: number) => {
      workspaces.addMembers.mockResolvedValueOnce(results(added, already));
      return say(locale, () =>
        members.addMembersFromForm(
          {},
          form({ workspaceId: "w1", workspace: "acme", userId: ["x"], role: "user" }),
        ),
      );
    };
    expect(await add("en", 2, 1)).toEqual({ done: "Added 2 people; 1 person already in it." });
    expect(await add("en", 1, 0)).toEqual({ done: "Added 1 person." });
    expect(await add("pt", 2, 1)).toEqual({
      done: "2 pessoas adicionadas; 1 pessoa já estava nele.",
    });
    expect(await add("pt", 0, 0)).toEqual({ done: "0 pessoa adicionada." });
    expect(await add("fr", 2, 2)).toEqual({
      done: "2 personnes ajoutées; 2 personnes en faisaient déjà partie.",
    });
    expect(await add("fr", 1, 0)).toEqual({ done: "1 personne ajoutée." });
  });

  it("say the new role by name, and removed", async () => {
    workspaces.changeMemberRole.mockResolvedValue(undefined);
    const change = (locale: "en" | "pt" | "fr", role: string) =>
      say(locale, () =>
        members.changeMemberRoleFromForm(
          {},
          form({ workspaceId: "w1", workspace: "acme", userId: "u", role }),
        ),
      );
    expect(await change("en", "admin")).toEqual({ done: "Now admin." });
    expect(await change("pt", "moderator")).toEqual({ done: "Agora moderador." });
    expect(await change("fr", "user")).toEqual({ done: "Maintenant utilisateur." });
    workspaces.removeMember.mockResolvedValue(undefined);
    expect(
      await say("pt", () =>
        members.removeMemberFromForm(
          {},
          form({ workspaceId: "w1", workspace: "acme", userId: "u" }),
        ),
      ),
    ).toEqual({ done: "Removido." });
    workspaces.removeMember.mockRejectedValueOnce(new OwnMembershipError());
    expect(
      (
        await say("fr", () =>
          members.removeMemberFromForm(
            {},
            form({ workspaceId: "w1", workspace: "acme", userId: "u" }),
          ),
        )
      ).error,
    ).toBe(
      "Vous ne pouvez pas modifier ni retirer votre propre adhésion : un autre admin ou root le fait.",
    );
  });

  it("the search's refusal reads in the language", async () => {
    workspaces.memberCandidates.mockRejectedValueOnce(new ForbiddenError("members.manage"));
    const result = await say("pt", () => members.findCandidates("w1", "ana"));
    expect(result).toEqual({ error: "Você não tem permissão para fazer isto (members.manage)." });
  });
});

describe("the answer actions", () => {
  it("rethrow what is not the domain's, for every answer", async () => {
    const boom = new Error("boom");
    workspaces.approveAccessRequest.mockRejectedValueOnce(boom);
    await expect(
      say("pt", () => answers.approveRequestFromForm({}, form({ requestId: "r" }))),
    ).rejects.toThrow("boom");
    workspaces.declineAccessRequest.mockRejectedValueOnce(boom);
    await expect(
      say("pt", () => answers.declineRequestFromForm({}, form({ requestId: "r" }))),
    ).rejects.toThrow("boom");
    workspaces.approveScopeMove.mockRejectedValueOnce(boom);
    await expect(
      say("pt", () => answers.approveMoveFromForm({}, form({ moveId: "m" }))),
    ).rejects.toThrow("boom");
    workspaces.declineScopeMove.mockRejectedValueOnce(boom);
    await expect(
      say("pt", () => answers.declineMoveFromForm({}, form({ moveId: "m" }))),
    ).rejects.toThrow("boom");
  });

  it("say approved with the role, declined and moved", async () => {
    workspaces.approveAccessRequest.mockResolvedValue(undefined);
    workspaces.declineAccessRequest.mockResolvedValue(undefined);
    workspaces.approveScopeMove.mockResolvedValue({ outcome: "moved" });
    workspaces.declineScopeMove.mockResolvedValue(undefined);
    expect(
      await say("pt", () =>
        answers.approveRequestFromForm(
          {},
          form({ requestId: "r", workspace: "acme", role: "moderator" }),
        ),
      ),
    ).toEqual({ done: "Aprovado: a pessoa está em acme como moderador." });
    expect(
      await say("fr", () =>
        answers.approveRequestFromForm({}, form({ requestId: "r", workspace: "acme" })),
      ),
    ).toEqual({ done: "Approuvé : la personne est dans acme comme utilisateur." });
    expect(
      await say("fr", () =>
        answers.declineRequestFromForm({}, form({ requestId: "r", workspace: "acme" })),
      ),
    ).toEqual({ done: "Refusé." });
    expect(
      await say("pt", () =>
        answers.approveMoveFromForm({}, form({ moveId: "m", workspace: "acme" })),
      ),
    ).toEqual({ done: "Movido para acme." });
    expect(
      await say("fr", () =>
        answers.declineMoveFromForm({}, form({ moveId: "m", workspace: "acme" })),
      ),
    ).toEqual({ done: "Refusé." });
  });

  it("show a refusal in the language, and a move's impact untouched", async () => {
    workspaces.approveAccessRequest.mockRejectedValueOnce(new AccessRequestAnsweredError());
    expect(
      (
        await say("pt", () =>
          answers.approveRequestFromForm({}, form({ requestId: "r", workspace: "acme" })),
        )
      ).error,
    ).toBe("Já respondida.");
    workspaces.approveScopeMove.mockRejectedValueOnce(new ScopeMoveAnsweredError());
    expect(
      (await say("fr", () => answers.approveMoveFromForm({}, form({ moveId: "m" })))).error,
    ).toBe("Déjà traitée.");
    const impact = { clash: true } as MoveImpact;
    workspaces.approveScopeMove.mockRejectedValueOnce(new ScopeMoveRefusedError(impact));
    expect(await say("pt", () => answers.approveMoveFromForm({}, form({ moveId: "m" })))).toEqual({
      refused: impact,
    });
  });
});

describe("Propose a change", () => {
  it("refuses a non-member in the language, keeping the workspace to join", async () => {
    proposals.proposeChange.mockRejectedValueOnce(new NotAMemberError("acme"));
    expect(await say("pt", () => proposeChangeAction("@a/x", "1.0.0"))).toEqual({
      ok: false,
      error:
        "Você não é membro do espaço de trabalho acme. Peça para entrar em acme para propor alterações.",
      joinWorkspace: "acme",
    });
    proposals.proposeChange.mockRejectedValueOnce(new NotAMemberError("acme"));
    expect(await say("en", () => proposeChangeAction("@a/x", "1.0.0"))).toEqual({
      ok: false,
      error: new NotAMemberError("acme").message,
      joinWorkspace: "acme",
    });
  });
});
