import { useTranslations } from "next-intl";

/** The most a count shows; more reads "99+" (158). */
const MAX_SHOWN = 99;

/** A count next to a nav item or on the Menu button: how many are waiting. */
export const NavCount = ({ count }: { count: number }) => {
  const t = useTranslations("shell.count");
  const shown = count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-strong px-1.5 text-xs leading-none font-semibold tabular-nums text-on-accent">
      {shown}
      <span className="sr-only"> {t("waiting")}</span>
    </span>
  );
};
