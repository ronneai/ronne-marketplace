import Link from "next/link";
import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { utcMinute } from "@/components/ui/time";
import type { ItemPage } from "@/server/domains/items/actions/versions";
import { ProposeButton } from "./ProposeButton";
import { ToolsPanel } from "./ToolsPanel";
import { ITEM_TABS, type ItemTab, itemTabHref, TAB_LABELS } from "./tabs";

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
  page: ItemPage;
  tab: ItemTab;
  children: ReactNode;
}) => {
  const ref = { scope: page.item.scope.name, name: page.item.name };
  const name = `@${ref.scope}/${ref.name}`;
  const { shown } = page;
  const other = shown.version !== page.listed;
  const keywords = Array.isArray(shown.manifest.keywords)
    ? shown.manifest.keywords.filter((k): k is string => typeof k === "string")
    : [];
  const license = text(shown.manifest.license);
  const description = text(shown.manifest.description) ?? page.item.description;
  return (
    <div className="grid grid-cols-1 gap-6">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-muted">
        <Link href="/catalogue" className="hover:text-fg hover:underline">
          Catalogue
        </Link>{" "}
        / <span className="text-fg">{name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold break-all text-fg">{name}</h1>
            <span className="font-mono text-sm text-muted">v{shown.version}</span>
            <Badge>{page.item.type}</Badge>
            {shown.tags.map((tag) => (
              <Badge key={tag} tone="accent">
                {tag}
              </Badge>
            ))}
            {shown.deprecatedMessage ? <Badge tone="warning">deprecated</Badge> : null}
            {shown.yankedAt ? <Badge tone="error">yanked</Badge> : null}
          </div>
          <p className="text-sm text-fg">{description || "No description."}</p>
          <p className="font-mono text-xs text-muted">
            {[
              license ? `license ${license}` : "no license given",
              ...keywords.map((k) => `#${k}`),
              `by ${page.ownerName ?? "a former user"}`,
              `published ${utcMinute(shown.publishedAt)}`,
            ].join(" · ")}
          </p>
        </div>
        <ProposeButton item={name} version={shown.version} />
      </header>

      {other ? (
        <Notice
          kind={shown.yankedAt ? "error" : shown.deprecatedMessage ? "warn" : "info"}
          title={`You're looking at ${shown.version}, not ${page.latest ? `latest (${page.latest})` : `the listed version (${page.listed})`}.`}
        >
          {shown.yankedAt
            ? `It was yanked: ${shown.yankReason}. New installs can't resolve it; projects that pin it keep working.`
            : shown.deprecatedMessage
              ? `It's deprecated: ${shown.deprecatedMessage}`
              : null}{" "}
          <Link
            href={itemTabHref(ref, tab === "versions" ? "readme" : tab)}
            className="underline underline-offset-2"
          >
            Show {page.latest ? "latest" : page.listed}
          </Link>
        </Notice>
      ) : null}

      <Panel className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Install</h2>
          <Help id="install" />
        </div>
        {page.installable ? (
          <>
            <CopyableCommand command={`rmk install ${name}`} />
            <CopyableCommand command={`rmk install ${name}@${shown.version}`} />
            {!other && shown.deprecatedMessage ? (
              <p className="text-xs text-warning-text">
                This version is deprecated: {shown.deprecatedMessage}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-error-text">
            Every version is yanked: there's nothing to install. Projects that pin one keep working.
          </p>
        )}
      </Panel>

      <ToolsPanel name={ref.name} type={page.item.type} manifest={shown.manifest} />

      <nav
        aria-label="Item"
        className="flex gap-1 overflow-x-auto border-b border-hairline [scrollbar-width:none]"
      >
        {ITEM_TABS.map((t) => (
          <Link
            key={t}
            href={itemTabHref(ref, t, other ? shown.version : null)}
            aria-current={t === tab ? "page" : undefined}
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 whitespace-nowrap text-sm text-muted hover:text-fg aria-[current=page]:border-accent-strong aria-[current=page]:font-semibold aria-[current=page]:text-fg"
          >
            {TAB_LABELS[t]}
            {t === "risks" && shown.riskFlags.length ? ` (${shown.riskFlags.length})` : ""}
          </Link>
        ))}
      </nav>
      <section aria-label={TAB_LABELS[tab]}>{children}</section>
    </div>
  );
};
