import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { localizedDocsHref } from "@/components/help/topics";
import type { Locale } from "@/server/domains/identity/models/locale";

/**
 * A link that opens in a new tab, such as the Documentation on the website (088): the page someone
 * was working on stays open. It says so with an icon, and in words to screen readers.
 */
export const NewTabLink = ({
  children,
  ...props
}: Omit<ComponentProps<"a">, "target" | "rel"> & { href: string }) => {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  return (
    <a
      {...props}
      href={localizedDocsHref(props.href, locale)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ExternalLink
        size={12}
        aria-hidden="true"
        className="ml-1 inline-block shrink-0 align-[-1px]"
      />
      <span className="sr-only"> {t("newTab")}</span>
    </a>
  );
};
