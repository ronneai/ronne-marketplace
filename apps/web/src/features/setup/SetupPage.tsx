"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { SetupForm } from "./SetupForm";
import type { SetupPageProps } from "./types";

/**
 * The web setup (feature 036): the form and the warning. Nothing about the terminal here. Once the
 * wizard's install finishes, the sentence that says the instance isn't set up and the warning go
 * (#148): the instance is no longer open to whoever reaches the page.
 */
export const SetupPage = ({
  page,
  languageSwitch,
}: {
  page: SetupPageProps;
  /** The language links (feature 129), rendered by the server page. */
  languageSwitch?: ReactNode;
}) => {
  const t = useTranslations("admin.setup.page");
  const [done, setDone] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      {languageSwitch}
      <Panel padding="lg" className="grid gap-6">
        <div className="grid gap-3">
          <BrandLogo height={40} className="text-fg" />
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
              {t("title")}
            </h1>
            {done ? null : (
              <p className="text-sm text-muted">
                {page.state === "incomplete" ? t("incomplete") : t("notConfigured")}
              </p>
            )}
          </div>
        </div>
        <SetupForm page={page} onDone={() => setDone(true)} />
      </Panel>
      {done ? null : (
        <Notice kind="warn" title={t("warnTitle")}>
          {t("warnBody")}
        </Notice>
      )}
    </main>
  );
};
