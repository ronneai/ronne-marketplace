import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ setThemeFromForm: vi.fn() }));
const { ThemeToggle } = await import("./ThemeToggle");

describe("ThemeToggle", () => {
  it("switches between light and dark, showing the theme it switches to", () => {
    const light = renderToStaticMarkup(<ThemeToggle theme="light" />);
    expect(light).toContain('value="dark"');
    expect(light).toContain("Switch to the dark theme");
    expect(light).toContain("lucide-moon");

    const dark = renderToStaticMarkup(<ThemeToggle theme="dark" />);
    expect(dark).toContain('value="light"');
    expect(dark).toContain("Switch to the light theme");
    expect(dark).toContain("lucide-sun");
    expect(dark).not.toContain("system");
  });
});
