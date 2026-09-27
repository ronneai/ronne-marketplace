/** Theme choice (feature 032), stored in a cookie so the server renders the right theme. */
export const THEME_COOKIE = "ronne-theme";
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * A missing or unknown cookie value means light, the default (owner decision, 2026-09-27: light
 * and dark only, no "follow the OS"). An old `system` cookie reads as light too.
 */
export const parseTheme = (value: string | undefined): Theme => {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "light";
};

export const themeCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: false,
};
