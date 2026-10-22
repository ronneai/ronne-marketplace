import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  confirmInstall: vi.fn(),
  hideGettingStarted: vi.fn(),
  showGettingStarted: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("@/server/domains/onboarding/actions/getting-started", () => actions);
vi.mock("next/cache", () => cache);
vi.mock("next/navigation", () => navigation);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { confirmInstallFromForm, hideGettingStartedFromForm, showGettingStartedFromForm } =
  await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("the Getting started form actions (126)", () => {
  it.each([
    ["hide", hideGettingStartedFromForm, actions.hideGettingStarted],
    ["confirm an install", confirmInstallFromForm, actions.confirmInstall],
    ["show again", showGettingStartedFromForm, actions.showGettingStarted],
  ] as const)(
    "%s: does it for the request's own person and refreshes the pages",
    async (_name, run, action) => {
      await run();
      // Only the request's headers: there is no person's id to pass, so no way to name another's.
      expect(action).toHaveBeenCalledTimes(1);
      expect(action.mock.calls[0]).toHaveLength(1);
      expect(action.mock.calls[0]?.[0]).toBeInstanceOf(Headers);
      expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
    },
  );

  it("lets a refusal through and refreshes nothing", async () => {
    actions.hideGettingStarted.mockRejectedValueOnce(new Error("signed out"));
    await expect(hideGettingStartedFromForm()).rejects.toThrow("signed out");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("show again ends on Home, where the checklist is back; the other two stay where they are", async () => {
    await showGettingStartedFromForm();
    expect(navigation.redirect).toHaveBeenCalledWith("/");
    await hideGettingStartedFromForm();
    await confirmInstallFromForm();
    expect(navigation.redirect).toHaveBeenCalledTimes(1);
  });
});
