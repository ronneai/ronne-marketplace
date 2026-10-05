import type { PluginTool } from "@ronneai/core/plugins";
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
const feeds = vi.hoisted(() => ({ pluginFeedStats: vi.fn() }));
vi.mock("@/server/domains/feeds/actions/feeds", () => feeds);
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
const { PluginFeedsPanel } = await import("./PluginFeedsPanel");
const { default: AdminSettings } = await import("@/app/(app)/admin/settings/page");

const form = (policy: string) => {
  const data = new FormData();
  data.set("usagePolicy", policy);
  return data;
};

const notBuilt = (["claude-code", "codex", "cursor"] as const).map((tool) => ({
  tool,
  stats: null,
  warnings: [],
}));

beforeEach(() => {
  vi.clearAllMocks();
  feeds.pluginFeedStats.mockResolvedValue(notBuilt);
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

describe("Admin › Settings › Plugin feeds (079)", () => {
  const MIB = 1024 * 1024;
  const built = (tool: PluginTool, sizeBytes: number, buildMs: number) => ({
    tool,
    sizeBytes,
    plugins: 8_600,
    buildMs,
    revision: 12,
    builtAt: new Date("2026-10-03T12:00:00Z"),
  });

  it("is on the page for root, with every tool not built yet", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
    const html = renderToStaticMarkup(await AdminSettings());
    expect(html).toContain(">Plugin feeds</h2>");
    expect(html).toContain("What do these numbers mean?");
    expect(html).toContain('href="https://www.ronne.ai/marketplace/docs/plugins#large"');
    expect(html.match(/Not built yet/g)).toHaveLength(3);
    expect(html).not.toContain('role="status"');
  });

  it("shows each tool's last build, and no warning under the thresholds", () => {
    const html = renderToStaticMarkup(
      <PluginFeedsPanel
        rows={[
          { tool: "claude-code", stats: built("claude-code", 2 * MIB, 400), warnings: [] },
          { tool: "codex", stats: built("codex", 300 * 1024, 300), warnings: [] },
          { tool: "cursor", stats: null, warnings: [] },
        ]}
      />,
    );
    expect(html).toContain("2.0 MiB<span");
    expect(html).toContain("> of 5 MiB<");
    expect(html).toContain(">300 KiB<");
    expect(html).toContain(">8,600<");
    expect(html).toContain(">0.4 s<");
    expect(html).toContain("<time");
    expect(html).not.toContain("near");
  });

  it("warns when Claude Code's marketplace nears its size limit, naming the git mirror", () => {
    const html = renderToStaticMarkup(
      <PluginFeedsPanel
        rows={[
          {
            tool: "claude-code",
            stats: built("claude-code", 4.2 * MIB, 6_000),
            warnings: ["size", "time"],
          },
          { tool: "codex", stats: null, warnings: [] },
          { tool: "cursor", stats: null, warnings: [] },
        ]}
      />,
    );
    expect(html).toContain("Claude Code&#x27;s marketplace is near its limits.");
    expect(html).toContain("add the git mirror (rmk feed build) in Claude Code");
    expect(html).toContain("Claude Code waits 10 seconds");
    expect(html.match(/text-warning-text/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
