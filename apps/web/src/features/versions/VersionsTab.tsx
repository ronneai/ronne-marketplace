import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { itemPath } from "@/components/catalogue/ItemCard";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { useBytes } from "@/i18n/bytes";
import type { VersionsPage as Page } from "@/server/domains/items/actions/versions";
import { TagControls, VersionControls, type VersionReach } from "./VersionControls";

/**
 * An item's versions (feature 016), the item page's Versions tab (018): its tags, and every version
 * with when and by whom it was published, its size and sha256, and any deprecation or yank. Each
 * version links to the item page showing it. Moderators and root get the actions.
 */
export const VersionsTab = ({
  page,
  usage = null,
}: {
  page: Page;
  /** Runs and installs per version over 30 days, when the item has enough usage to show (047). */
  usage?: Record<string, VersionReach> | null;
}) => {
  const t = useTranslations("author.versions");
  const format = useFormatter();
  const bytes = useBytes();
  const count = (n: number | undefined) => (n ? format.number(n) : "–");
  const itemRef = {
    workspace: page.item.workspace,
    scope: page.item.scope.name,
    name: page.item.name,
  };
  const choices = page.versions.map((v) => ({ version: v.version, yanked: v.yankedAt !== null }));
  const yanked = new Set(choices.filter((v) => v.yanked).map((v) => v.version));
  const hasLatest = page.tags.some((tag) => tag.tag === "latest");
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted">{t("intro")}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Help id="tag" />
        <Help id="deprecate-yank" />
      </div>

      <Panel className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">{t("tags")}</h2>
          {page.canManage ? <TagControls itemRef={itemRef} tag="" versions={choices} /> : null}
        </div>
        {!hasLatest && page.versions.length > 0 ? (
          <p className="text-sm text-warning-text">{t("noLatest")}</p>
        ) : null}
        {page.tags.length === 0 ? (
          <p className="text-sm text-muted">{t("noTags")}</p>
        ) : (
          <ul className="grid gap-1">
            {page.tags.map((tag) => (
              <li key={tag.tag} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-sm text-fg">
                    {tag.tag} → {tag.version}
                  </span>
                  {yanked.has(tag.version) ? <Badge tone="error">{t("yanked")}</Badge> : null}
                </span>
                {page.canManage ? (
                  <TagControls
                    itemRef={itemRef}
                    tag={tag.tag}
                    versions={choices}
                    current={tag.version}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Table>
        <thead>
          <tr>
            <Th>{t("version")}</Th>
            <Th>{t("published")}</Th>
            <Th>{t("size")}</Th>
            {/* biome-ignore lint/plugin: the hash's name, the same in every language */}
            <Th>sha256</Th>
            {usage ? (
              <>
                <Th>{t("runs")}</Th>
                <Th>{t("installs")}</Th>
              </>
            ) : null}
            {page.canManage ? <Th>{t("actions")}</Th> : null}
          </tr>
        </thead>
        <tbody>
          {page.versions.map((v) => (
            <tr key={v.id}>
              <Td>
                <div className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`${itemPath(itemRef)}?version=${encodeURIComponent(v.version)}`}
                      className="font-mono text-sm font-semibold text-fg underline-offset-2 hover:underline"
                    >
                      {v.version}
                    </Link>
                    {v.tags.map((tag) => (
                      <Badge key={tag} tone="accent">
                        {tag}
                      </Badge>
                    ))}
                    {v.deprecatedMessage ? <Badge tone="warning">{t("deprecated")}</Badge> : null}
                    {v.yankedAt ? <Badge tone="error">{t("yanked")}</Badge> : null}
                  </span>
                  {v.deprecatedMessage ? (
                    <span className="text-xs text-warning-text">{v.deprecatedMessage}</span>
                  ) : null}
                  {v.yankedAt ? (
                    <span className="text-xs text-error-text">
                      {t.rich("yankedAt", {
                        reason: v.yankReason ?? "",
                        date: () => (v.yankedAt ? <LocalTime value={v.yankedAt} /> : null),
                      })}
                    </span>
                  ) : null}
                </div>
              </Td>
              <Td className="text-xs text-muted">
                <LocalTime value={v.publishedAt} className="font-mono" />
                <br />
                {v.publishedByName ? t("by", { name: v.publishedByName }) : t("formerUser")}
              </Td>
              <Td className="font-mono text-xs">{bytes(v.size)}</Td>
              <Td className="font-mono text-xs" title={v.sha256}>
                {v.sha256.slice(0, 12)}…
              </Td>
              {usage ? (
                <>
                  <Td className="font-mono text-xs">{count(usage[v.version]?.runs)}</Td>
                  <Td className="font-mono text-xs">{count(usage[v.version]?.installs)}</Td>
                </>
              ) : null}
              {page.canManage ? (
                <Td>
                  <VersionControls
                    itemRef={itemRef}
                    version={v.version}
                    deprecated={v.deprecatedMessage !== null}
                    yanked={v.yankedAt !== null}
                    reach={usage ? (usage[v.version] ?? { runs: 0, installs: 0 }) : null}
                  />
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="text-xs text-muted">
        <Link href="/reviews?tab=decided" className="underline underline-offset-2">
          {t("fromReviews")}
        </Link>
      </p>
    </div>
  );
};
