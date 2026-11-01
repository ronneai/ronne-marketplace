"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { SetupForm } from "./SetupForm";
import type { SetupPageProps } from "./types";

/**
 * The web setup (feature 036): the form and the notice, inside the auth shell (157), which brings
 * the logo, the language menu and the page's `main`. The notice says who can set it up: whoever has
 * the setup code (161). Once the wizard's install finishes, the sentence that says the instance
 * isn't set up and the notice go (#148).
 */
export const SetupPage = ({ page }: { page: SetupPageProps }) => {
  const t = useTranslations("admin.setup.page");
  const [done, setDone] = useState(false);
  return (
    <>
      <div className="grid gap-6">
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
        <SetupForm page={page} onDone={() => setDone(true)} />
      </div>
      {done ? null : (
        <Notice kind="info" title={t("warnTitle")}>
          {t("warnBody")}
        </Notice>
      )}
    </>
  );
};
