import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth-shell/AuthShell";
import { currentPath, requestChoosableLocales } from "@/i18n/server";

/**
 * The reset pages' frame (194): the auth shell (157), a heading, a line under it, sign-in's link.
 * A function the page awaits, not a component: what it reads is read before rendering.
 */
export const resetShell = async ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) => {
  const t = await getTranslations("auth.forgot");
  return (
    <AuthShell here={await currentPath()} languages={await requestChoosableLocales()}>
      <div className="grid gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">{title}</h1>
        {subtitle ? <div className="grid gap-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {children}
      <p className="text-sm text-muted">
        <a href="/sign-in" className="text-link underline-offset-2 hover:underline">
          {t("backToSignIn")}
        </a>
      </p>
    </AuthShell>
  );
};
