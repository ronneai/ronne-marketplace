import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ setThemeFromForm: vi.fn() }));
const { ThemeToggle } = await import("./ThemeToggle");

describe("ThemeToggle", () => {
  it("cycles system → light → dark → system, and says so", () => {
    const cases = [
      ["system", "light", "lucide-monitor"],
      ["light", "dark", "lucide-sun"],
      ["dark", "system", "lucide-moon"],
    ] as const;
    for (const [theme, next, icon] of cases) {
      const html = renderToStaticMarkup(<ThemeToggle theme={theme} />);
      expect(html, theme).toContain(`value="${next}"`);
      expect(html, theme).toContain(`Using the ${theme} theme. Switch to the ${next} theme.`);
      expect(html, theme).toContain(icon);
      expect(html, theme).toContain('type="submit"');
    }
  });
});
