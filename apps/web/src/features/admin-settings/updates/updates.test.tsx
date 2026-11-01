import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePlans } from "@/server/runtime";
import type { UpdatesView } from "./UpdatesPanel";

const settings = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  setUpdateCheck: vi.fn(),
  checkUpdateNow: vi.fn(),
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
vi.mock("@/server/domains/feeds/actions/feeds", () => ({}));
vi.mock("@/server/jobs/actions", () => ({}));
vi.mock("@/server/domains/identity/actions/erase-user", () => ({}));
vi.mock("@/server/domains/identity/actions/two-factor", () => ({}));
vi.mock("@/server/domains/identity/actions/identity-providers", () => ({}));
vi.mock("@/server/domains/identity/actions/password-policy", () => ({}));

const { inLocale } = await import("@/test/intl");
const { checkNow, saveUpdateCheck } = await import("./actions");
const { UpdatesPanel } = await import("./UpdatesPanel");
const { UpdatesTab } = await import("./UpdatesTab");
const { default: AdminSettingsPage } = await import("@/app/(app)/admin/settings/page");
const english = (await import("../../../../messages/en/admin.json")).default.updates;

type L = "en" | "pt" | "fr";
const view = (locale: L, node: ReactElement) => inLocale(locale, () => renderToStaticMarkup(node));

const at = new Date("2026-11-01T14:00:00.000Z");
const seen: UpdatesView = {
  enabled: true,
  latest: "0.9.0",
  url: "https://github.com/ronneai/ronne-marketplace/releases/tag/v0.9.0",
  checkedAt: at,
  error: null,
  current: "0.8.2",
  offByEnvironment: false,
};
const docker = updatePlans({ RONNE_RUNTIME: "docker" });

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
  settings.updateSettings.mockResolvedValue(seen);
});

