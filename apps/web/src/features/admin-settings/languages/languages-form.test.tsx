// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguagePolicy } from "@/server/domains/settings/models/language-policy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./actions", () => ({ saveLanguages: vi.fn() }));

const { LanguagesForm } = await import("./LanguagesForm");

let root: Root;
let host: HTMLElement;

const mount = async (policy: LanguagePolicy) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<LanguagesForm policy={policy} />));
};
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const all: LanguagePolicy = { default: "en", choice: true, offered: ["en", "pt", "fr"] };
const offered = (name: string) =>
  [...host.querySelectorAll("fieldset label")]
    .find((l) => l.textContent?.startsWith(name))
    ?.querySelector("input") as HTMLInputElement;
const fieldset = () => host.querySelector("fieldset") as HTMLFieldSetElement;
const choice = () => host.querySelector("#language-choice") as HTMLInputElement;
const select = () => host.querySelector("#language-default") as HTMLSelectElement;
const click = (el: Element) => act(async () => (el as HTMLElement).click());
const note = () => host.querySelector('[role="status"]')?.textContent ?? "";

describe("the Languages form (141)", () => {
  it("starts as root saved it: the default selected, the switch, each offered language ticked", async () => {
    await mount({ default: "fr", choice: false, offered: ["pt", "fr"] });
    expect(select().value).toBe("fr");
    expect(choice().checked).toBe(false);
    expect(offered("Português").checked).toBe(true);
    expect(offered("English").checked).toBe(false);
  });

  it("locks the default's box, ticked, and says why", async () => {
    await mount(all);
    expect(offered("English").checked).toBe(true);
    expect(offered("English").disabled).toBe(true);
    expect(fieldset().textContent).toContain("always offered");
    expect(offered("Português").disabled).toBe(false);
    // The locked box is not sent by the browser: the default travels in a hidden field.
    const sent = [...host.querySelectorAll('input[name="offered"]')] as HTMLInputElement[];
    expect(sent.some((input) => input.type === "hidden" && input.value === "en")).toBe(true);
  });

  it("moves the lock to a new default, and ticks it", async () => {
    await mount({ default: "en", choice: true, offered: ["en", "pt"] });
    await act(async () => {
      select().value = "fr";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(offered("Français").disabled).toBe(true);
    expect(offered("Français").checked).toBe(true);
    expect(offered("English").disabled).toBe(false);
    expect(offered("English").checked).toBe(true);
  });

  it("hides the list while choosing is off and shows it again, keeping what was ticked", async () => {
    await mount(all);
    expect(fieldset().hidden).toBe(false);
    await click(offered("Português"));
    await click(choice());
    expect(fieldset().hidden).toBe(true);
    await click(choice());
    expect(fieldset().hidden).toBe(false);
    expect(offered("Português").checked).toBe(false);
    expect(offered("Français").checked).toBe(true);
  });

  it("says choosing reads as off when only the default is offered", async () => {
    await mount({ default: "pt", choice: true, offered: ["pt"] });
    expect(note()).toContain("Only Português is offered");
    expect(note()).toContain("as if choosing were off");
  });

  it("drops that note when another language is ticked, or choosing is off", async () => {
    await mount({ default: "pt", choice: true, offered: ["pt"] });
    await click(offered("English"));
    expect(note()).toBe("");
    await click(offered("English"));
    expect(note()).toContain("Only Português");
    await click(choice());
    expect(note()).toBe("");
  });

  it("says nothing when several languages are offered", async () => {
    await mount(all);
    expect(note()).toBe("");
  });
});
