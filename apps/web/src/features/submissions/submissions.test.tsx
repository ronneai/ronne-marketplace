import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { DraftScopeNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import type { Submission } from "@/server/domains/submissions/models/submission";

const drafts = vi.hoisted(() => ({ createDraft: vi.fn(), listMySubmissions: vi.fn() }));
const scopes = vi.hoisted(() => ({ listScopes: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/drafts", () => drafts);
vi.mock("@/server/domains/items/actions/scopes", () => scopes);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const actions = await import("./actions");
const { SubmissionsTable } = await import("./SubmissionsTable");
const { NewDraftForm } = await import("./NewDraftForm");
const { default: SubmissionsPage } = await import("@/app/(app)/submissions/page");
const { default: NewItemPage } = await import("@/app/(app)/submissions/new/page");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const submission = (overrides: Partial<Submission> = {}): Submission => ({
  id: "01J0000000000000000000000A",
  authorId: "u1",
  scope: { id: "s1", name: "platform" },
  name: "code-reviewer",
  type: "agent",
  status: "draft",
  createdAt: new Date("2026-09-27T10:00:00Z"),
  updatedAt: new Date("2026-09-27T14:05:00Z"),
  submittedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  drafts.listMySubmissions.mockResolvedValue([submission()]);
  scopes.listScopes.mockResolvedValue({
    scopes: [{ name: "platform", description: "Shared tools." }],
    nextCursor: null,
  });
});

describe("createDraftFromForm", () => {
  it("creates the draft and opens it in the editor", async () => {
    drafts.createDraft.mockResolvedValue({ id: "01J0000000000000000000000B" });
    await expect(
      actions.createDraftFromForm({}, form({ scope: "platform", name: "critic", type: "agent" })),
    ).rejects.toThrow("NEXT_REDIRECT /submissions/01J0000000000000000000000B");
    expect(drafts.createDraft).toHaveBeenCalledWith(expect.any(Headers), {
      scope: "platform",
      name: "critic",
      type: "agent",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/submissions");
  });

  it("turns domain and permission errors into the form's message", async () => {
    drafts.createDraft.mockRejectedValueOnce(new DraftScopeNotFoundError("gone"));
    expect(await actions.createDraftFromForm({}, form({ scope: "gone" }))).toEqual({
      error: "The scope @gone doesn't exist. Root creates scopes.",
    });
    drafts.createDraft.mockRejectedValueOnce(new ForbiddenError("submissions.create"));
    expect((await actions.createDraftFromForm({}, form({}))).error).toBeTruthy();
    drafts.createDraft.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.createDraftFromForm({}, form({}))).rejects.toThrow("database down");
  });
});

describe("SubmissionsTable", () => {
  it("links each draft to its editor, with its type, status and last change", () => {
    const html = renderToStaticMarkup(<SubmissionsTable submissions={[submission()]} />);
    expect(html).toContain('href="/submissions/01J0000000000000000000000A"');
    expect(html).toContain("@platform/code-reviewer");
    expect(html).toContain(">agent<");
    expect(html).toContain(">draft<");
    expect(html).toContain("2026-09-27 14:05 UTC");
  });

  it("explains drafts when there are none, and offers a new item", () => {
    const html = renderToStaticMarkup(<SubmissionsTable submissions={[]} />);
    expect(html).toContain("You have no drafts yet.");
    expect(html).toContain('href="/submissions/new"');
  });
});

describe("NewDraftForm", () => {
  it("offers every scope and every type, with the risk note on high-risk types", () => {
    const html = renderToStaticMarkup(
      <NewDraftForm
        scopes={[
          { name: "platform", description: "Shared tools." },
          { name: "team", description: "A team." },
        ]}
        mine={[]}
      />,
    );
    expect(html).toContain("@platform");
    expect(html).toContain("@team");
    expect(html.match(/name="type"/g)).toHaveLength(11);
    // hook, mcp-server, permission-policy, statusline and lsp-server.
    expect(html.match(/>risk</g)).toHaveLength(5);
    // No type picked yet: the side panel asks for one.
    expect(html).toContain("Pick a type to see the ronne.yaml");
    expect(html).toContain('href="/scopes"');
  });

  it("says root has to create a scope first when there are none", () => {
    const html = renderToStaticMarkup(<NewDraftForm scopes={[]} mine={[]} />);
    expect(html).toContain("There are no scopes yet.");
    expect(html).not.toContain("<form");
  });
});

describe("pages", () => {
  it("lists my submissions, with New item", async () => {
    const html = renderToStaticMarkup(await SubmissionsPage());
    expect(html).toContain("My submissions");
    expect(html).toContain("@platform/code-reviewer");
    expect(html).toContain('href="/submissions/new"');
  });

  it("collects every page of scopes for the picker", async () => {
    scopes.listScopes
      .mockResolvedValueOnce({ scopes: [{ name: "a", description: "A." }], nextCursor: "a" })
      .mockResolvedValueOnce({ scopes: [{ name: "b", description: "B." }], nextCursor: null });
    const html = renderToStaticMarkup(await NewItemPage());
    expect(scopes.listScopes).toHaveBeenNthCalledWith(2, expect.any(Headers), { cursor: "a" });
    expect(html).toContain("@a");
    expect(html).toContain("@b");
  });
});