describe("The Updates tab (140)", () => {
  it("is a tab of Settings, selected by ?tab=updates", async () => {
    const html = renderToStaticMarkup(
      await AdminSettingsPage({ searchParams: Promise.resolve({ tab: "updates" }) }),
    );
    expect(html).toMatch(/aria-current="page"[^>]*>Updates</);
    expect(html).toContain('href="/admin/settings?tab=updates"');
    expect(html).toContain(english.how);
    expect(html).not.toContain("Usage reporting");
  });

  it("is a 404 for anyone but root, before anything is read", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "u", role: "user" });
    await expect(
      AdminSettingsPage({ searchParams: Promise.resolve({ tab: "updates" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(settings.updateSettings).not.toHaveBeenCalled();
  });

  it("reads this server's settings", async () => {
    const html = renderToStaticMarkup(await UpdatesTab());
    expect(settings.updateSettings).toHaveBeenCalledTimes(1);
    expect(html).toContain("0.8.2");
  });
});

describe("the Updates panel (140)", () => {
  const panel = (locale: L, extra: Partial<UpdatesView> = {}, plans = docker) =>
    view(locale, <UpdatesPanel settings={{ ...seen, ...extra }} plans={plans} />);

  it("shows both versions, the notes link, when it was checked, and that a newer one is out", () => {
    const html = panel("en");
    expect(html).toContain("0.8.2");
    expect(html).toContain(">0.9.0<");
    expect(html).toContain(`href="${seen.url}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Version 0.9.0 is out.");
    expect(html).not.toContain(english.upToDate);
  });

  it("says up to date when the running version is the latest", () => {
    const html = panel("en", { latest: "0.8.2" });
    expect(html).toContain(english.upToDate);
    expect(html).not.toContain("is out.");
  });

  it("says it was never checked on a new instance", () => {
    const html = panel("en", { latest: null, url: null, checkedAt: null });
    expect(html).toContain(english.notChecked);
    expect(html).toContain(english.never);
    expect(html).not.toContain(english.upToDate);
  });

  it.each([
    ["unreachable", "reach GitHub. Ronne tries again tomorrow."],
    ["rate_limited", "GitHub is limiting requests right now."],
    ["bad_answer", "one Ronne understands. Ronne tries again tomorrow."],
  ] as const)(
    "says why the last check failed (%s), keeping the last good answer",
    (error, words) => {
      const html = panel("en", { error });
      expect(html).toContain(words);
      expect(html).toContain(">0.9.0<");
    },
  );

  it("lists every way to install, this instance's first, open and marked", () => {
    const html = panel("en", {}, updatePlans({ RONNE_RUNTIME: "docker" }));
    const titles = [
      "Docker",
      "npm package",
      "npm package as a service",
      ".deb or .rpm package",
      "Clone of the repository",
    ];
    const at = titles.map((title) => html.indexOf(`>${title}`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(html.match(/<details[^>]*open/g)).toHaveLength(1);
    expect(html.match(/This instance/g)).toHaveLength(1);
    expect(html.indexOf("<details open")).toBeLessThan(html.indexOf("This instance"));
    // The first is the one that is open: Docker's, here.
    expect(/<details[^>]*open[^>]*><summary[^>]*>Docker/.test(html)).toBe(true);
  });

  it("opens the way this server runs by, whichever it is", () => {
    const openTitle = (env: Record<string, string>) =>
      /<details[^>]*open[^>]*><summary[^>]*>([^<]*)</.exec(panel("en", {}, updatePlans(env)))?.[1];
    expect(openTitle({ RONNE_RUNTIME: "docker" })).toBe("Docker");
    expect(openTitle({ RONNE_RUNTIME: "npm" })).toBe("npm package");
    expect(openTitle({ RONNE_RUNTIME: "npm", RONNE_SERVICE: "1" })).toBe(
      "npm package as a service",
    );
    expect(openTitle({})).toBe("Clone of the repository");
  });

  it("shows each way's commands, after its own backup, all of them whatever the runtime", () => {
    const html = panel("en", {}, updatePlans({}));
    for (const command of [
      "docker compose exec web pnpm run backup",
      "docker compose pull",
      "docker compose up -d",
      "rmk-server backup",
      "npm install --global @ronneai/marketplace@latest",
      "sudo rmk-server backup",
      "sudo rmk-server service restart",
      "sudo apt install ./rmk-server_*.deb",
      "sudo dnf install ./rmk-server-*.rpm",
      "pnpm run backup",
      "git pull",
      "pnpm install",
      "pnpm build",
    ])
      expect(html, command).toContain(command);
    // Each way is a block of its own: the backup comes before its update commands.
    const docker = html.slice(html.indexOf(">Docker<"), html.indexOf(">npm package<"));
    expect(docker.indexOf("run backup")).toBeLessThan(docker.indexOf("docker compose pull"));
    expect(docker).not.toContain("git pull");
  });

  it("has the switch on, editable, with Check now", () => {
    const html = panel("en");
    expect(html).toMatch(/<input[^>]*id="update-check-enabled"[^>]*checked=""/);
    expect(html).not.toMatch(/<input[^>]*id="update-check-enabled"[^>]*disabled/);
    expect(html).toContain(english.checkNow);
    expect(html).toContain(english.checkNowHint);
  });

  it("greys the switch out as set on the server, and checks nothing, when RONNE_UPDATE_CHECK=off", () => {
    const html = panel("en", { offByEnvironment: true });
    expect(html).toMatch(/<input[^>]*id="update-check-enabled"[^>]*disabled=""/);
    expect(html).not.toMatch(/<input[^>]*id="update-check-enabled"[^>]*checked=""/);
    expect(html).toContain("Set on the server (RONNE_UPDATE_CHECK=off).");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Check now/);
    expect(html).toContain(english.checkNowOff);
  });

  it("marks what is shown as from before when root turned the check off", () => {
    const html = panel("en", { enabled: false });
    expect(html).toContain(english.fromBefore);
    expect(html).not.toMatch(/<input[^>]*id="update-check-enabled"[^>]*checked=""/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Check now/);
  });

  it("reads in Portuguese and French, with no English left in the sentences", () => {
    for (const locale of ["pt", "fr"] as const) {
      const html = panel(locale);
      expect(html).not.toContain(english.intro);
      expect(html).not.toContain(english.how);
      expect(html).not.toContain(english.checkNow);
    }
    expect(panel("pt")).toContain("Verificar agora");
    expect(panel("fr")).toContain("Vérifier maintenant");
  });
});

describe("the Updates actions (140)", () => {
  it("saves the switch: a missing checkbox is off", async () => {
    settings.setUpdateCheck.mockResolvedValue({ changed: true });
    expect(await saveUpdateCheck({}, new FormData())).toEqual({ done: "saved" });
    expect(settings.setUpdateCheck).toHaveBeenLastCalledWith(expect.any(Headers), false);
    const on = new FormData();
    on.set("enabled", "on");
    settings.setUpdateCheck.mockResolvedValue({ changed: false });
    expect(await saveUpdateCheck({}, on)).toEqual({ done: "unchanged" });
    expect(settings.setUpdateCheck).toHaveBeenLastCalledWith(expect.any(Headers), true);
  });

  it.each([
    [{ status: "too_soon" }, "too_soon"],
    [{ status: "off", by: "environment" }, "off_by_environment"],
    [{ status: "off", by: "switch" }, "off_by_switch"],
    [{ status: "failed", reason: "unreachable" }, "failed"],
    [{ status: "checked", latest: "0.9.0", newer: true, notified: 1 }, "newer"],
    [{ status: "checked", latest: "0.8.2", newer: false, notified: 0 }, "checked"],
  ] as const)("Check now answers %j as %s", async (outcome, done) => {
    settings.checkUpdateNow.mockResolvedValue(outcome);
    expect(await checkNow({})).toEqual({ done });
  });
});
