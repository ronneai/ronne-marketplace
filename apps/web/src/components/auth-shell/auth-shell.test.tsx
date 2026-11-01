import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inLocale } from "@/test/intl";
import { AuthShell } from "./AuthShell";

const shell = (languages?: readonly ("en" | "pt" | "fr")[]) =>
  inLocale("en", () =>
    renderToStaticMarkup(
      <AuthShell here="/sign-in" languages={languages}>
        <p>content</p>
      </AuthShell>,
    ),
  );

describe("the auth shell and the language switch (141)", () => {
  it("has the switch, in a header, for every language by default", () => {
    const html = shell();
    expect(html).toContain("<header");
    expect(html).toContain("/language?set=pt");
  });

  it("offers only the languages root offers", () => {
    const html = shell(["en", "fr"]);
    expect(html).toContain("/language?set=fr");
    expect(html).not.toContain("/language?set=pt");
  });

  it("has no switch, and no empty header, with choosing off or one language", () => {
    for (const languages of [[], ["fr"]] as const) {
      const html = shell(languages);
      expect(html).not.toContain("/language?set=");
      expect(html).not.toContain("<header");
      expect(html).toContain("content");
    }
  });
});
