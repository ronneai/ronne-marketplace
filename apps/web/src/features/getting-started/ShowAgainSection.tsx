import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/Button";
import { showGettingStartedFromForm } from "./actions";

/**
 * Account's Getting started (feature 126): brings the checklist back on Home after it was hidden
 * or finished. A plain form, so it works without JavaScript; it ends on Home, where it shows.
 */
export const ShowAgainSection = () => {
  const t = useTranslations("account.gettingStarted");
  return (
    <section aria-labelledby="getting-started-title" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="getting-started-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="text-sm text-muted">{t("description")}</p>
      </div>
      <form action={showGettingStartedFromForm}>
        <button type="submit" className={buttonClasses("secondary")}>
          {t("show")}
        </button>
      </form>
    </section>
  );
};
