import localFont from "next/font/local";

// Self-hosted brand fonts (feature 032); see fonts/README.md for sources and licenses.
// The design system uses weights 500 and 600 only.

/** Manrope: all human-facing text. */
export const manrope = localFont({
  src: "./fonts/manrope/Manrope-Variable.ttf",
  variable: "--font-manrope",
  weight: "500 600",
  display: "swap",
});

/** IBM Plex Mono: machine values (ids, versions, commands, tokens, codes, badges). */
export const plexMono = localFont({
  src: "./fonts/ibm-plex-mono/IBMPlexMono-Var-Roman.woff2",
  variable: "--font-plex-mono",
  weight: "500 600",
  display: "swap",
});
