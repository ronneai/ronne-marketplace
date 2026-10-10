import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workspaces = vi.hoisted(() => ({ joinTarget: vi.fn() }));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("@/features/workspaces/actions", () => ({
  requestAccessFromForm: vi.fn(),
  cancelRequestFromForm: vi.fn(),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { default: JoinWorkspace } = await import("./page");

const render = async (name: string) =>
  renderToStaticMarkup(await JoinWorkspace({ params: Promise.resolve({ name }) }));

beforeEach(() => vi.clearAllMocks());

// The join link (094): the name from the address goes to the service as typed, decoded.
describe("the join page's route", () => {
  it("decodes the name, and leaves a malformed escape as typed", async () => {
    workspaces.joinTarget.mockResolvedValue({ kind: "unseen", name: "x", request: null });
    await render("acme%2Dteam");
    expect(workspaces.joinTarget).toHaveBeenLastCalledWith(expect.any(Headers), "acme-team");
    await render("bad%E0");
    expect(workspaces.joinTarget).toHaveBeenLastCalledWith(expect.any(Headers), "bad%E0");
  });

  it("shows what the service found: a private name and an unknown one alike", async () => {
    workspaces.joinTarget.mockResolvedValueOnce({ kind: "unseen", name: "vault", request: null });
    const vault = await render("vault");
    workspaces.joinTarget.mockResolvedValueOnce({ kind: "unseen", name: "nowhere", request: null });
    expect(vault.replaceAll("vault", "nowhere")).toBe(await render("nowhere"));
    expect(vault).toContain('name="message"');
  });
});
