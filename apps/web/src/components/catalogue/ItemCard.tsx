import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";

/** An item's page (feature 018). */
export const itemPath = (item: { scope: string; name: string }) =>
  `/items/${encodeURIComponent(item.scope)}/${encodeURIComponent(item.name)}`;

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * One published item, as the catalogue and the home page list it (feature 018): its name, listed
 * version, type, what it can do and whether it's deprecated, with the command to install it.
 */
export const ItemCard = ({
  entry,
  heading: Heading = "h2",
  showDownloads = false,
}: {
  entry: CatalogueEntry;
  heading?: "h2" | "h3";
  showDownloads?: boolean;
}) => {
  const name = `@${entry.scope}/${entry.name}`;
  const details = [
    ...entry.keywords.map((keyword) => `#${keyword}`),
    `published ${day(entry.publishedAt)}`,
    ...(showDownloads
      ? [`${entry.downloadCount} download${entry.downloadCount === 1 ? "" : "s"}`]
      : []),
  ];
  return (
    <article className="grid gap-2 rounded-panel border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="min-w-0 break-all">
          <Link
            href={itemPath(entry)}
            className="font-mono text-[15px] font-semibold text-fg hover:underline"
          >
            {name}
          </Link>
        </Heading>
        <span className="font-mono text-xs text-muted">v{entry.version}</span>
        <Badge>{entry.type}</Badge>
        {entry.risky ? <Badge tone="warning">⚠ risk</Badge> : null}
        {entry.deprecatedMessage ? <Badge tone="warning">deprecated</Badge> : null}
        {entry.installable ? null : <Badge tone="error">no installable version</Badge>}
      </div>
      <p className="text-sm text-fg">{entry.description || "No description."}</p>
      {entry.deprecatedMessage ? (
        <p className="text-xs text-warning-text">Deprecated: {entry.deprecatedMessage}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
        <p className="font-mono text-xs text-muted">{details.join(" · ")}</p>
        {entry.installable ? (
          <div className="w-full sm:w-auto">
            <CopyableCommand command={`rmk install ${name}`} />
          </div>
        ) : null}
      </div>
    </article>
  );
};
