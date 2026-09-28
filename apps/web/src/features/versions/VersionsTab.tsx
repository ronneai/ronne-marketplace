import { formatBytes } from "@ronneai/core";
import Link from "next/link";
import { itemPath } from "@/components/catalogue/ItemCard";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { utcMinute } from "@/components/ui/time";
import type { VersionsPage as Page } from "@/server/domains/items/actions/versions";
import { TagControls, VersionControls } from "./VersionControls";

/**
 * An item's versions (feature 016), the item page's Versions tab (018): its tags, and every version
 * with when and by whom it was published, its size and sha256, and any deprecation or yank. Each
 * version links to the item page showing it. Moderators and root get the actions.
 */
export const VersionsTab = ({ page }: { page: Page }) => {
  const itemRef = { scope: page.item.scope.name, name: page.item.name };
  const choices = page.versions.map((v) => ({ version: v.version, yanked: v.yankedAt !== null }));
  const yanked = new Set(choices.filter((v) => v.yanked).map((v) => v.version));
  const hasLatest = page.tags.some((tag) => tag.tag === "latest");
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted">
        Versions never change once published. Tags point installs at them; deprecating warns, and
        yanking stops new installs.
      </p>

      <Panel className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Tags</h2>
          {page.canManage ? <TagControls itemRef={itemRef} tag="" versions={choices} /> : null}
        </div>
        {!hasLatest && page.versions.length > 0 ? (
          <p className="text-sm text-warning-text">
            No latest: this item has no installable stable version.
          </p>
        ) : null}
        {page.tags.length === 0 ? (
          <p className="text-sm text-muted">No tags: nothing installs without a version.</p>
        ) : (
          <ul className="grid gap-1">
            {page.tags.map((tag) => (
              <li key={tag.tag} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-sm text-fg">
                    {tag.tag} → {tag.version}
                  </span>
                  {yanked.has(tag.version) ? <Badge tone="error">yanked</Badge> : null}
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
            <Th>Version</Th>
            <Th>Published</Th>
            <Th>Size</Th>
            <Th>sha256</Th>
            {page.canManage ? <Th>Actions</Th> : null}
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
                    {v.deprecatedMessage ? <Badge tone="warning">deprecated</Badge> : null}
                    {v.yankedAt ? <Badge tone="error">yanked</Badge> : null}
                  </span>
                  {v.deprecatedMessage ? (
                    <span className="text-xs text-warning-text">{v.deprecatedMessage}</span>
                  ) : null}
                  {v.yankedAt ? (
                    <span className="text-xs text-error-text">
                      Yanked {utcMinute(v.yankedAt)}: {v.yankReason}
                    </span>
                  ) : null}
                </div>
              </Td>
              <Td className="text-xs text-muted">
                <span className="font-mono">{utcMinute(v.publishedAt)}</span>
                <br />
                by {v.publishedByName ?? "a former user"}
              </Td>
              <Td className="font-mono text-xs">{formatBytes(v.size)}</Td>
              <Td className="font-mono text-xs" title={v.sha256}>
                {v.sha256.slice(0, 12)}…
              </Td>
              {page.canManage ? (
                <Td>
                  <VersionControls
                    itemRef={itemRef}
                    version={v.version}
                    deprecated={v.deprecatedMessage !== null}
                    yanked={v.yankedAt !== null}
                  />
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="text-xs text-muted">
        <Link href="/reviews?tab=decided" className="underline underline-offset-2">
          Releases come from approved submissions.
        </Link>
      </p>
    </div>
  );
};
