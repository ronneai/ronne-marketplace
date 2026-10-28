import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { LocalTime } from "@/components/ui/LocalTime";
import { Panel } from "@/components/ui/Panel";
import type { ItemHistoryEntry } from "@/server/domains/workspaces/services/item-moves";

/** A name in the monospace face, broken anywhere so a long one never widens the page. */
const mono = (chunks: React.ReactNode) => (
  <span className="font-mono text-xs text-fg [overflow-wrap:anywhere]">{chunks}</span>
);

/** Who made a change: by one person when nobody had to answer, else who asked and who approved. */
const useWho = () => {
  const t = useTranslations("item.history");
  return (entry: ItemHistoryEntry) => {
    if (entry.direct) return t("by", { name: entry.askedBy ?? t("formerUser") });
    if (entry.askedBy && entry.approvedBy)
      return t("askedApproved", { asked: entry.askedBy, approved: entry.approvedBy });
    if (entry.askedBy) return t("askedBy", { name: entry.askedBy });
    if (entry.approvedBy) return t("approvedBy", { name: entry.approvedBy });
    return null;
  };
};

/**
 * The item's History tab (134): its name now, then each change newest first, with when, from → to,
 * why and who. A name in a workspace the reader can't see is said to be one, never written out.
 */
export const HistoryTab = ({
  history,
}: {
  history: { current: string; entries: ItemHistoryEntry[] };
}) => {
  const t = useTranslations("item.history");
  const who = useWho();
  const name = (value: string | null) =>
    value ?? <span className="text-xs text-muted italic">{t("hidden")}</span>;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg">{t.rich("now", { name: history.current, mono })}</p>
        <Help id="item-history" />
      </div>
      {history.entries.length === 0 ? (
        <Panel className="text-sm text-muted">{t("none")}</Panel>
      ) : (
        <ol aria-label={t("title")} className="grid gap-2">
          {history.entries.map((entry) => {
            const by = who(entry);
            return (
              <li key={entry.id}>
                <Panel className="grid gap-1 text-sm">
                  <p className="font-semibold text-fg">{t("reason", { reason: entry.reason })}</p>
                  <p className="grid gap-0.5 [overflow-wrap:anywhere]">
                    {entry.from && entry.to ? (
                      t.rich("from", { from: entry.from, to: entry.to, mono })
                    ) : (
                      <>
                        {entry.from ? mono(entry.from) : name(null)} →{" "}
                        {entry.to ? mono(entry.to) : name(null)}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    <LocalTime value={entry.at} />
                    {by ? <> · {by}</> : null}
                  </p>
                </Panel>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
