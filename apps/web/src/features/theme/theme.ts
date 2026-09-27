/** Theme choice (feature 032), stored in a cookie so the server renders the right theme. */
export const THEME_COOKIE = "ronne-theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** A missing or unknown cookie value means "system" (follow the OS). */
export function parseTheme(value: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}

export const themeCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: false,
};
