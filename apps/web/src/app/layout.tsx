import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { FlashToast } from "@/components/ui/FlashToast";
import { Toaster } from "@/components/ui/Toaster";
import { DatabaseUnavailable } from "@/features/setup/DatabaseUnavailable";
import { parseTheme, THEME_COOKIE } from "@/features/theme/theme";
import { requestLocale } from "@/i18n/server";
import { loadConfig } from "@/server/config";
import { redactDatabaseUrl } from "@/server/db/url";
import { PATH_HEADER, SETUP_PATH } from "@/server/domains/identity/models/route-guard";
import { getSetupState } from "@/server/setup/state";
import { manrope, plexMono } from "./fonts";
import { viewportFor } from "./viewport";
import "./globals.css";

/** The product name stays as it is; the description is in the person's language (133). */
export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("common.metadata");
  return { title: "Ronne AI Marketplace", description: t("description") };
};

/** The viewport and the browser bar's colour, from the theme cookie (feature 065). */
export const generateViewport = async (): Promise<Viewport> =>
  viewportFor(parseTheme((await cookies()).get(THEME_COOKIE)?.value));

const RootLayout = async ({ children }: { children: ReactNode }) => {
  // Settings are read per request, not at build time, so a finished setup shows at once.
  await connection();
  const config = loadConfig();
  const state = await getSetupState(config);
  // Until the instance is ready, the setup is the only page (feature 036); a set-up instance
  // whose database doesn't answer shows what's wrong instead, never the setup.
  if (state !== "ready" && state !== "unavailable") {
    const path = (await headers()).get(PATH_HEADER) ?? "";
    if (path !== SETUP_PATH && !path.startsWith(`${SETUP_PATH}?`)) redirect(SETUP_PATH);
  }
  // Rendered on the server from the cookie, so the page never flashes the wrong theme.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const locale = await requestLocale();
  return (
    <html lang={locale} data-theme={theme} className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="bg-canvas text-fg antialiased">
        {/* The language and its messages come from src/i18n/request.ts (feature 129). */}
        <NextIntlClientProvider>
          {state === "unavailable" ? (
            <DatabaseUnavailable database={redactDatabaseUrl(config.databaseUrl as string)} />
          ) : (
            children
          )}
          {/* Every page has the toast region, empty until something is said (feature 138). */}
          <Toaster />
          {state === "ready" ? <FlashToast /> : null}
        </NextIntlClientProvider>
      </body>
    </html>
  );
};

export default RootLayout;
