import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalMembershipError } from "@/server/domains/workspaces/exceptions/errors";

// A user's Workspaces (092): the row action, the list it edits, and the actions behind it.
const workspaces = vi.hoisted(() => ({
  userMemberships: vi.fn(),
  setUserWorkspaces: vi.fn(),
}));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("@/server/domains/identity/actions/user-admin", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { UserWorkspacesButton } = await import("./UserWorkspacesDialog");
const { WorkspaceRows } = await import("./WorkspaceRows");

const OPTIONS = [
  { id: "g", name: "global", isGlobal: true },
  { id: "a", name: "acme", isGlobal: false },
  { id: "b", name: "beta", isGlobal: false },
];

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("a user's Workspaces (092)", () => {
  it("opens from the user's workspace count, in their Role cell; root has none (092)", () => {
    const html = renderToStaticMarkup(
      <UserWorkspacesButton
        user={{ id: "u", email: "u@example.com" }}
        workspaces={OPTIONS}
        count={3}
      >
        <span>badges</span>
      </UserWorkspacesButton>,
    );
    expect(html).toContain('aria-label="Workspaces of u@example.com: 3"');
    expect(html).toContain("><span>badges</span></button>");
  });

  it("lists global first, always there, with a role for each and Add workspace", () => {
    const html = renderToStaticMarkup(
      <WorkspaceRows
        workspaces={OPTIONS}
        rows={[
          { workspaceId: "g", role: "user" },
          { workspaceId: "a", role: "admin" },
        ]}
        setRows={() => {}}
      />,
    );
    expect(html).toMatch(/<span[^>]*>global<\/span>/);
    expect(html).toContain('aria-label="Role in global"');
    expect(html).toContain('aria-label="Role in acme"');
    expect(html).toMatch(/<option value="admin" selected="">Admin<\/option>/);
    expect(html).toContain(">Always<");
    expect(html).toContain('aria-label="Remove acme"');
    expect(html).not.toContain('aria-label="Remove global"');
    expect(html).toContain("Add workspace");
    expect(html).toContain("Why is global always there?");
  });

  it("loads the user's memberships, and says why when it can't", async () => {
    workspaces.userMemberships.mockResolvedValue([
      { workspaceId: "g", workspace: "global", role: "user" },
      { workspaceId: "a", workspace: "acme", role: "moderator" },
    ]);
    expect(await actions.userWorkspacesFor("u")).toEqual({
      rows: [
        { workspaceId: "g", role: "user" },
        { workspaceId: "a", role: "moderator" },
      ],
    });
    workspaces.userMemberships.mockRejectedValue(new GlobalMembershipError());
    expect(await actions.userWorkspacesFor("u")).toEqual({
      error: "Nobody leaves global: everyone is in it.",
    });
  });

  it("saves the list as edited and says what changed", async () => {
    workspaces.setUserWorkspaces.mockResolvedValue({ added: 1, changed: 2, removed: 0 });
    const rows = [
      { workspaceId: "g", role: "moderator" },
      { workspaceId: "b", role: "user" },
      { junk: true },
    ];
    expect(
      await actions.saveUserWorkspacesFromForm(
        {},
        form({ userId: "u", workspaces: JSON.stringify(rows) }),
      ),
    ).toEqual({ done: "Saved: 1 workspace added, 2 roles changed." });
    expect(workspaces.setUserWorkspaces).toHaveBeenCalledWith(expect.any(Headers), {
      userId: "u",
      workspaces: [
        { workspaceId: "g", role: "moderator" },
        { workspaceId: "b", role: "user" },
      ],
    });
    workspaces.setUserWorkspaces.mockResolvedValue({ added: 0, changed: 0, removed: 0 });
    expect(
      await actions.saveUserWorkspacesFromForm({}, form({ userId: "u", workspaces: "nope" })),
    ).toEqual({ done: "Nothing changed." });
    workspaces.setUserWorkspaces.mockRejectedValue(new Error("database down"));
    await expect(
      actions.saveUserWorkspacesFromForm({}, form({ userId: "u", workspaces: "[]" })),
    ).rejects.toThrow("database down");
  });
});
