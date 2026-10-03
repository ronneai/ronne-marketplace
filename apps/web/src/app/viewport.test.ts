import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "@/features/theme/theme";
import { THEME_COLOR, viewportFor } from "./viewport";

describe("viewportFor", () => {
  const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  // The `--surface` value in a theme's block of tokens.css.
  const surface = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    return /--surface:\s*(#[0-9a-f]{6})/i.exec(css.slice(start, css.indexOf("}", start)))?.[1];
  };

  it.each(THEMES)("%s uses the header's surface colour from tokens.css", (theme) => {
    expect(THEME_COLOR[theme]).toBe(surface(`[data-theme="${theme}"]`)?.toLowerCase());
    expect(viewportFor(theme).themeColor).toBe(THEME_COLOR[theme]);
  });

  it("covers the screen for safe areas and never limits zoom", () => {
    const viewport = viewportFor("light");
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
    });
    expect(viewport).not.toHaveProperty("maximumScale");
    expect(viewport).not.toHaveProperty("userScalable");
  });
});
