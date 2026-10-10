import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { TooManyAccessRequestsError } from "@/server/domains/workspaces/exceptions/errors";
import type { OwnRequest } from "@/server/domains/workspaces/models/access-request";
import type { MyWorkspace } from "@/server/domains/workspaces/services/access-requests";

// The Workspaces page and the join page (094), and the actions behind Ask to join and Cancel.
const workspaces = vi.hoisted(() => ({ requestAccess: vi.fn(), cancelAccessRequest: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { WorkspacesPage } = await import("./WorkspacesPage");
const { JoinPage } = await import("./JoinPage");

const NOW = new Date("2026-10-09T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const workspace = (name: string, extra: Partial<MyWorkspace> = {}): MyWorkspace => ({
  name,
  description: `The ${name} team.`,
  visibility: "public",
  isGlobal: false,
  role: null,
  ...extra,
});

const request = (workspace: string, extra: Partial<OwnRequest> = {}): OwnRequest => ({
  id: `r-${workspace}`,
  workspace,
  message: null,
  status: "open",
  reason: null,
  createdAt: new Date(NOW.getTime() - DAY),
  decidedAt: null,
  description: null,
  visibility: null,
  askAgainFrom: null,
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("request actions (094)", () => {
  it("says Request sent whether the request is new or open already, and refreshes the pages", async () => {
    for (const result of ["sent", "already_requested"]) {
      workspaces.requestAccess.mockResolvedValueOnce(result);
      expect(
        await actions.requestAccessFromForm({}, form({ workspace: "acme", message: "Hi." })),
      ).toEqual({ done: "Request sent." });
    }
    expect(workspaces.requestAccess).toHaveBeenCalledWith(expect.any(Headers), {
      workspace: "acme",
      message: "Hi.",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/workspaces");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/workspaces/acme/join");
    workspaces.requestAccess.mockResolvedValueOnce("already_member");
    expect(await actions.requestAccessFromForm({}, form({ workspace: "acme" }))).toEqual({
      done: "You're in it already.",
    });
  });

  it("shows a refusal as the form's error, and cancels a request", async () => {
    workspaces.requestAccess.mockRejectedValueOnce(new TooManyAccessRequestsError(10));
    expect((await actions.requestAccessFromForm({}, form({ workspace: "acme" }))).error).toMatch(
      /10 open requests/,
    );
    workspaces.cancelAccessRequest.mockRejectedValueOnce(new ForbiddenError("account.manage_own"));
    expect(
      (await actions.cancelRequestFromForm({}, form({ requestId: "r1", workspace: "acme" }))).error,
    ).toBeTruthy();
    workspaces.cancelAccessRequest.mockResolvedValueOnce(undefined);
    expect(
      await actions.cancelRequestFromForm({}, form({ requestId: "r1", workspace: "acme" })),
    ).toEqual({ done: "Request cancelled." });
    expect(workspaces.cancelAccessRequest).toHaveBeenLastCalledWith(expect.any(Headers), "r1");
  });
});

describe("the Workspaces page (094)", () => {
  const render = (props: Partial<Parameters<typeof WorkspacesPage>[0]> = {}) =>
    renderToStaticMarkup(<WorkspacesPage workspaces={[]} requests={[]} root={false} {...props} />);

  it("shows each workspace with its visibility and your role; global reads Everyone", () => {
    const html = render({
      workspaces: [
        workspace("global", { isGlobal: true, role: "user" }),
        workspace("acme", { role: "moderator" }),
        workspace("vault", { visibility: "private", role: "admin" }),
      ],
    });
    expect(html).toContain("Everyone");
    expect(html).toContain("Private");
    expect(html).toContain("Moderator");
    expect(html).toContain("Admin");
    expect(html).toContain("The acme team.");
    expect(html).not.toContain("Ask to join");
  });

  it("offers Ask to join, Requested with Cancel, and Declined with the date, the reason and the wait", () => {
    const html = render({
      workspaces: [workspace("acme"), workspace("beta"), workspace("gamma"), workspace("delta")],
      requests: [
        request("beta"),
        request("gamma", {
          status: "declined",
          reason: "Ask Ana first.",
          decidedAt: new Date(NOW.getTime() - 2 * DAY),
          askAgainFrom: new Date(NOW.getTime() + 5 * DAY),
        }),
        request("delta", { status: "declined", decidedAt: new Date(NOW.getTime() - 8 * DAY) }),
      ],
    });
    expect(html).toContain('aria-label="Ask to join acme"');
    expect(html).toContain("Requested");
    expect(html).toContain('aria-label="Cancel your request to join beta"');
    expect(html).not.toContain('aria-label="Ask to join beta"');
    // Declined 2 days ago: the reason, and when to ask again; no Ask to join yet.
    expect(html).toContain("Declined on");
    expect(html).toContain("Ask Ana first.");
    expect(html).toContain("ask again from");
    expect(html).not.toContain('aria-label="Ask to join gamma"');
    // Declined 8 days ago: Ask to join again.
    expect(html).toContain('aria-label="Ask to join delta"');
  });

  it("lists requests to names not on the list, private and unknown alike, by name only", () => {
    const html = render({
      workspaces: [workspace("acme")],
      requests: [
        request("secret", { id: "r1" }),
        request("nowhere"),
        request("acme", { status: "cancelled" }),
      ],
    });
    expect(html).toContain("Your other requests");
    expect(html).toContain("secret");
    expect(html).toContain("nowhere");
    expect(html).toContain('aria-label="Cancel your request to join secret"');
    expect(html.replaceAll("secret", "NAME")).toBe(
      render({
        workspaces: [workspace("acme")],
        requests: [
          request("NAME", { id: "r1" }),
          request("nowhere"),
          request("acme", { status: "cancelled" }),
        ],
      }),
    );
  });

  it("shows root as Root everywhere, with nothing to ask", () => {
    const html = render({ root: true, workspaces: [workspace("acme"), workspace("vault")] });
    expect(html).toContain("Root");
    expect(html).not.toContain("Ask to join");
  });
});

describe("the join page (094)", () => {
  const render = (target: Parameters<typeof JoinPage>[0]["target"]) =>
    renderToStaticMarkup(<JoinPage target={target} />);

  it("shows a public workspace's description and the request form", () => {
    const html = render({
      kind: "open",
      name: "acme",
      description: "The acme team.",
      request: null,
    });
    expect(html).toContain("acme");
    expect(html).toContain("The acme team.");
    expect(html).toContain('name="message"');
    expect(html).toContain("Ask to join");
  });

  it("renders a private workspace and a name no workspace has the same, before and after asking", () => {
    const same = (a: string, b: string) => expect(a.replaceAll("vault", "nowhere")).toBe(b);
    same(
      render({ kind: "unseen", name: "vault", request: null }),
      render({ kind: "unseen", name: "nowhere", request: null }),
    );
    same(
      render({ kind: "unseen", name: "vault", request: request("vault", { id: "r" }) }),
      render({ kind: "unseen", name: "nowhere", request: request("nowhere", { id: "r" }) }),
    );
    const asked = render({ kind: "unseen", name: "vault", request: request("vault") });
    expect(asked).toContain("Requested");
    expect(asked).not.toContain('name="message"');
  });

  it("shows a decline with its reason, and the form again only once it can be sent", () => {
    const declined = (askAgainFrom: Date | null) =>
      render({
        kind: "open",
        name: "acme",
        description: "The acme team.",
        request: request("acme", {
          status: "declined",
          reason: "Ask Ana first.",
          decidedAt: new Date(NOW.getTime() - 2 * DAY),
          askAgainFrom,
        }),
      });
    const waiting = declined(new Date(NOW.getTime() + 5 * DAY));
    expect(waiting).toContain("Declined on");
    expect(waiting).toContain("Ask Ana first.");
    expect(waiting).toContain("ask again from");
    expect(waiting).not.toContain('name="message"');
    // Added and removed since, or 7 days on: the server says they can ask now.
    const now = declined(null);
    expect(now).toContain("Declined on");
    expect(now).not.toContain("ask again from");
    expect(now).toContain('name="message"');
  });

  it("tells a member they're in, with no form", () => {
    const html = render({ kind: "member", name: "acme" });
    expect(html).toContain("in this workspace already");
    expect(html).not.toContain('name="message"');
  });
});
