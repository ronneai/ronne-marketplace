import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SetupRequired } from "@/features/setup-required/SetupRequired";
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
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="bg-white text-neutral-900 antialiased">
        {configured ? children : <SetupRequired />}
      </body>
    </html>
  );
}
