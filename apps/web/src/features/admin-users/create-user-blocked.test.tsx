// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./actions", () => ({ createUserFromForm: vi.fn() }));
const { CreateUserForm, typedDomain } = await import("./CreateUserDialog");

let root: Root | null = null;
let host: HTMLElement;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});
const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <CreateUserForm onDone={() => {}} blockedDomains={["acme.org", "xn--bcher-kva.example"]} />,
    ),
  );
};
const type = async (value: string) => {
  const input = host.querySelector("#new-email") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("Create user for a blocked domain (191)", () => {
  it("warns once the address is in a blocked domain, and asks Create anyway", async () => {
    await mount();
    expect(host.querySelector('input[name="confirmBlocked"]')).toBeNull();
    await type("sam@ACME.org.");
    expect(host.textContent).toContain("acme.org is on the block list. Create anyway?");
    const confirm = host.querySelector('input[name="confirmBlocked"]') as HTMLInputElement;
    expect(confirm.checked).toBe(false);
    // Exact: a subdomain isn't blocked.
    await type("sam@eu.acme.org");
    expect(host.querySelector('input[name="confirmBlocked"]')).toBeNull();
  });

  it("reads an internationalised domain as the server does, so the box appears for it too", async () => {
    expect(typedDomain("sam@Bücher.example")).toBe("xn--bcher-kva.example");
    expect(typedDomain("sam@ACME.org.")).toBe("acme.org");
    expect(typedDomain("nobody")).toBe("");
    await mount();
    await type("sam@bücher.example");
    expect(host.querySelector('input[name="confirmBlocked"]')).not.toBeNull();
  });
});
