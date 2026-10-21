import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Any address with nothing behind it, or that the person may not see (feature 129: in the
 * person's language). It is a section, not a `<main>`: for an address inside the app (a `notFound()`
 * from a page) it renders in the app frame, which has its own `<main>`.
 */
const NotFound = () => {
  const t = useTranslations("common.notFound");
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto grid min-h-[70dvh] max-w-md content-center justify-items-start gap-4 px-4 py-16"
    >
      <BrandLogo height={28} />
      <h1 id="not-found-title" className="text-2xl font-semibold text-fg">
        {t("title")}
      </h1>
      <p className="text-sm text-muted">{t("message")}</p>
      <Link href="/" className={buttonClasses("primary")}>
        {t("home")}
      </Link>
    </section>
  );
};

export default NotFound;
