import { formatItemName, GLOBAL_WORKSPACE } from "@ronneai/core";
import { installsIn, RENDERERS } from "@ronneai/core/render";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Badge } from "@/components/ui/Badge";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { LocalTime } from "@/components/ui/LocalTime";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";
import { ItemPlace } from "./ItemPlace";

/** An item's page (feature 018). */
/**
 * An item's page: `/items/<scope>/<name>` in `global`, `/workspaces/<workspace>/items/<scope>/<name>`
 * elsewhere (118), like its API path.
 */
export const itemPath = (item: { workspace?: string | null; scope: string; name: string }) => {
  const path = `/items/${encodeURIComponent(item.scope)}/${encodeURIComponent(item.name)}`;
  return !item.workspace || item.workspace === GLOBAL_WORKSPACE
    ? path
    : `/workspaces/${encodeURIComponent(item.workspace)}${path}`;
};

/**
 * One published item, as the catalogue and the home page list it (feature 018): its name, listed
 * version, type, what it can do, the AI tools it works in (026), how many times it's been installed
 * (its download count, on every card since 2026-10-02, owner) and whether it's deprecated, with the command to install
 * it. Its workspace and scope are said under its name (115), the workspace's page a link away; a
 * private workspace's with a lock (093). Outside `global` its full name names the workspace (118).
 */
export const ItemCard = ({
  entry,
  heading: Heading = "h2",
  favorited,
}: {
  entry: CatalogueEntry;
  heading?: "h2" | "h3";
  /** Whether the person has favorited it (125); without it the card has no star. */
  favorited?: boolean;
}) => {
  const t = useTranslations("catalogue.card");
  const name = formatItemName(entry);
  const tools = RENDERERS.filter((r) => installsIn(entry.support[r.id])).map((r) => r.name);
  // The line under the card, its parts told apart by a dot: keywords, when, where it works, installs.
  const details = [
    ...entry.keywords.map((keyword) => ({ id: `#${keyword}`, text: <>#{keyword}</> })),
    {
      id: "published",
      text: t.rich("published", {
        date: () => <LocalTime value={entry.publishedAt} precision="day" />,
      }),
    },
    {
      id: "works-in",
      text: tools.length ? t("worksIn", { tools: tools.join(", ") }) : t("worksInNone"),
    },
    { id: "installs", text: t("installs", { count: entry.downloadCount }) },
  ];
  return (
    <article className="grid grid-cols-1 gap-2 rounded-panel border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="min-w-0 break-all">
          <Link
            href={itemPath(entry)}
            className="font-mono text-[15px] font-semibold text-fg hover:underline"
          >
            {name}
          </Link>
        </Heading>
        {/* biome-ignore lint/plugin: a version number, the same in every language */}
        <span className="font-mono text-xs text-muted">v{entry.version}</span>
        <TypeBadge type={entry.type} />
        {entry.risky ? <Badge tone="warning">{t("risk")}</Badge> : null}
        {entry.deprecatedMessage ? <Badge tone="warning">{t("deprecated")}</Badge> : null}
        {entry.installable ? null : <Badge tone="error">{t("notInstallable")}</Badge>}
        {favorited === undefined ? null : (
          <span className="ml-auto">
            <FavoriteButton itemId={entry.id} name={name} favorited={favorited} />
          </span>
        )}
      </div>
      <ItemPlace
        workspace={entry.workspace}
        scope={entry.scope}
        privateWorkspace={entry.privateWorkspace}
        personalWorkspace={entry.personalWorkspace}
      />
      <p className="text-sm text-fg">{entry.description || t("noDescription")}</p>
      {entry.deprecatedMessage ? (
        <p className="text-xs text-warning-text">
          {t("deprecatedNote", { message: entry.deprecatedMessage })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
        <p className="font-mono text-xs text-muted">
          {details.map((part, index) => (
            <Fragment key={part.id}>
              {index ? " · " : null}
              {part.text}
            </Fragment>
          ))}
        </p>
        {entry.installable ? (
          <div className="w-full sm:w-auto">
            <CopyableCommand command={`rmk install ${name}`} />
          </div>
        ) : null}
      </div>
    </article>
  );
};
