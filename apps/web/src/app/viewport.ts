import type { Viewport } from "next";
import type { Theme } from "@/features/theme/theme";

/**
 * The browser bar's colour for each theme (feature 065): the header's `surface` token, so on a
 * phone the bar and the header read as one. Kept next to tokens.css; a test checks they match.
 */
export const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#14213d" };

/**
 * The page's viewport (feature 065): the device width, `viewport-fit=cover` so the safe-area
 * insets apply, and the theme's colour. Zoom is never limited (no `maximum-scale`).
 */
export const viewportFor = (theme: Theme): Viewport => ({
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLOR[theme],
});
