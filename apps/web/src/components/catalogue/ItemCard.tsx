import { formatItemName, GLOBAL_WORKSPACE } from "@ronneai/core";
import { installsIn, RENDERERS } from "@ronneai/core/render";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { LocalTime } from "@/components/ui/LocalTime";
import { TypeBadge } from "@/components/ui/TypeBadge";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";
import { WorkspaceLabel } from "./WorkspaceLabel";

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
 * it. An item in a workspace other than `global` names it before its own name, quietly (090), and
 * a private one's says so with a lock (093).
 */
export const ItemCard = ({
  entry,
  heading: Heading = "h2",
}: {
  entry: CatalogueEntry;
  heading?: "h2" | "h3";
}) => {
  const name = formatItemName(entry);
  const tools = RENDERERS.filter((r) => installsIn(entry.support[r.id])).map((r) => r.name);
  const keywords = entry.keywords.map((keyword) => `#${keyword}`);
  const details = [
    tools.length ? `works in ${tools.join(", ")}` : "works in no built-in tool",
    `${entry.downloadCount.toLocaleString("en")} install${entry.downloadCount === 1 ? "" : "s"}`,
  ];
  return (
    <article className="grid grid-cols-1 gap-2 rounded-panel border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="min-w-0 break-all">
          <WorkspaceLabel
            workspace={entry.workspace}
            privateWorkspace={entry.privateWorkspace}
            className="font-mono text-[15px] text-muted"
          />
          <Link
            href={itemPath(entry)}
            className="font-mono text-[15px] font-semibold text-fg hover:underline"
          >
            {name}
          </Link>
        </Heading>
        <span className="font-mono text-xs text-muted">v{entry.version}</span>
        <TypeBadge type={entry.type} />
        {entry.risky ? <Badge tone="warning">⚠ risk</Badge> : null}
        {entry.deprecatedMessage ? <Badge tone="warning">deprecated</Badge> : null}
        {entry.installable ? null : <Badge tone="error">no installable version</Badge>}
      </div>
      <p className="text-sm text-fg">{entry.description || "No description."}</p>
      {entry.deprecatedMessage ? (
        <p className="text-xs text-warning-text">Deprecated: {entry.deprecatedMessage}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
        <p className="font-mono text-xs text-muted">
          {[...keywords, ""].join(" · ")}published{" "}
          <LocalTime value={entry.publishedAt} precision="day" /> · {details.join(" · ")}
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
