import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { OwnMembershipError } from "@/server/domains/workspaces/exceptions/errors";

// A workspace's members (092): the actions behind the Members table and Add members.
const workspaces = vi.hoisted(() => ({
  addMembers: vi.fn(),
  changeMemberRole: vi.fn(),
  memberCandidates: vi.fn(),
  removeMember: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { AddMembersDialog, MemberRoleSelect } = await import("./MemberControls");

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields))
    for (const one of [value].flat()) data.append(key, one);
  return data;
};
const ACME = { workspaceId: "w1", workspace: "acme" };

beforeEach(() => vi.clearAllMocks());

describe("member actions (092)", () => {
  it("adds the people picked with one role, says how many, and refreshes the pages", async () => {
    workspaces.addMembers.mockResolvedValueOnce([
      { userId: "a", result: "added" },
      { userId: "b", result: "added" },
      { userId: "c", result: "already_member" },
    ]);
    expect(
      await actions.addMembersFromForm(
        {},
        form({ ...ACME, userId: ["a", "b", "c"], role: "moderator" }),
      ),
    ).toEqual({ done: "Added 2 people; 1 person already in it." });
    expect(workspaces.addMembers).toHaveBeenCalledWith(expect.any(Headers), {
      workspaceId: "w1",
      userIds: ["a", "b", "c"],
      role: "moderator",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/workspaces/acme");
    workspaces.addMembers.mockResolvedValueOnce([{ userId: "a", result: "added" }]);
    expect(
      await actions.addMembersFromForm({}, form({ ...ACME, userId: "a", role: "user" })),
    ).toEqual({ done: "Added 1 person." });
  });

  it("changes a role and removes someone, and shows a refusal without refreshing", async () => {
    workspaces.changeMemberRole.mockResolvedValueOnce(undefined);
    expect(
      await actions.changeMemberRoleFromForm({}, form({ ...ACME, userId: "m", role: "admin" })),
    ).toEqual({ done: "Now admin." });
    expect(workspaces.changeMemberRole).toHaveBeenCalledWith(expect.any(Headers), {
      workspaceId: "w1",
      userId: "m",
      role: "admin",
    });
    workspaces.removeMember.mockResolvedValueOnce(undefined);
    expect(await actions.removeMemberFromForm({}, form({ ...ACME, userId: "m" }))).toEqual({
      done: "Removed.",
    });
    cache.revalidatePath.mockClear();
    workspaces.removeMember.mockRejectedValueOnce(new OwnMembershipError());
    expect(await actions.removeMemberFromForm({}, form({ ...ACME, userId: "a" }))).toEqual({
      error: new OwnMembershipError().message,
    });
    workspaces.changeMemberRole.mockRejectedValueOnce(new ForbiddenError("members.manage"));
    expect(
      (await actions.changeMemberRoleFromForm({}, form({ ...ACME, userId: "m", role: "user" })))
        .error,
    ).toBeTruthy();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    workspaces.removeMember.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.removeMemberFromForm({}, form({ ...ACME, userId: "m" }))).rejects.toThrow(
      "database down",
    );
  });

  it("searches people to add, and says why when it can't", async () => {
    workspaces.memberCandidates.mockResolvedValueOnce([
      { id: "u", email: "u@example.com", name: "Uma" },
    ]);
    expect(await actions.findCandidates("w1", "um")).toEqual({
      users: [{ id: "u", email: "u@example.com", name: "Uma" }],
    });
    expect(workspaces.memberCandidates).toHaveBeenCalledWith(expect.any(Headers), {
      workspaceId: "w1",
      query: "um",
    });
    workspaces.memberCandidates.mockRejectedValueOnce(new ForbiddenError("members.manage"));
    expect("error" in (await actions.findCandidates("w2", "um"))).toBe(true);
  });
});

describe("member controls (092)", () => {
  it("a member's role is a select, on their current role", () => {
    const html = renderToStaticMarkup(
      <MemberRoleSelect
        workspace={{ id: "w1", name: "acme" }}
        member={{ userId: "m", email: "m@example.com", role: "moderator" }}
      />,
    );
    expect(html).toContain('aria-label="Role of m@example.com"');
    expect(html).toMatch(/<option value="moderator" selected="">Moderator<\/option>/);
    expect(html).toContain('<option value="admin">Admin</option>');
  });

  it("Add members opens from its button", () => {
    expect(
      renderToStaticMarkup(<AddMembersDialog workspace={{ id: "w1", name: "acme" }} />),
    ).toContain(">Add members<");
  });
});
