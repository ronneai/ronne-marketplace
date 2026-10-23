import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { useBytes } from "@/i18n/bytes";
import type { FileChange } from "@/server/domains/submissions/models/diff";

const STATUS_TONE = { added: "accent", removed: "error", changed: "muted" } as const;

const FileHeader = ({ path, children }: { path: string; children?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-canvas px-3 py-2">
    <span className="font-mono text-sm font-semibold text-fg">{path}</span>
    {children}
  </div>
);

const LAYOUT_PATH = ".ronne/layout.json";

/**
 * The line a diff ends with when files under `.ronne/` changed (feature 031): they're named, not
 * shown, because they stay with the draft and aren't released.
 */
const Unreleased = ({ paths }: { paths: readonly string[] }) => {
  const t = useTranslations("author.diff");
  if (paths.length === 0) return null;
  const layoutOnly = paths.length === 1 && paths[0] === LAYOUT_PATH;
  const named = paths.map((path, i) => (
    <span key={path}>
      {i > 0 ? ", " : null}
      <code className="font-mono text-[0.85em]">{path}</code>
    </span>
  ));
  return (
    <p className="text-sm text-muted">
      {layoutOnly
        ? t.rich("layout", { path: () => named })
        : t.rich("ronne", { count: paths.length, paths: () => named })}
    </p>
  );
};

/** What changed between two revisions, or against a proposal's base (017), file by file (014). */
export const FileChanges = ({
  changes,
  unreleased = [],
  since,
  emptyText,
}: {
  changes: FileChange[];
  /** Files under `.ronne/` that changed too: named under the diff, not shown in it (031). */
  unreleased?: readonly string[];
  since: number | null;
  /** What to say when nothing changed; "No changes since revision N." by default. */
  emptyText?: string;
}) => {
  const t = useTranslations("author.diff");
  const bytes = useBytes();
  if (changes.length === 0)
    return (
      <div className="grid gap-2">
        <p className="text-sm text-muted">
          {emptyText ?? (since ? t("noChangesSince", { since }) : t("noChanges"))}
        </p>
        <Unreleased paths={unreleased} />
      </div>
    );
  return (
    <div className="grid gap-4">
      {changes.map((change) => (
        <section
          key={change.path}
          aria-label={change.path}
          className="overflow-hidden rounded-panel border border-hairline bg-surface"
        >
          <FileHeader path={change.path}>
            <Badge tone={STATUS_TONE[change.status]}>{t(`status.${change.status}`)}</Badge>
            {change.executableChanged ? (
              <Badge tone="warning">{t("executableChanged")}</Badge>
            ) : null}
          </FileHeader>
          {change.binary ? (
            <p className="px-3 py-2 text-sm text-muted">
              {change.sizeAfter !== undefined
                ? t("binaryNow", { size: bytes(change.sizeAfter) })
                : t("binary")}
            </p>
          ) : change.hunks === "too_large" ? (
            <p className="px-3 py-2 text-sm text-muted">{t("tooLarge")}</p>
          ) : change.hunks && change.hunks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                {change.hunks.map((hunk, h) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: hunks keep their order.
                  <tbody key={h} className="border-b border-hairline last:border-b-0">
                    {hunk.lines.map((line, l) => (
                      <tr
                        // biome-ignore lint/suspicious/noArrayIndexKey: lines keep their order.
                        key={l}
                        className={
                          line.kind === "added"
                            ? "bg-tint"
                            : line.kind === "removed"
                              ? "bg-canvas text-muted"
                              : ""
                        }
                      >
                        <td className="w-10 select-none px-2 text-right text-muted">
                          {line.before ?? ""}
                        </td>
                        <td className="w-10 select-none px-2 text-right text-muted">
                          {line.after ?? ""}
                        </td>
                        <td className="w-4 select-none text-center" aria-hidden="true">
                          {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}
                        </td>
                        <td className="whitespace-pre-wrap break-all py-0.5 pr-3">
                          <span className="sr-only">
                            {line.kind === "added"
                              ? `${t("lineAdded")} `
                              : line.kind === "removed"
                                ? `${t("lineRemoved")} `
                                : ""}
                          </span>
                          {line.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          ) : null}
        </section>
      ))}
      <Unreleased paths={unreleased} />
    </div>
  );
};
