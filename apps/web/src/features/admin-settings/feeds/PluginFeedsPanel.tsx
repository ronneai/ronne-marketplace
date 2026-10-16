import { rendererById } from "@ronneai/core/render";
import { Help } from "@/components/help/Help";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { Table, Td, Th } from "@/components/ui/Table";
import type { FeedStatsRow } from "@/server/domains/feeds/actions/feeds";

const MIB = 1024 * 1024;

const size = (bytes: number) =>
  bytes >= MIB ? `${(bytes / MIB).toFixed(1)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;

const toolName = (tool: string) => rendererById(tool)?.name ?? tool;

/**
 * Admin › Settings › Plugin feeds (079): each tool's marketplace as last built in full, and a
 * warning when Claude Code's comes near the limits it reads a marketplace within.
 */
export const PluginFeedsPanel = ({ rows }: { rows: FeedStatsRow[] }) => {
  const near = rows.filter((row) => row.warnings.length > 0);
  return (
    <section aria-labelledby="plugin-feeds-title" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plugin-feeds-title" className="text-base font-semibold text-fg">
          Plugin feeds
        </h2>
        <Help id="plugin-feeds" />
      </div>
      <p className="text-sm text-muted">
        Each tool&apos;s marketplace as it was last built in full: Claude Code reads its own from
        this website; rmk feed build reads Codex&apos;s and Cursor&apos;s for the git mirror.
      </p>
      {near.map((row) => (
        <Notice
          key={row.tool}
          kind="warn"
          title={`${toolName(row.tool)}'s marketplace is near ${row.warnings.length > 1 ? "its limits" : row.warnings[0] === "size" ? "its size limit" : "its time limit"}.`}
        >
          {row.warnings.includes("size") ? (
            <p>
              Claude Code reads a marketplace of at most 5 MiB from an address. Past it, the
              marketplace stops loading; add the git mirror (rmk feed build) in Claude Code instead,
              which has no such limit.
            </p>
          ) : null}
          {row.warnings.includes("time") ? (
            <p>
              Claude Code waits 10 seconds for a marketplace. It&apos;s built once per change and
              then answered from memory, so only the first request after a release waits this long.
            </p>
          ) : null}
        </Notice>
      ))}
      <Table>
        <thead>
          <tr>
            <Th>Tool</Th>
            <Th>Size</Th>
            <Th>Plugins</Th>
            <Th>Build time</Th>
            <Th>Built</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tool, stats, warnings }) => (
            <tr key={tool}>
              <Td>{toolName(tool)}</Td>
              {stats ? (
                <>
                  <Td className={warnings.includes("size") ? "text-warning-text" : undefined}>
                    {size(stats.sizeBytes)}
                    {tool === "claude-code" ? <span className="text-muted"> of 5 MiB</span> : null}
                  </Td>
                  <Td>{stats.plugins.toLocaleString("en")}</Td>
                  <Td className={warnings.includes("time") ? "text-warning-text" : undefined}>
                    {(stats.buildMs / 1000).toFixed(1)} s
                  </Td>
                  <Td>
                    <LocalTime value={stats.builtAt} />
                  </Td>
                </>
              ) : (
                <Td colSpan={4} className="text-muted">
                  Not built yet: it&apos;s built the first time someone reads it.
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
};
