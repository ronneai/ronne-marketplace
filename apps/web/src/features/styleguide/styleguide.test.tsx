import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { canViewStyleguide } from "./access";
import { Styleguide } from "./Styleguide";

describe("canViewStyleguide", () => {
  it("is open in development and root-only in production", () => {
    expect(canViewStyleguide("development", null)).toBe(true);
    expect(canViewStyleguide("production", null)).toBe(false);
    expect(canViewStyleguide("production", { email: "u@example.com", role: "user" })).toBe(false);
    expect(canViewStyleguide("production", { email: "r@example.com", role: "root" })).toBe(true);
  });
});

describe("Styleguide", () => {
  it("renders every primitive once per theme", () => {
    const html = renderToStaticMarkup(<Styleguide />);
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('data-theme="dark"');
    for (const marker of [
      "Primary",
      "Remember me",
      "ERR:",
      "WARN:",
      "INFO:",
      'role="tablist"',
      "rmk login --token",
      "Open dialog",
      "<table",
    ]) {
      expect(html.split(marker).length - 1, marker).toBeGreaterThanOrEqual(2);
    }
  });
});
