// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderRow } from "@/server/domains/identity/actions/identity-providers";
import { DEFAULT_ACCOUNT_RULES } from "@/server/domains/settings/models/account-rules";
import { DEFAULT_SIGN_UP_POLICY } from "@/server/domains/settings/models/sign-up-policy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./actions", () => ({ saveAccountRules: vi.fn() }));
const { AccountRulesPanel } = await import("./AccountRulesPanel");
const { waysIn } = await import("./overview");
const { accountRulesInputFrom } = await import("./input");
const { inLocale } = await import("@/test/intl");

let root: Root | null = null;
let host: HTMLElement;
const mount = async (element: ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(element));
};
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const provider = (overrides: Partial<ProviderRow> = {}): ProviderRow => ({
  id: "entra",
  name: "Entra",
  type: "oidc",
  typeLabel: "OpenID Connect",
  presetLabel: "Microsoft Entra ID",
  issuer: "https://login.microsoftonline.com/x/v2.0",
  domains: ["acme.com"],
  createsAccounts: true,
  anyDomain: false,
  needsApproval: false,
  linkByEmail: true,
  status: "on",
  enabled: true,
  lastSignedInAt: null,
  lastFailureReason: null,
  ...overrides,
});

describe("the ways in (191)", () => {
  it("lists email sign-up first, then each provider by name, with their settings", () => {
    const ways = waysIn({
      signUp: { ...DEFAULT_SIGN_UP_POLICY, enabled: true, approval: true },
      providers: [
        provider({ id: "okta", name: "Okta", createsAccounts: false, enabled: false }),
        provider({ id: "google", name: "Google", anyDomain: true, linkByEmail: false }),
        provider(),
      ],
      blockedDomains: [],
      mailReady: true,
    });
    expect(
      ways.map((w) => [w.kind, w.name, w.on, w.createsAccounts, w.domains, w.approval]),
    ).toEqual([
      ["sign_up", "", true, true, "any", true],
      ["provider", "Entra", true, true, ["acme.com"], false],
      ["provider", "Google", true, true, "any", false],
      ["provider", "Okta", false, false, ["acme.com"], false],
    ]);
    expect(ways[0]).toMatchObject({ href: "#self-registration", linkByEmail: null });
    expect(ways[1]?.href).toBe("/admin/settings?tab=authentication&provider=entra");
  });

  it("warns about a listed domain the block list keeps out, only where it would create accounts", () => {
    const ways = waysIn({
      signUp: { ...DEFAULT_SIGN_UP_POLICY, domains: ["acme.org", "acme.com"] },
      providers: [
        provider({ domains: ["acme.com", "acme.org"] }),
        provider({ id: "okta", name: "Okta", domains: ["acme.org"], createsAccounts: false }),
        provider({ id: "google", name: "Google", anyDomain: true }),
      ],
      blockedDomains: ["acme.org"],
      mailReady: true,
    });
    expect(ways.map((w) => [w.name, w.blockedListed])).toEqual([
      ["", ["acme.org"]],
      ["Entra", ["acme.org"]],
      ["Google", []],
      ["Okta", []],
    ]);
  });

  it("warns about approval without email, for a provider that creates accounts", () => {
    const ways = waysIn({
      signUp: DEFAULT_SIGN_UP_POLICY,
      providers: [provider({ needsApproval: true })],
      blockedDomains: [],
      mailReady: false,
    });
    expect(ways[1]?.approvalWithoutMail).toBe(true);
  });
});

describe("the Who may create accounts panel (191)", () => {
  const ways = waysIn({
    signUp: DEFAULT_SIGN_UP_POLICY,
    providers: [provider({ domains: ["acme.com", "acme.org"], needsApproval: true })],
    blockedDomains: ["acme.org"],
    mailReady: false,
  });
  const rules = { ...DEFAULT_ACCOUNT_RULES, blockedDomains: ["acme.org", "yahoo.com"], version: 4 };

  it("shows the block list above the overview, and posts it with the version it was opened with", async () => {
    await mount(<AccountRulesPanel rules={rules} ways={ways} />);
    const list = host.querySelector("#blocked-domains") as HTMLTextAreaElement;
    expect(list.value).toBe("acme.org\nyahoo.com");
    const form = host.querySelector("form") as HTMLFormElement;
    const table = host.querySelector("table") as HTMLTableElement;
    // The list comes first, then the overview.
    expect(form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(accountRulesInputFrom(new FormData(form))).toEqual({
      blockedDomains: "acme.org\nyahoo.com",
      blockThrowaway: true,
      version: "4",
    });
    await act(async () => (host.querySelector("#block-throwaway") as HTMLElement).click());
    expect(accountRulesInputFrom(new FormData(form)).blockThrowaway).toBe(false);
  });

  it("has a row per way in with its columns, a link to each form, and the warnings", async () => {
    await mount(<AccountRulesPanel rules={rules} ways={ways} />);
    const rows = [...host.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent),
    );
    expect(rows).toEqual([
      ["Email sign-up", "No", "No", "–", "–", "–"],
      ["Entra", "Yes", "Yes", "acme.com, acme.org", "Yes", "Yes"],
    ]);
    expect([...host.querySelectorAll("tbody a")].map((a) => a.getAttribute("href"))).toEqual([
      "#self-registration",
      "/admin/settings?tab=authentication&provider=entra",
    ]);
    const text = host.textContent ?? "";
    expect(text).toContain("acme.org is blocked, so Entra can't create accounts for it.");
    expect(text).toContain("Entra makes new accounts wait for approval, but email isn't set up");
  });

  it("says a damaged stored list creates nothing until it's saved again", async () => {
    await mount(
      <AccountRulesPanel rules={{ ...DEFAULT_ACCOUNT_RULES, damaged: true }} ways={[]} />,
    );
    expect(host.textContent).toContain("The stored block list couldn't be read");
  });

  it("reads in each language", () => {
    for (const locale of ["pt", "fr"] as const) {
      const markup = inLocale(locale, () =>
        renderToStaticMarkup(<AccountRulesPanel rules={rules} ways={ways} />),
      );
      expect(markup).not.toContain("Who may create accounts");
      expect(markup).not.toContain("Blocked email domains");
    }
  });
});
