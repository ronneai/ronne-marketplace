import { ShieldCheck, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DOCS_URL } from "@/components/help/topics";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { LanguageSwitch } from "@/i18n/LanguageSwitch";
import background from "./signin-bg.jpg";

/**
 * The skeleton of the pages before sign-in (feature 157, from the sign-in mocks): a brand panel
 * beside the page's own content on wide screens, the content alone on phones. Sign-in is the first
 * page in it; the second step and the setup wizard can move in without a new layout. The content is
 * `children`, centred in a column of `max-w-md` (`wide` makes it `max-w-xl`, for a longer page).
 */
export const AuthShell = ({
  children,
  here,
  wide = false,
}: {
  children: ReactNode;
  /** This page's path and query, for the language switch to come back to (129). */
  here?: string;
  wide?: boolean;
}) => {
  const t = useTranslations("common.authShell");
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <BrandPanel />
      <div className="flex min-w-0 flex-col bg-canvas px-4 py-6 sm:px-10 lg:px-14">
        <header className="flex justify-end border-b border-hairline pb-4">
          <LanguageSwitch here={here} />
        </header>
        <main
          className={`mx-auto my-auto grid w-full gap-6 py-8 ${wide ? "max-w-xl" : "max-w-md"}`}
        >
          <BrandLogo height={40} className="text-fg" />
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-hairline pt-4 text-sm text-muted">
          <span>{t("openSource")}</span>
          <NewTabLink
            href={DOCS_URL}
            className="touch-hit text-link underline underline-offset-2 hover:no-underline"
          >
            {t("docs")}
          </NewTabLink>
        </footer>
      </div>
    </div>
  );
};

/**
 * Always dark, in both themes: the `code-bg` navy under the brand's background (a static import,
 * so it is served from `/_next/static`, which the sign-in guard leaves open). The image is
 * decoration, so it has no text; the flat navy veil keeps the words on it readable.
 */
const BrandPanel = () => {
  const t = useTranslations("common.authShell");
  const features = [
    { icon: ShieldCheck, title: t("reviewedTitle"), body: t("reviewedBody") },
    { icon: Terminal, title: t("installTitle"), body: t("installBody") },
  ];
  return (
    <aside className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-code-bg p-14 text-on-accent lg:flex">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${background.src})` }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-code-bg/40" />
      <div className="relative grid gap-1">
        <BrandLogo height={40} className="text-on-accent" />
        <p className="font-mono text-xs tracking-wider text-on-accent/60 uppercase">
          {t("eyebrow")}
        </p>
      </div>
      <div className="relative grid max-w-xl gap-5">
        <h2 className="text-4xl leading-tight font-semibold tracking-[-0.02em] xl:text-5xl">
          {t("headline")}
        </h2>
        <p className="text-lg text-on-accent/75">{t("lead")}</p>
      </div>
      <ul className="relative grid grid-cols-2 gap-6 border-t border-on-accent/15 pt-6">
        {features.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <span className="rounded-control border border-on-accent/15 p-2 text-accent">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="grid gap-0.5">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-on-accent/60">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
};
