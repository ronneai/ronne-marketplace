import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountTabs } from "./AccountTabs";

describe("the Account tabs (141)", () => {
  it("has Password, Two-factor sign-in, Access tokens (162) and Language, in that order", () => {
    const html = renderToStaticMarkup(<AccountTabs current="password" />);
    const order = [
      "/account/password",
      "/account/security",
      "/account/tokens",
      "/account/language",
    ];
    for (const href of order) expect(html).toContain(`href="${href}"`);
    const at = order.map((href) => html.indexOf(`href="${href}"`));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain(">Access tokens<");
  });

  it("leaves out Language while root has turned choosing off", () => {
    const html = renderToStaticMarkup(<AccountTabs current="password" language={false} />);
    expect(html).toContain('href="/account/password"');
    expect(html).toContain('href="/account/security"');
    expect(html).toContain('href="/account/tokens"');
    expect(html).not.toContain("/account/language");
  });
});
