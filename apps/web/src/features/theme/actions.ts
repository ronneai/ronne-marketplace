"use server";

import { cookies } from "next/headers";
import { serverAction } from "@/server/http/server-action";
import { parseTheme, THEME_COOKIE, themeCookieOptions } from "./theme";

/** Remembers the theme choice. The next render (the layout) picks it up on the server. */
export const setTheme = serverAction(async (theme: string) => {
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), themeCookieOptions);
});

/** The same, from a form: the user menu's theme buttons submit `theme`. Works without JavaScript. */
export const setThemeFromForm = serverAction(async (form: FormData) => {
  await setTheme(String(form.get("theme") ?? ""));
});
