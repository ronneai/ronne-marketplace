"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { buttonClasses } from "@/components/ui/Button";

/**
 * What a page shows when it fails while rendering (feature 129: in the person's language). The
 * reference is the request's digest, which finds the error in the server's log.
 */
const ErrorPage = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => {
  const t = useTranslations("common.error");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4 py-16">
      <BrandLogo height={28} />
      <h1 className="text-2xl font-semibold text-fg">{t("title")}</h1>
      <p className="text-sm text-muted">{t("message")}</p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted">{t("reference", { digest: error.digest })}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reset} className={buttonClasses("primary")}>
          {t("retry")}
        </button>
        <Link href="/" className={buttonClasses("secondary")}>
          {t("home")}
        </Link>
      </div>
    </main>
  );
};

export default ErrorPage;
