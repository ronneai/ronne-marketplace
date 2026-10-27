import type { PluginTool } from "@ronneai/core/plugins";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import {
  InvalidUsageMinimumError,
  InvalidUsagePolicyError,
  SettingsError,
} from "@/server/domains/settings/exceptions/errors";
import { inLocaleAsync } from "@/test/intl";
import admin from "../../../messages/en/admin.json";

const settings = vi.hoisted(() => ({
  instanceSettings: vi.fn(),
  setUsagePolicy: vi.fn(),
  setUsageMinimum: vi.fn(),
  setTwoFactorPolicy: vi.fn(),
  setRetention: vi.fn(),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const jobs = vi.hoisted(() => ({ retentionJobStatus: vi.fn() }));
vi.mock("@/server/jobs/actions", () => jobs);
const erasures = vi.hoisted(() => ({
  adminPendingErasures: vi.fn(async (): Promise<{ userId: string; startedAt: Date }[]> => []),
  adminRetryErasures: vi.fn(),
}));
vi.mock("@/server/domains/identity/actions/erase-user", () => erasures);
const feeds = vi.hoisted(() => ({ pluginFeedStats: vi.fn() }));
vi.mock("@/server/domains/feeds/actions/feeds", () => feeds);
const twoFactor = vi.hoisted(() => ({
  twoFactorCoverage: vi.fn(async () => ({
    reviewers: { covered: 3, unenrolled: 1 },
    everyone: { covered: 12, unenrolled: 12 },
  })),
}));
vi.mock("@/server/domains/identity/actions/two-factor", () => twoFactor);
vi.mock("@/server/domains/identity/actions/identity-providers", () => ({
  providerRows: async () => [],
}));
vi.mock("@/server/domains/identity/actions/password-policy", () => ({
  hasUsableProvider: async () => false,
  passwordUsersAffected: async () => 0,
}));
vi.mock("@/server/domains/identity/repositories/auth-instance", () => ({ getAppAuth: () => ({}) }));
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
const { UsagePolicyForm } = await import("./usage/UsagePolicyForm");
const { PluginFeedsPanel } = await import("./feeds/PluginFeedsPanel");
const { SignInMethodsPanel } = await import("./authentication/SignInMethodsPanel");
const { signInMethods } = await import("./authentication/AuthenticationTab");

// The sign-in methods in English, from the message files.
const methodsT = createTranslator({
  locale: "en",
  messages: { admin },
  namespace: "admin.settings.methods",
} as never) as unknown as Parameters<typeof signInMethods>[1];
const passwordMethods = signInMethods(
  { twoFactorPolicy: "optional", passwordPolicy: "everyone", providers: [] },
  methodsT,
);
const { RetentionForm } = await import("./privacy/RetentionForm");
const { LastRun } = await import("./privacy/LastRun");
const { PendingErasures } = await import("./privacy/PendingErasures");
const { InvalidRetentionError } = await import("@/server/domains/settings/exceptions/errors");
const { default: AdminSettingsPage } = await import("@/app/(app)/admin/settings/page");

/** The page as Next.js renders it, for `?tab=` (none: the bare address). */
const AdminSettings = (tab?: string) =>
  AdminSettingsPage({ searchParams: Promise.resolve(tab === undefined ? {} : { tab }) });

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
    twoFactorPolicy: "optional",
    passwordSignInPolicy: "everyone",
    retention: { ipDays: 90, sessionsDays: 90, feedbackDays: 365 },
  });
  jobs.retentionJobStatus.mockResolvedValue({
    lastRunAt: null,
    lastResult: null,
    running: false,
    schedulerOff: false,
  });
  erasures.adminPendingErasures.mockResolvedValue([]);
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

describe("Admin › Settings' tabs (122)", () => {
  const root = () => session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
  const current = (html: string) => html.match(/aria-current="page"[^>]*>([^<]+)</)?.[1];

  it("shows Usage by default and for an unknown tab, without the feeds' query", async () => {
    root();
    for (const tab of [undefined, "nope", "", "FEEDS"]) {
      const html = renderToStaticMarkup(await AdminSettings(tab));
      expect(current(html), String(tab)).toBe("Usage");
      expect(html).toContain("Usage reporting");
      expect(html).not.toContain(">Plugin feeds</h2>");
    }
    expect(feeds.pluginFeedStats).not.toHaveBeenCalled();
  });

  it("links each tab to its own address, in a labelled nav", async () => {
    root();
    const html = renderToStaticMarkup(await AdminSettings());
    expect(html).toContain('aria-label="Settings"');
    for (const href of [
      'href="/admin/settings"',
      'href="/admin/settings?tab=feeds"',
      'href="/admin/settings?tab=authentication"',
      'href="/admin/settings?tab=privacy"',
      'href="/admin/settings?tab=notice"',
    ])
      expect(html).toContain(href);
  });

  it("shows only the plugin feeds on Plugin feeds, without reading the usage settings", async () => {
    root();
    const html = renderToStaticMarkup(await AdminSettings("feeds"));
    expect(current(html)).toBe("Plugin feeds");
    expect(html).toContain(">Plugin feeds</h2>");
    expect(html).not.toContain("Usage reporting");
    expect(feeds.pluginFeedStats).toHaveBeenCalledTimes(1);
    expect(settings.instanceSettings).not.toHaveBeenCalled();
  });

  it("shows the Authentication tab, with Sign-in methods and without the other panels", async () => {
    root();
    const html = renderToStaticMarkup(await AdminSettings("authentication"));
    expect(current(html)).toBe("Authentication");
    expect(html).toContain(">Sign-in methods</h2>");
    expect(html).not.toContain("Usage reporting");
    expect(html).not.toContain(">Plugin feeds</h2>");
    expect(feeds.pluginFeedStats).not.toHaveBeenCalled();
  });

  it("is a 404 on every tab for anyone but root", async () => {
    for (const tab of [undefined, "usage", "feeds", "authentication", "privacy", "notice"]) {
      session.getCurrentUser.mockResolvedValueOnce({ role: "user" });
      await expect(AdminSettings(tab)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(settings.instanceSettings).not.toHaveBeenCalled();
    expect(feeds.pluginFeedStats).not.toHaveBeenCalled();
  });

  it("keeps the tab when a panel saves: the actions revalidate the page, never redirect", async () => {
    settings.setUsagePolicy.mockResolvedValueOnce({ changed: true });
    settings.setUsageMinimum.mockResolvedValueOnce({ changed: true });
    const minimum = new FormData();
    minimum.set("usageMinimum", "5");
    expect(await actions.saveUsagePolicy({}, form("choice"))).toEqual({
      done: "Usage reporting saved.",
    });
    expect(await actions.saveUsageMinimum({}, minimum)).toEqual({ done: "Usage minimum saved." });
    expect(cache.revalidatePath.mock.calls).toEqual([["/admin/settings"], ["/admin/settings"]]);
  });
});

describe("Admin › Settings › Authentication › Sign-in methods (122)", () => {
  it("lists email and password as on, with root's note and the helper", () => {
    const html = renderToStaticMarkup(<SignInMethodsPanel methods={passwordMethods} />);
    expect(html).toContain('aria-labelledby="sign-in-methods-title"');
    expect(html).toContain(">Sign-in methods</h2>");
    expect(html).toMatch(/Email and password<\/td><td[^>]*><span[^>]*>On<\/span>/);
    expect(html).toContain("Root can always sign in with a password");
    expect(html).toContain("How do people sign in?");
    expect(html).toContain(
      'href="https://www.ronne.ai/en/marketplace/docs/authentication#overview"',
    );
  });

  it("shows a method that is off as Off", () => {
    const html = renderToStaticMarkup(
      <SignInMethodsPanel methods={[{ name: "Passkeys", on: false, note: "Not set up." }]} />,
    );
    expect(html).toMatch(/Passkeys<\/td><td[^>]*><span[^>]*>Off<\/span>/);
    expect(html).not.toContain("Email and password");
  });

  it("has nothing to change: no form or input, and only the helper's button", () => {
    const html = renderToStaticMarkup(<SignInMethodsPanel methods={passwordMethods} />);
    expect(html).not.toMatch(/<(form|input|select|textarea)\b/);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"/);
  });
});

describe("Admin › Settings", () => {
  it("is a 404 for anyone but root, without reading the settings", async () => {
    for (const user of [
      null,
      { role: "user" },
      { role: "user", workspaces: { global: "moderator" } },
    ]) {
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
    expect(html).toContain("Show an item’s usage from");
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

  it("is on the Plugin feeds tab for root, with every tool not built yet", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
    const html = renderToStaticMarkup(await AdminSettings("feeds"));
    expect(html).toContain(">Plugin feeds</h2>");
    expect(html).toContain("What do these numbers mean?");
    expect(html).toContain('href="https://www.ronne.ai/en/marketplace/docs/plugins#large"');
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
    expect(html).toContain("Claude Code’s marketplace is near its limits.");
    expect(html).toContain("add the git mirror (rmk feed build) in Claude Code");
    expect(html).toContain("Claude Code waits 10 seconds");
    expect(html.match(/text-warning-text/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Admin › Settings › Authentication › Two-factor sign-in (105)", () => {
  it("offers the three requirements, with who each covers and who must still set it up", async () => {
    const { TwoFactorPolicyForm } = await import("./authentication/TwoFactorPolicyForm");
    const html = renderToStaticMarkup(
      <TwoFactorPolicyForm
        policy="optional"
        coverage={{
          reviewers: { covered: 3, unenrolled: 1 },
          everyone: { covered: 12, unenrolled: 0 },
        }}
      />,
    );
    for (const text of ["Optional", "Reviewers and root", "Everyone", "Who must enrol?"])
      expect(html).toContain(text);
    expect(html).toContain("3 people; 1 person must set it up at their next visit.");
    expect(html).toContain("12 people, all with two-factor on.");
    expect(html).toMatch(/checked="" value="optional"/);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it("is on the Authentication tab with the requirement listed under Sign-in methods", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
    settings.instanceSettings.mockResolvedValueOnce({
      usagePolicy: "off",
      usagePolicyChangedAt: null,
      usageMinimum: 0,
      twoFactorPolicy: "reviewers",
    });
    const html = renderToStaticMarkup(await AdminSettings("authentication"));
    expect(html).toContain('aria-label="Two-factor sign-in"');
    expect(html).toContain("Required for reviewers and root.");
    expect(html).toMatch(/checked="" value="reviewers"/);
  });

  it("saves the requirement, and shows a domain error", async () => {
    const data = new FormData();
    data.set("twoFactorPolicy", "everyone");
    settings.setTwoFactorPolicy.mockResolvedValueOnce({ changed: true });
    expect(await actions.saveTwoFactorPolicy({}, data)).toEqual({
      done: "Two-factor sign-in saved.",
    });
    expect(settings.setTwoFactorPolicy).toHaveBeenCalledWith(expect.any(Headers), "everyone");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/settings");
    settings.setTwoFactorPolicy.mockRejectedValueOnce(new ForbiddenError("settings.manage"));
    expect((await actions.saveTwoFactorPolicy({}, data)).error).toBeTruthy();
  });
});

describe("Sign-in methods with identity providers (106)", () => {
  const provider = (
    name: string,
    enabled: boolean,
    status: "on" | "off" | "failing" = enabled ? "on" : "off",
  ) => ({
    id: name.toLowerCase(),
    name,
    type: "oidc",
    typeLabel: "OpenID Connect",
    presetLabel: "Okta",
    issuer: "https://idp.example",
    domains: enabled ? ["acme.com"] : [],
    status,
    enabled,
    lastSignedInAt: null,
    lastFailureReason: null,
  });

  it("lists the password rule and each provider, on or off", () => {
    const methods = signInMethods(
      {
        twoFactorPolicy: "optional",
        passwordPolicy: "root_only",
        providers: [provider("Acme", true), provider("Beta", false)],
      },
      methodsT,
    );
    expect(methods.map((m) => [m.name, m.on])).toEqual([
      ["Email and password", true],
      ["Acme (OpenID Connect)", true],
      ["Beta (OpenID Connect)", false],
      ["Two-factor sign-in", false],
    ]);
    expect(methods[0]?.note).toContain(
      "Root only: everyone else signs in with an identity provider.",
    );
    expect(methods[1]?.note).toBe("Creates accounts for acme.com.");
    expect(methods[2]?.note).toBe("Links existing accounts only.");
    const html = renderToStaticMarkup(<SignInMethodsPanel methods={methods} />);
    expect(html).toContain("Acme (OpenID Connect)");
  });

  it("drops the Root only note while no provider is on (everyone has their password back)", () => {
    const methods = signInMethods(
      {
        twoFactorPolicy: "optional",
        passwordPolicy: "root_only",
        providers: [provider("Beta", false)],
      },
      methodsT,
    );
    expect(methods[0]?.note).not.toContain("Root only");
  });
});

describe("Admin › Settings › Privacy › Retention (102)", () => {
  it("is on the Privacy tab for root, with both numbers, their helper, and no other panel", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
    settings.instanceSettings.mockResolvedValueOnce({
      usagePolicy: "off",
      usagePolicyChangedAt: null,
      usageMinimum: 0,
      twoFactorPolicy: "optional",
      passwordSignInPolicy: "everyone",
      retention: { ipDays: 30, sessionsDays: 7, feedbackDays: 400 },
    });
    const html = renderToStaticMarkup(await AdminSettings("privacy"));
    expect(html.match(/aria-current="page"[^>]*>([^<]+)</)?.[1]).toBe("Privacy");
    expect(html).toContain("Retention");
    expect(html).toMatch(/name="ipDays"[^>]*value="30"/);
    expect(html).toMatch(/name="sessionsDays"[^>]*value="7"/);
    expect(html).toMatch(/name="feedbackDays"[^>]*value="400"/);
    expect(html).toContain("Keep handled feedback for");
    expect(html).toMatch(/<input[^>]*min="1"[^>]*max="3650"[^>]*name="ipDays"/);
    expect(html).toContain("What is purged, and when?");
    expect(html).not.toContain("Usage reporting");
    expect(html).not.toContain(">Sign-in methods</h2>");
    expect(feeds.pluginFeedStats).not.toHaveBeenCalled();
  });

  it("shows the purge's last run: none yet (naming RONNE_JOBS when off), the counts, or the error's name", () => {
    const none = renderToStaticMarkup(
      <LastRun
        status={{ lastRunAt: null, lastResult: null, running: false, schedulerOff: false }}
      />,
    );
    expect(none).toContain("No run yet.");
    expect(none).toContain("5 minutes after the server starts");
    expect(none).not.toContain("RONNE_JOBS");
    const off = renderToStaticMarkup(
      <LastRun
        status={{ lastRunAt: null, lastResult: null, running: false, schedulerOff: true }}
      />,
    );
    expect(off).toContain("Scheduled jobs are off (RONNE_JOBS): run rmk-server purge from cron.");
    const at = new Date("2026-10-18T12:00:00.000Z");
    const ok = renderToStaticMarkup(
      <LastRun
        status={{
          lastRunAt: at,
          lastResult: {
            at: at.toISOString(),
            ms: 120,
            status: "ok",
            counts: {
              ipsCleared: 1204,
              emailsCleared: 37,
              sessionsDeleted: 312,
              grantsDeleted: 9,
              feedbackDeleted: 6,
            },
          },
          running: false,
          schedulerOff: false,
        }}
      />,
    );
    expect(ok).toContain("cleared 1,204 IP addresses and 37 failed sign-ins’ emails");
    expect(ok).toContain(
      "deleted 312 expired sessions, 9 finished rmk login approvals and 6 handled feedback messages",
    );
    expect(ok).toMatch(/<time dateTime="2026-10-18T12:00:00.000Z"/);
    const failed = renderToStaticMarkup(
      <LastRun
        status={{
          lastRunAt: at,
          lastResult: { at: at.toISOString(), ms: 5, status: "failed", error: "ConnectionError" },
          running: true,
          schedulerOff: false,
        }}
      />,
    );
    expect(failed).toContain("failed (ConnectionError)");
    expect(failed).toContain("A run is in progress.");
  });

  it("reads the last run only on the Privacy tab, under the form", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
    jobs.retentionJobStatus.mockResolvedValueOnce({
      lastRunAt: new Date("2026-10-18T12:00:00.000Z"),
      lastResult: {
        at: "2026-10-18T12:00:00.000Z",
        ms: 1,
        status: "ok",
        counts: {
          ipsCleared: 2,
          emailsCleared: 0,
          sessionsDeleted: 0,
          grantsDeleted: 0,
          feedbackDeleted: 0,
        },
      },
      running: false,
      schedulerOff: false,
    });
    const html = renderToStaticMarkup(await AdminSettings("privacy"));
    expect(html).toContain("cleared 2 IP addresses");
    expect(html.indexOf("Keep IP addresses for")).toBeLessThan(html.indexOf("Last run"));
    jobs.retentionJobStatus.mockClear();
    renderToStaticMarkup(await AdminSettings("authentication"));
    renderToStaticMarkup(await AdminSettings());
    expect(jobs.retentionJobStatus).not.toHaveBeenCalled();
  });

  it("disables Save until a number changes", () => {
    expect(
      renderToStaticMarkup(
        <RetentionForm retention={{ ipDays: 90, sessionsDays: 90, feedbackDays: 365 }} />,
      ),
    ).toMatch(/<button[^>]*disabled=""[^>]*>Save/);
  });

  it("saves both numbers, keeps the tab, and shows a domain error", async () => {
    settings.setRetention.mockResolvedValueOnce({ changed: true });
    const data = new FormData();
    data.set("ipDays", "30");
    data.set("sessionsDays", "7");
    data.set("feedbackDays", "100");
    expect(await actions.saveRetention({}, data)).toEqual({ done: "Retention saved." });
    expect(settings.setRetention).toHaveBeenCalledWith(expect.anything(), {
      ipDays: "30",
      sessionsDays: "7",
      feedbackDays: "100",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/settings");
    settings.setRetention.mockResolvedValueOnce({ changed: false });
    expect(await actions.saveRetention({}, data)).toEqual({ done: "Nothing changed." });
    settings.setRetention.mockRejectedValueOnce(new InvalidRetentionError("ipDays"));
    expect(await actions.saveRetention({}, data)).toEqual({
      error: "IP addresses are kept for a whole number of days from 1 to 3,650.",
    });
    settings.setRetention.mockRejectedValueOnce(new ForbiddenError("settings.manage"));
    expect((await actions.saveRetention({}, data)).error).toBeTruthy();
  });
});

describe("Admin › Settings › Privacy › an erasure that wasn't completed (103)", () => {
  const at = new Date("2026-10-19T12:00:00.000Z");

  it("shows nothing when every erasure is complete", () => {
    const html = renderToStaticMarkup(<PendingErasures erasures={[]} />);
    expect(html).toBe("");
  });

  it("warns, lists when each started, and offers Retry", () => {
    const one = renderToStaticMarkup(
      <PendingErasures erasures={[{ userId: "u1", startedAt: at }]} />,
    );
    expect(one).toContain("WARN:");
    expect(one).toContain("An erasure wasn’t completed.");
    expect(one).toMatch(/<time dateTime="2026-10-19T12:00:00.000Z"/);
    expect(one).toMatch(/<button[^>]*type="submit"[^>]*>Retry</);
    expect(one).toContain("the retention purge also finishes it on its next run");
    const two = renderToStaticMarkup(
      <PendingErasures
        erasures={[
          { userId: "u1", startedAt: at },
          { userId: "u2", startedAt: at },
        ]}
      />,
    );
    expect(two).toContain("2 erasures weren’t completed.");
  });

  it("is on the Privacy tab, read with the tab, and absent when there's none", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
    erasures.adminPendingErasures.mockResolvedValueOnce([{ userId: "u1", startedAt: at }]);
    const html = renderToStaticMarkup(await AdminSettings("privacy"));
    expect(html).toContain("An erasure wasn’t completed.");
    expect(html.indexOf("Last run")).toBeLessThan(html.indexOf("Retry"));
    const clean = renderToStaticMarkup(await AdminSettings("privacy"));
    expect(clean).not.toContain("completed.");
    erasures.adminPendingErasures.mockClear();
    renderToStaticMarkup(await AdminSettings("authentication"));
    expect(erasures.adminPendingErasures).not.toHaveBeenCalled();
  });

  it("Retry says how many it finished, and shows a refusal", async () => {
    erasures.adminRetryErasures.mockResolvedValueOnce(1);
    expect(await actions.retryErasures({}, new FormData())).toEqual({
      done: "Finished 1 erasure.",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/settings");
    erasures.adminRetryErasures.mockResolvedValueOnce(0);
    expect(await actions.retryErasures({}, new FormData())).toEqual({
      done: "Nothing was left to finish.",
    });
    erasures.adminRetryErasures.mockRejectedValueOnce(new ForbiddenError("users.manage"));
    expect((await actions.retryErasures({}, new FormData())).error).toContain("users.manage");
    erasures.adminRetryErasures.mockRejectedValueOnce(new Error("boom"));
    await expect(actions.retryErasures({}, new FormData())).rejects.toThrow("boom");
  });
});

describe("Admin › Settings in three languages (132)", () => {
  it("the heading, the description and the tabs read in each language", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
    const words = {
      en: [
        "Settings",
        "How this instance behaves",
        "Plugin feeds",
        "Authentication",
        "Privacy",
        "Notice",
      ],
      pt: [
        "Configurações",
        "Como esta instância se comporta",
        "Feeds de plugins",
        "Autenticação",
        "Privacidade",
        "Comunicado",
      ],
      fr: [
        "Réglages",
        "Comment cette instance se comporte",
        "Flux de plugins",
        "Authentification",
        "Confidentialité",
        "Avis",
      ],
    } as const;
    for (const [locale, texts] of Object.entries(words) as [
      keyof typeof words,
      readonly string[],
    ][]) {
      const html = renderToStaticMarkup(
        await inLocaleAsync(locale, () => AdminSettings("authentication")),
      );
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });
});

describe("what the settings actions say, in each language (132)", () => {
  const say = async (locale: "en" | "pt" | "fr", run: () => Promise<unknown>) =>
    (await inLocaleAsync(locale, run)) as { done?: string; error?: string };

  it("the success lines read in the language of the request", async () => {
    settings.setUsagePolicy.mockResolvedValue({ changed: true });
    const save = () => actions.saveUsagePolicy({}, form("choice"));
    expect((await say("en", save)).done).toBe("Usage reporting saved.");
    expect((await say("pt", save)).done).toBe("Relatório de uso salvo.");
    expect((await say("fr", save)).done).toBe("Rapport d’utilisation enregistré.");
    settings.setUsagePolicy.mockResolvedValue({ changed: false });
    expect((await say("pt", save)).done).toBe("Nada mudou.");
    expect((await say("fr", save)).done).toBe("Rien n’a changé.");
  });

  it("Retry counts what it finished by each language's rule", async () => {
    const retry = (n: number) => async () => {
      erasures.adminRetryErasures.mockResolvedValueOnce(n);
      return actions.retryErasures({}, new FormData());
    };
    expect((await say("en", retry(1))).done).toBe("Finished 1 erasure.");
    expect((await say("en", retry(2))).done).toBe("Finished 2 erasures.");
    expect((await say("pt", retry(1))).done).toBe("1 apagamento concluído.");
    expect((await say("pt", retry(2))).done).toBe("2 apagamentos concluídos.");
    expect((await say("fr", retry(2))).done).toBe("2 effacements terminés.");
    expect((await say("fr", retry(0))).done).toBe("Il ne restait rien à terminer.");
  });

  it("the settings errors read in the language of the request", async () => {
    settings.setUsagePolicy.mockRejectedValue(new InvalidUsagePolicyError());
    const save = () => actions.saveUsagePolicy({}, form("nope"));
    expect((await say("en", save)).error).toBe(new InvalidUsagePolicyError().message);
    expect((await say("pt", save)).error).toBe(
      "Escolha desligado, cada pessoa escolhe ou obrigatório.",
    );
    expect((await say("fr", save)).error).toBe(
      "Choisissez désactivé, chacun choisit ou obligatoire.",
    );
  });
});

describe("an error nobody translated, in each language (132)", () => {
  it("still shows its English message", async () => {
    class SomethingNewError extends SettingsError {
      override readonly name: string = "SomethingNewError";
    }
    settings.setUsagePolicy.mockRejectedValue(new SomethingNewError("It broke in a new way."));
    for (const locale of ["en", "pt", "fr"] as const)
      expect(
        await inLocaleAsync(locale, () => actions.saveUsagePolicy({}, form("choice"))),
        locale,
      ).toEqual({ error: "It broke in a new way." });
  });
});
