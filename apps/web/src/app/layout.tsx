import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SetupRequired } from "@/features/setup-required/SetupRequired";
import { parseTheme, THEME_COOKIE } from "@/features/theme/theme";
import { isConfigured, loadConfig } from "@/server/config";
import { manrope, plexMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ronne AI Marketplace",
  description: "A self-hosted, curated registry of AI capabilities.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Settings are read per request, not at build time, so a finished setup shows after a restart.
  await connection();
  const configured = isConfigured(loadConfig());
  // Rendered on the server from the cookie, so the page never flashes the wrong theme.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme} className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="bg-canvas text-fg antialiased">
        {configured ? children : <SetupRequired />}
      </body>
    </html>
  );
}
