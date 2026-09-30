import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { DatabaseUnavailable } from "@/features/setup/DatabaseUnavailable";
import { parseTheme, THEME_COOKIE } from "@/features/theme/theme";
import { loadConfig } from "@/server/config";
import { redactDatabaseUrl } from "@/server/db/url";
import { PATH_HEADER, SETUP_PATH } from "@/server/domains/identity/models/route-guard";
import { getSetupState } from "@/server/setup/state";
import { manrope, plexMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ronne AI Marketplace",
  description: "A self-hosted, curated registry of AI capabilities.",
};

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
  return (
    <html lang="en" data-theme={theme} className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="bg-canvas text-fg antialiased">
        {state === "unavailable" ? (
          <DatabaseUnavailable database={redactDatabaseUrl(config.databaseUrl as string)} />
        ) : (
          children
        )}
      </body>
    </html>
  );
};

export default RootLayout;
