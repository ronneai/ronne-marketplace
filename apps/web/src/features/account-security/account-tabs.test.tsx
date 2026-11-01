import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountTabs } from "./AccountTabs";

describe("the Account tabs (141)", () => {
  it("has Password, Two-factor sign-in and Language", () => {
    const html = renderToStaticMarkup(<AccountTabs current="password" />);
    for (const href of ["/account/password", "/account/security", "/account/language"])
      expect(html).toContain(`href="${href}"`);
  });

  it("leaves out Language while root has turned choosing off", () => {
    const html = renderToStaticMarkup(<AccountTabs current="password" language={false} />);
    expect(html).toContain('href="/account/password"');
    expect(html).toContain('href="/account/security"');
    expect(html).not.toContain("/account/language");
  });
});
