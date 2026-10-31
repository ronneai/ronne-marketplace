import { formatItemName, GLOBAL_WORKSPACE } from "@ronneai/core";
import { installsIn, RENDERERS } from "@ronneai/core/render";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Badge } from "@/components/ui/Badge";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { CopyIconButton } from "@/components/ui/CopyIconButton";
import { cn } from "@/components/ui/cn";
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
  compact = false,
}: {
  entry: CatalogueEntry;
  heading?: "h2" | "h3";
  /** Whether the person has favorited it (125); without it the card has no star. */
  favorited?: boolean;
  /**
   * A short card for a grid (Home's lists): the description cut at two lines with an ellipsis, the keywords and
   * the tools left to the item's page, the install line under it. Same facts, less width.
   */
  compact?: boolean;
}) => {
  const t = useTranslations("catalogue.card");
  const place = useTranslations("catalogue.place");
  const name = formatItemName(entry);
  const tools = RENDERERS.filter((r) => installsIn(entry.support[r.id])).map((r) => r.name);
  const published = t.rich("published", {
    date: () => <LocalTime value={entry.publishedAt} precision="day" />,
  });
  // The line under the card, its parts told apart by a dot: keywords, when, where it works, installs.
  const details = [
    ...entry.keywords.map((keyword) => ({ id: `#${keyword}`, text: <>#{keyword}</> })),
    { id: "published", text: published },
    {
      id: "works-in",
      text: tools.length ? t("worksIn", { tools: tools.join(", ") }) : t("worksInNone"),
    },
    { id: "installs", text: t("installs", { count: entry.downloadCount }) },
  ];
  const meta = (
    <>
      {/* biome-ignore lint/plugin: a version number, the same in every language */}
      <span className="type-version text-muted">v{entry.version}</span>
      <TypeBadge type={entry.type} />
      {entry.risky ? <Badge tone="warning">{t("risk")}</Badge> : null}
      {entry.deprecatedMessage ? <Badge tone="warning">{t("deprecated")}</Badge> : null}
      {entry.installable ? null : <Badge tone="error">{t("notInstallable")}</Badge>}
    </>
  );
  return (
    <article
      className={cn(
        "rounded-panel border border-hairline bg-surface p-4",
        compact ? "relative flex h-full flex-col gap-2" : "grid grid-cols-1 gap-2",
      )}
    >
      {compact ? (
        <>
          {/* The name in at most two lines (the whole of it on hover), so cards keep their shape. */}
          <Heading className="min-w-0 pr-9 break-words">
            <Link
              href={itemPath(entry)}
              title={name}
              className="type-id line-clamp-2 text-fg hover:underline"
            >
              {name}
            </Link>
          </Heading>
          {/* The version, type and flags; the date is in the footer, so a risk badge never pushes it down. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {meta}
            {/* The full name says the workspace and the scope; only a privacy cue is left to say. */}
            {entry.personalWorkspace ? (
              <span title={place("personalTitle")} className="text-xs text-muted">
                {place("personal")}
              </span>
            ) : entry.privateWorkspace ? (
              <span
                title={place("privateTitle", { workspace: entry.workspace })}
                className="text-xs text-muted"
              >
                <Lock aria-hidden="true" className="mr-0.5 inline size-3 align-[-1px]" />
                {place("private")}
              </span>
            ) : null}
          </div>
          {favorited === undefined ? null : (
            <span className="absolute top-3 right-3">
              <FavoriteButton itemId={entry.id} name={name} favorited={favorited} />
            </span>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="min-w-0 break-all">
            <Link href={itemPath(entry)} className="type-id text-fg hover:underline">
              {name}
            </Link>
          </Heading>
          {meta}
          {favorited === undefined ? null : (
            <span className="ml-auto">
              <FavoriteButton itemId={entry.id} name={name} favorited={favorited} />
            </span>
          )}
        </div>
      )}
      {compact ? null : (
        <ItemPlace
          workspace={entry.workspace}
          scope={entry.scope}
          privateWorkspace={entry.privateWorkspace}
          personalWorkspace={entry.personalWorkspace}
        />
      )}
      <p className={cn("text-sm text-fg", compact && "line-clamp-2 min-h-10")}>
        {entry.description || t("noDescription")}
      </p>
      {entry.deprecatedMessage ? (
        <p className="text-xs text-warning-text">
          {t("deprecatedNote", { message: entry.deprecatedMessage })}
        </p>
      ) : null}
      {compact ? (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline pt-2">
          <p className="type-meta text-muted">
            {t("installs", { count: entry.downloadCount })}
            {" · "}
            <span className="sr-only">{t("publishedLabel")} </span>
            <LocalTime value={entry.publishedAt} precision="day" />
          </p>
          {entry.installable ? (
            <CopyIconButton command={`rmk install ${name}`} label={t("copyInstall", { name })} />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
          <p className="type-meta text-muted">
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
      )}
    </article>
  );
};
