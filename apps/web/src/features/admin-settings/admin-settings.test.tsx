import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import {
  InvalidUsageMinimumError,
  InvalidUsagePolicyError,
} from "@/server/domains/settings/exceptions/errors";

const settings = vi.hoisted(() => ({
  instanceSettings: vi.fn(),
  setUsagePolicy: vi.fn(),
  setUsageMinimum: vi.fn(),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/settings/actions/settings", () => settings);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const actions = await import("./actions");
const { UsagePolicyForm } = await import("./UsagePolicyForm");
const { default: AdminSettings } = await import("@/app/(app)/admin/settings/page");

const form = (policy: string) => {
  const data = new FormData();
  data.set("usagePolicy", policy);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  settings.instanceSettings.mockResolvedValue({
    usagePolicy: "off",
    usagePolicyChangedAt: null,
    usageMinimum: 0,
  });
});

describe("saveUsagePolicy", () => {
  it("saves the chosen policy and revalidates the page", async () => {
    settings.setUsagePolicy.mockResolvedValueOnce({ changed: true });
    expect(await actions.saveUsagePolicy({}, form("choice"))).toEqual({
      done: "Usage reporting saved.",
    });
    expect(settings.setUsagePolicy).toHaveBeenCalledWith(expect.any(Headers), "choice");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/settings");
    settings.setUsagePolicy.mockResolvedValueOnce({ changed: false });
    expect(await actions.saveUsagePolicy({}, form("choice"))).toEqual({ done: "Nothing changed." });
  });

  it("shows domain and permission errors, and rethrows anything else", async () => {
    settings.setUsagePolicy.mockRejectedValueOnce(new InvalidUsagePolicyError());
    expect((await actions.saveUsagePolicy({}, form("maybe"))).error).toBe(
      "Choose off, people choose, or required.",
    );
    settings.setUsagePolicy.mockRejectedValueOnce(new ForbiddenError("settings.manage"));
    expect((await actions.saveUsagePolicy({}, form("off"))).error).toContain("permission");
    settings.setUsagePolicy.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.saveUsagePolicy({}, form("off"))).rejects.toThrow("database down");
  });
});

describe("Admin › Settings", () => {
  it("is a 404 for anyone but root, without reading the settings", async () => {
    for (const user of [null, { role: "user" }, { role: "moderator" }]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(AdminSettings()).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(settings.instanceSettings).not.toHaveBeenCalled();
  });

  it("shows root the three policies with the current one chosen", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    settings.instanceSettings.mockResolvedValueOnce({
      usagePolicy: "required",
      usagePolicyChangedAt: new Date(),
      usageMinimum: 20,
    });
    const html = renderToStaticMarkup(await AdminSettings());
    for (const text of ["Settings", "Usage reporting", "Off", "People choose", "Required"])
      expect(html).toContain(text);
    expect(html).toMatch(/checked="" value="required"/);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    // The usage minimum, with its current value.
    expect(html).toContain("Show an item&#x27;s usage from");
    expect(html).toMatch(/name="usageMinimum"[^>]*value="20"/);
  });

  it("disables Save until the choice changes", () => {
    expect(renderToStaticMarkup(<UsagePolicyForm policy="off" />)).toMatch(
      /<button[^>]*disabled=""[^>]*>Save/,
    );
  });
});

describe("saveUsageMinimum", () => {
  it("saves the minimum, and shows a domain error", async () => {
    const data = new FormData();
    data.set("usageMinimum", "20");
    settings.setUsageMinimum.mockResolvedValueOnce({ changed: true });
    expect(await actions.saveUsageMinimum({}, data)).toEqual({ done: "Usage minimum saved." });
    expect(settings.setUsageMinimum).toHaveBeenCalledWith(expect.any(Headers), "20");
    settings.setUsageMinimum.mockRejectedValueOnce(new InvalidUsageMinimumError());
    expect((await actions.saveUsageMinimum({}, data)).error).toContain("whole number");
  });
});
