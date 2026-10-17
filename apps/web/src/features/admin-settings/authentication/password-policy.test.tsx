import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ savePasswordSignInPolicy: vi.fn() }));

/** The Root only radio's tag, whatever order React writes its attributes in. */
const rootOnly = (html: string) => html.match(/<input[^>]*value="root_only"[^>]*>/)?.[0] ?? "";
const { PasswordPolicyForm, canSave } = await import("./PasswordPolicyForm");

describe("Password sign-in (106)", () => {
  it("can't choose Root only without a provider that's on and tested, and says why", () => {
    const html = renderToStaticMarkup(
      <PasswordPolicyForm policy="everyone" usableProvider={false} affected={4} />,
    );
    expect(rootOnly(html)).toContain('disabled=""');
    expect(html).toContain("Turn on an identity provider that has passed its Test sign-in first.");
  });

  it("offers Root only once a provider is usable, and says root keeps its password", () => {
    const html = renderToStaticMarkup(
      <PasswordPolicyForm policy="everyone" usableProvider affected={4} />,
    );
    expect(rootOnly(html)).not.toContain('disabled=""');
    expect(html).toContain("Root always can");
  });

  it("keeps Root only selectable when it's already chosen, even with no usable provider left", () => {
    const html = renderToStaticMarkup(
      <PasswordPolicyForm policy="root_only" usableProvider={false} affected={4} />,
    );
    expect(rootOnly(html)).toContain('checked=""');
    expect(rootOnly(html)).not.toContain('disabled=""');
  });
});

describe("Save", () => {
  it("needs a change, and the confirm to take passwords away", () => {
    expect(canSave("everyone", "everyone", false)).toBe(false);
    expect(canSave("root_only", "everyone", false)).toBe(false);
    expect(canSave("root_only", "everyone", true)).toBe(true);
    expect(canSave("everyone", "root_only", false)).toBe(true);
  });
});
