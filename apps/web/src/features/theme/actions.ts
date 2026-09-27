"use server";

import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, themeCookieOptions } from "./theme";

/** Remembers the theme choice. The next render (the layout) picks it up on the server. */
export const setTheme = async (theme: string) => {
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), themeCookieOptions);
};

/** The same, from a form: the user menu's theme buttons submit `theme`. Works without JavaScript. */
export const setThemeFromForm = async (form: FormData) => {
  await setTheme(String(form.get("theme") ?? ""));
};
