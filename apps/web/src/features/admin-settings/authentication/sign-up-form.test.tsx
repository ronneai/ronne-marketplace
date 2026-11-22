// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SIGN_UP_POLICY,
  type SignUpPolicy,
} from "@/server/domains/settings/models/sign-up-policy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./sign-up-actions", () => ({ saveSignUp: vi.fn() }));
const { SignUpForm, blockersOf, versionChanged } = await import("./SignUpForm");
const { signUpInputFrom } = await import("./sign-up-input");
const { inLocale } = await import("@/test/intl");
const { englishLeaks } = await import("@/test/english-leak");

const READY = { mail: true, contact: true, password: true };
const html = (element: ReactElement) => renderToStaticMarkup(element);
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
const $ = (selector: string) => host.querySelector(selector) as HTMLInputElement | null;
const click = (el: Element | null) => act(async () => (el as HTMLElement).click());
const type = async (selector: string, value: string) => {
  const input = $(selector) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("the Self-registration panel (190)", () => {
  it("starts as every instance does: off, any domain, throwaway blocked, 15 minutes, challenge on", async () => {
    await mount(<SignUpForm policy={DEFAULT_SIGN_UP_POLICY} readiness={READY} />);
    expect($("#sign-up-enabled")?.checked).toBe(false);
    expect($("#sign-up-enabled")?.disabled).toBe(false);
    expect($('input[name="domainsMode"][value="any"]')?.checked).toBe(true);
    expect($("#sign-up-throwaway")?.checked).toBe(true);
    expect($("#sign-up-approval")?.checked).toBe(false);
    expect($("#sign-up-minutes")?.value).toBe("15");
    expect($("#sign-up-challenge")?.checked).toBe(true);
    expect($("#sign-up-terms-url")?.value).toBe("");
    expect(host.querySelector("#sign-up-domains")).toBeNull();
  });

  it("shows the domain list for Only these domains, and the throwaway box for Any domain", async () => {
    const policy: SignUpPolicy = { ...DEFAULT_SIGN_UP_POLICY, domains: ["acme.com", "acme.co.uk"] };
    await mount(<SignUpForm policy={policy} readiness={READY} />);
    expect((host.querySelector("#sign-up-domains") as HTMLTextAreaElement).value).toBe(
      "acme.com\nacme.co.uk",
    );
    expect($("#sign-up-throwaway")).toBeNull();
    await click($('input[name="domainsMode"][value="any"]'));
    expect(host.querySelector("#sign-up-domains")).toBeNull();
    expect($("#sign-up-throwaway")).not.toBeNull();
  });

  it("can't be turned on until email, the contact and password sign-in are ready, and says where to fix each", async () => {
    await mount(
      <SignUpForm
        policy={DEFAULT_SIGN_UP_POLICY}
        readiness={{ mail: false, contact: false, password: false }}
      />,
    );
    expect($("#sign-up-enabled")?.disabled).toBe(true);
    const notice = host.querySelector('[role="status"]')?.textContent ?? "";
    expect(notice).toContain("Email is set up");
    expect(notice).toContain("The instance contact is set");
    expect(notice).toContain("Everyone may sign in with a password");
    const links = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/admin/settings?tab=email",
      "/admin/settings?tab=email",
      "/admin/settings?tab=authentication",
    ]);
    expect(blockersOf({ mail: true, contact: false, password: true })).toEqual(["contact"]);
  });

  it("says sign-up is closed when it's on but something it needs has gone", () => {
    const page = html(
      <SignUpForm
        policy={{ ...DEFAULT_SIGN_UP_POLICY, enabled: true }}
        readiness={{ mail: false, contact: true, password: true }}
      />,
    );
    expect(page).toContain("Sign-up is on, but closed until these are done again");
    // Still on, so root can turn it off.
    expect(page).not.toMatch(/id="sign-up-enabled"[^>]*disabled=""/);
  });

  it("asks whether everyone accepts again only when the terms version changes", async () => {
    const policy: SignUpPolicy = {
      ...DEFAULT_SIGN_UP_POLICY,
      termsUrl: "https://acme.com/terms",
      termsVersion: "2026-10",
      termsRequiredVersion: "2026-10",
    };
    await mount(<SignUpForm policy={policy} readiness={READY} />);
    expect($("#sign-up-ask-again")).toBeNull();
    await type("#sign-up-terms-version", "2026-11");
    expect($("#sign-up-ask-again")).not.toBeNull();
    expect($("#sign-up-ask-again")?.checked).toBe(false);
    await type("#sign-up-terms-version", "2026-10");
    expect($("#sign-up-ask-again")).toBeNull();
    expect(versionChanged(policy, "", "2026-11")).toBe(false);
  });

  it("points at the field a save refused", () => {
    const page = html(
      <SignUpForm
        policy={{ ...DEFAULT_SIGN_UP_POLICY, domains: ["acme.com"] }}
        readiness={READY}
        initial={{ error: "List each email domain once", field: "domains" }}
      />,
    );
    expect(page).toMatch(/id="sign-up-domains"[^>]*aria-invalid="true"/);
    expect(page).toContain("List each email domain once");
  });

  it("shows no English in Portuguese or French", async () => {
    for (const locale of ["pt", "fr"] as const) {
      const page = inLocale(locale, () =>
        html(
          <SignUpForm
            policy={{
              ...DEFAULT_SIGN_UP_POLICY,
              termsUrl: "https://acme.com/t",
              termsVersion: "1",
            }}
            readiness={{ mail: false, contact: false, password: false }}
          />,
        ),
      );
      expect(await englishLeaks(["admin", "common"], locale, page), locale).toEqual([]);
    }
  });

  it("posts every field under the name the save reads", async () => {
    const policy: SignUpPolicy = {
      ...DEFAULT_SIGN_UP_POLICY,
      domains: ["acme.com"],
      approval: true,
      challenge: false,
      blockThrowaway: true,
      codeMinutes: 30,
      termsUrl: "https://acme.com/terms",
      termsVersion: "2026-10",
    };
    await mount(<SignUpForm policy={policy} readiness={READY} />);
    await click($("#sign-up-enabled"));
    await type("#sign-up-terms-version", "2026-11");
    await click($("#sign-up-ask-again"));
    const form = host.querySelector("form") as HTMLFormElement;
    expect(signUpInputFrom(new FormData(form))).toEqual({
      enabled: true,
      domainsMode: "list",
      domains: "acme.com",
      approval: true,
      blockThrowaway: true,
      codeMinutes: "30",
      challenge: false,
      termsUrl: "https://acme.com/terms",
      termsVersion: "2026-11",
      askAgain: true,
    });
  });

  it("posts every box ticked under its name with Any domain, so a missing field can't pass for off", async () => {
    const policy: SignUpPolicy = {
      ...DEFAULT_SIGN_UP_POLICY,
      enabled: true,
      approval: true,
      challenge: true,
      blockThrowaway: true,
    };
    await mount(<SignUpForm policy={policy} readiness={READY} />);
    const form = host.querySelector("form") as HTMLFormElement;
    expect(signUpInputFrom(new FormData(form))).toMatchObject({
      enabled: true,
      domainsMode: "any",
      approval: true,
      blockThrowaway: true,
      challenge: true,
    });
    // The throwaway box itself posts it: unticked, it's off.
    await click($("#sign-up-throwaway"));
    expect(signUpInputFrom(new FormData(form)).blockThrowaway).toBe(false);
  });

  it("keeps an unticked throwaway box when the list is chosen", async () => {
    await mount(<SignUpForm policy={DEFAULT_SIGN_UP_POLICY} readiness={READY} />);
    await click($("#sign-up-throwaway"));
    await click($('input[name="domainsMode"][value="list"]'));
    const form = host.querySelector("form") as HTMLFormElement;
    expect(signUpInputFrom(new FormData(form)).blockThrowaway).toBe(false);
  });
});
