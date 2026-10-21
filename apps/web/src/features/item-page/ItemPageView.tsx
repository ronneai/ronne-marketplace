import { formatItemName } from "@ronneai/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { ItemPlace } from "@/components/catalogue/ItemPlace";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { ScrollStrip } from "@/components/ui/ScrollStrip";
import { stripTab } from "@/components/ui/scroll-strip";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import { PinMenu } from "@/features/pins/PinMenu";
import type { PinTargetView } from "@/features/pins/types";
import type { ItemPage } from "@/server/domains/items/actions/versions";
import { ProposeButton } from "./ProposeButton";
import { ITEM_TABS, type ItemTab, itemTabHref } from "./tabs";

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/**
 * An item's page (feature 018): its header, how to install it, and its tabs, around the shown
 * version, `latest`'s unless `?version=` asks for another. Tabs are links, so each has its URL.
 */
export const ItemPageView = ({
  page,
  tab,
  children,
}: {
  /** `favorited`: whether the person has favorited the item; `pinTargets`: where they may pin it (125). Without them, no star or Pin menu. */
  page: ItemPage & { favorited?: boolean; pinTargets?: PinTargetView[] };
  tab: ItemTab;
  children: ReactNode;
}) => {
  const t = useTranslations("item");
  const ref = { workspace: page.item.workspace, scope: page.item.scope.name, name: page.item.name };
  const name = formatItemName(ref);
  const { shown } = page;
  const other = shown.version !== page.listed;
  const keywords = Array.isArray(shown.manifest.keywords)
    ? shown.manifest.keywords.filter((k): k is string => typeof k === "string")
    : [];
  const license = text(shown.manifest.license);
  const description = text(shown.manifest.description) ?? page.item.description;
  // The line under the name: license, keywords, owner, when; told apart by a dot.
  const meta = [
    { id: "license", text: license ? t("meta.license", { license }) : t("meta.noLicense") },
    ...keywords.map((keyword) => ({ id: `#${keyword}`, text: <>#{keyword}</> })),
    {
      id: "by",
      text: t("meta.by", { owner: page.ownerName ?? t("meta.formerUser") }),
    },
    {
      id: "published",
      text: t.rich("meta.published", { date: () => <LocalTime value={shown.publishedAt} /> }),
    },
  ];
  const kind = page.latest ? "latest" : "listed";
  return (
    <div className="grid grid-cols-1 gap-6">
      <nav aria-label={t("breadcrumb.label")} className="font-mono text-xs text-muted">
        <Link href="/catalogue" className="hover:text-fg hover:underline">
          {t("breadcrumb.catalogue")}
        </Link>{" "}
        / <span className="text-fg">{name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold break-all text-fg">{name}</h1>
            {/* biome-ignore lint/plugin: a version number, the same in every language */}
            <span className="font-mono text-sm text-muted">v{shown.version}</span>
            <TypeBadge type={page.item.type} />
            {page.item.privateWorkspace ? <Help id="private-item" iconOnly /> : null}
            {shown.tags.map((tag) => (
              <Badge key={tag} tone="accent">
                {tag}
              </Badge>
            ))}
            {shown.deprecatedMessage ? <Badge tone="warning">{t("badge.deprecated")}</Badge> : null}
            {shown.yankedAt ? <Badge tone="error">{t("badge.yanked")}</Badge> : null}
          </div>
          <ItemPlace
            workspace={page.item.workspace}
            scope={page.item.scope.name}
            privateWorkspace={page.item.privateWorkspace}
            personalWorkspace={page.item.personalWorkspace}
          />
          <p className="text-sm text-fg">{description || t("noDescription")}</p>
          <p className="font-mono text-xs text-muted">
            {meta.map((part, index) => (
              <Fragment key={part.id}>
                {index ? " · " : null}
                {part.text}
              </Fragment>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {page.favorited === undefined ? null : (
            <FavoriteButton itemId={page.item.id} name={name} favorited={page.favorited} />
          )}
          {page.pinTargets?.length ? (
            <PinMenu itemId={page.item.id} name={name} targets={page.pinTargets} />
          ) : null}
          <ProposeButton item={name} version={shown.version} />
        </div>
      </header>

      {other ? (
        <Notice
          kind={shown.yankedAt ? "error" : shown.deprecatedMessage ? "warn" : "info"}
          title={t("notice.title", {
            kind,
            version: shown.version,
            target: page.latest ?? page.listed,
          })}
        >
          {shown.yankedAt
            ? t("notice.yanked", { reason: shown.yankReason ?? "" })
            : shown.deprecatedMessage
              ? t("notice.deprecated", { message: shown.deprecatedMessage })
              : null}{" "}
          <Link
            href={itemTabHref(ref, tab === "versions" ? "overview" : tab)}
            className="underline underline-offset-2"
          >
            {t("notice.show", { kind, version: page.listed })}
          </Link>
        </Notice>
      ) : null}

      <ScrollStrip label={t("tabs.label")} className="gap-1 border-b border-hairline">
        {ITEM_TABS.map((id) => (
          <Link
            key={id}
            href={itemTabHref(ref, id, other ? shown.version : null)}
            aria-current={id === tab ? "page" : undefined}
            className={`${stripTab} -mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg aria-[current=page]:border-accent-strong aria-[current=page]:font-semibold aria-[current=page]:text-fg`}
          >
            {id === "risks" && shown.riskFlags.length
              ? t("tabs.risksCount", { count: shown.riskFlags.length })
              : t(`tabs.${id}`)}
          </Link>
        ))}
      </ScrollStrip>
      <section aria-label={t(`tabs.${tab}`)}>{children}</section>
    </div>
  );
};
