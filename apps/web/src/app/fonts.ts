import localFont from "next/font/local";

// Self-hosted brand fonts (feature 032); see fonts/README.md for sources and licenses.
// The design system uses weights 400, 500 and 600 only (158).

/**
 * Inter: all human-facing text (feature 158, replacing Manrope). The Latin subset covers English,
 * Brazilian Portuguese and Canadian French; anything else falls back to the system font.
 */
export const inter = localFont({
  src: "./fonts/inter/Inter-Variable-Latin.woff2",
  variable: "--font-inter",
  weight: "400 600",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: "Arial",
});
/** IBM Plex Mono: machine values (ids, versions, commands, tokens, codes, badges). */
export const plexMono = localFont({
  src: "./fonts/ibm-plex-mono/IBMPlexMono-Var-Roman.woff2",
  variable: "--font-plex-mono",
  weight: "400 600",
  display: "swap",
});
