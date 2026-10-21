import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Any address with nothing behind it, or that the person may not see (feature 129: in the
 * person's language). It stands alone, without the app frame, so it reads the same signed in or out.
 */
const NotFound = () => {
  const t = useTranslations("common.notFound");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4 py-16">
      <BrandLogo height={28} />
      <h1 className="text-2xl font-semibold text-fg">{t("title")}</h1>
      <p className="text-sm text-muted">{t("message")}</p>
      <Link href="/" className={buttonClasses("primary")}>
        {t("home")}
      </Link>
    </main>
  );
};

export default NotFound;
