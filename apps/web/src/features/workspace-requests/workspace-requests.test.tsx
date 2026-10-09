import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessRequestAnsweredError } from "@/server/domains/workspaces/exceptions/errors";
import type { RequestRow } from "./types";

// Answering requests to join (094): the actions behind Approve and Decline, and the table.
const workspaces = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  declineAccessRequest: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { RequestsTable } = await import("./RequestsTable");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const row = (extra: Partial<RequestRow> = {}): RequestRow => ({
  id: "r1",
  workspace: "acme",
  email: "uma@example.com",
  name: "Uma",
  message: "I review agents.",
  createdAt: new Date("2026-10-09T10:00:00Z"),
  canPickRole: false,
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("answer actions (094)", () => {
  it("approves as user, or with the role picked, and refreshes the layout for the nav count", async () => {
    workspaces.approveAccessRequest.mockResolvedValue(undefined);
    expect(
      await actions.approveRequestFromForm({}, form({ requestId: "r1", workspace: "acme" })),
    ).toEqual({ done: "Approved: they're in acme as user." });
    expect(workspaces.approveAccessRequest).toHaveBeenLastCalledWith(expect.any(Headers), {
      requestId: "r1",
      role: "user",
    });
    await actions.approveRequestFromForm(
      {},
      form({ requestId: "r1", workspace: "acme", role: "moderator" }),
    );
    expect(workspaces.approveAccessRequest).toHaveBeenLastCalledWith(expect.any(Headers), {
      requestId: "r1",
      role: "moderator",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/workspaces/acme");
  });

  it("declines with the reason, and shows Already answered when someone was first", async () => {
    workspaces.declineAccessRequest.mockResolvedValueOnce(undefined);
    expect(
      await actions.declineRequestFromForm(
        {},
        form({ requestId: "r1", workspace: "acme", reason: "Ask Ana." }),
      ),
    ).toEqual({ done: "Declined." });
    expect(workspaces.declineAccessRequest).toHaveBeenLastCalledWith(expect.any(Headers), {
      requestId: "r1",
      reason: "Ask Ana.",
    });
    workspaces.approveAccessRequest.mockRejectedValueOnce(new AccessRequestAnsweredError());
    expect(
      await actions.approveRequestFromForm({}, form({ requestId: "r1", workspace: "acme" })),
    ).toEqual({ error: "Already answered." });
    expect(cache.revalidatePath).toHaveBeenCalledTimes(2);
  });
});

describe("the Requests table (094)", () => {
  it("shows who, the message, Approve and Decline; the role select only when it may be picked", () => {
    const html = renderToStaticMarkup(<RequestsTable requests={[row()]} total={1} />);
    expect(html).toContain("Uma");
    expect(html).toContain("uma@example.com");
    expect(html).toContain("I review agents.");
    expect(html).toContain('aria-label="Approve uma@example.com"');
    expect(html).toContain('aria-label="Decline uma@example.com"');
    expect(html).not.toContain('aria-label="Role for uma@example.com"');
    expect(html).not.toContain(">Workspace<");
    const admin = renderToStaticMarkup(
      <RequestsTable requests={[row({ canPickRole: true })]} total={1} showWorkspace />,
    );
    expect(admin).toContain('aria-label="Role for uma@example.com"');
    expect(admin).toContain(">Workspace<");
    expect(admin).toContain('<option value="moderator">');
  });

  it("says when nothing waits, and when only the oldest are shown", () => {
    expect(renderToStaticMarkup(<RequestsTable requests={[]} total={0} />)).toContain(
      "No requests waiting.",
    );
    expect(renderToStaticMarkup(<RequestsTable requests={[row()]} total={130} />)).toContain(
      "The 1 oldest of 130.",
    );
  });
});
