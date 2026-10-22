import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CliAuthPanel } from "@/components/cli-auth/CliAuthPanel";
import { rmkCommands } from "@/components/cli-auth/commands";
import {
  type GettingStarted,
  gettingStartedOf,
} from "@/server/domains/onboarding/models/getting-started";
import { NO_ONBOARDING } from "@/server/domains/onboarding/models/onboarding";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({
  confirmInstallFromForm: vi.fn(),
  hideGettingStartedFromForm: vi.fn(),
  showGettingStartedFromForm: vi.fn(),
}));
const { GettingStartedPanel } = await import("./GettingStartedPanel");

const AT = new Date("2026-10-21T10:00:00Z");
const state = (
  facts: Partial<{ hasToken: boolean; connected: boolean; hasSubmission: boolean }> = {},
  install = false,
  extra: Partial<typeof NO_ONBOARDING> = {},
): GettingStarted =>
  gettingStartedOf(
    { hasToken: false, connected: false, hasSubmission: false, ...facts },
    { ...NO_ONBOARDING, ...(install ? { installConfirmedAt: AT } : {}), ...extra },
  );
const view = (node: ReactElement) => inLocale("en", () => renderToStaticMarkup(node));
const REGISTRY = "https://market.example";
const panel = (s: GettingStarted, noScope = false) =>
  view(<GettingStartedPanel state={s} registry={REGISTRY} noScope={noScope} />);
/** The step list items, whole. */
const steps = (html: string) => html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];

describe("Getting started: each progress state (126)", () => {
  it("0 of 4: no step ticked, the first one highlighted", () => {
    const html = panel(state());
    expect(html).toContain("0 of 4 done");
    const [one, two, three, four] = steps(html);
    expect(one).toContain('aria-current="step"');
    for (const other of [two, three, four]) expect(other).not.toContain("aria-current");
    expect(html.match(/Not done yet/g)).toHaveLength(4);
    expect(html).not.toContain(">Done<");
  });

  it("1 of 4: step 1 ticked and step 2 highlighted", () => {
    const html = panel(state({ hasToken: true }));
    expect(html).toContain("1 of 4 done");
    const [one, two] = steps(html);
    expect(one).toContain(">Done<");
    expect(one).not.toContain("aria-current");
    expect(two).toContain('aria-current="step"');
  });

  it("2 of 4 and 3 of 4: the install stays highlighted until it is said", () => {
    expect(panel(state({ hasToken: true, connected: true }))).toContain("2 of 4 done");
    // A draft counts although the install isn't said yet; steps 1–3 done would be 'You’re set up'.
    const three = panel(state({ hasToken: true, connected: true, hasSubmission: true }));
    expect(three).toContain("3 of 4 done");
    expect(steps(three)[2]).toContain('aria-current="step"');
  });

  it("step 4 says it is optional, and a draft alone is 1 of 4", () => {
    const html = panel(state({ hasSubmission: true }));
    expect(steps(html)[3]).toContain("Optional");
    expect(html).toContain("1 of 4 done");
  });

  it("all four done: every step ticked, none highlighted", () => {
    const html = panel(
      state({ hasToken: true, connected: true, hasSubmission: true }, true, {}),
      false,
    );
    // Steps 1–3 done and not seen: it is the 'You’re set up' state.
    expect(html).toContain(">You’re set up<");
    expect(html).not.toContain("0 of 4");
  });

  it("draws nothing when it is hidden or already seen", () => {
    expect(panel(state({}, false, { hiddenAt: AT }))).toBe("");
    expect(panel(state({ hasToken: true, connected: true }, true, { completedSeenAt: AT }))).toBe(
      "",
    );
  });
});

describe("Getting started: You’re set up", () => {
  const done = state({ hasToken: true, connected: true }, true);

  it("says so with links to the Documentation and to propose an item, and no steps", () => {
    const html = panel(done);
    expect(html).toContain(">You’re set up<");
    expect(html).toContain("https://www.ronne.ai/en/marketplace/docs");
    expect(html).toMatch(/href="\/submissions\/new"/);
    expect(steps(html)).toEqual([]);
    expect(html).not.toContain("<form");
  });
});

describe("Getting started: the commands", () => {
  it("are the instance's own, the same lines as the CLI panel", () => {
    const html = panel(state({ hasToken: true }));
    expect(html).toContain(`rmk login --registry ${REGISTRY} --web`);
    expect(html).toContain(`rmk login --registry ${REGISTRY} --token &lt;token&gt;`);
  });

  it("come from the function the CLI panel on Access tokens uses, so they never differ", () => {
    const cli = view(<CliAuthPanel registry={REGISTRY} />);
    const home = panel(state());
    const commands = rmkCommands(REGISTRY);
    for (const line of [commands.install, commands.loginWeb])
      for (const html of [cli, home]) expect(html).toContain(line);
    expect(cli).toContain(commands.loginToken.replace("<", "&lt;").replace(">", "&gt;"));
    expect(home).toContain(commands.loginToken.replace("<", "&lt;").replace(">", "&gt;"));
  });

  it("start with the npm install line only while the person has no token", () => {
    expect(panel(state())).toContain("npm install --global @ronneai/rmk");
    expect(panel(state({ hasToken: true }))).not.toContain("npm install --global");
  });

  it("say <url> when the instance's address isn't known", () => {
    const html = view(<GettingStartedPanel state={state()} />);
    expect(html).toContain("rmk login --registry &lt;url&gt; --web");
  });

  it("never show a token: nothing that looks like one is on the panel", () => {
    expect(panel(state({ hasToken: true, connected: true }))).not.toMatch(/rmk_[A-Za-z0-9_-]{8}/);
  });
});

describe("Getting started: the buttons are forms", () => {
  it("has Hide, and 'I’ve installed one' until it is said", () => {
    const html = panel(state());
    expect(html).toContain('aria-label="Hide Getting started"');
    expect(html).toContain(">I’ve installed one<");
    expect(html.match(/<form/g)).toHaveLength(2);
    for (const form of html.match(/<form[\s\S]*?<\/form>/g) ?? [])
      expect(form).toContain('type="submit"');
    const said = panel(state({}, true));
    expect(said).not.toContain("I’ve installed one");
    expect(said.match(/<form/g)).toHaveLength(1);
  });

  it("links the steps to where they happen", () => {
    const html = panel(state());
    expect(html).toContain('href="/account/tokens"');
    expect(html).toContain('href="/catalogue"');
    expect(html).toContain('href="/submissions/new"');
    expect(html).toContain("marketplace/docs/export#what");
  });

  it("tells root about a missing scope, and only when asked", () => {
    expect(panel(state(), true)).toContain("This registry has no scope yet.");
    expect(panel(state(), true)).toContain('href="/workspaces/global"');
    expect(panel(state())).not.toContain("no scope yet");
  });
});
