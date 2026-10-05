"use client";

import { Check, Info, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { approveSelectedAction } from "./actions";
import type { ApproveResult } from "./types";

/**
 * Approving several submissions at once from the review queue (feature 054). Only rows this
 * reviewer can approve now can be selected. Approve selected opens the owner's batch review mock: a
 * filter and the selection on top, the list (the risky ones first with their flags, root's own
 * marked as overrides) scrolling on its own, and the summary, one optional message for all and the
 * buttons always in view below it. Each is then approved on its own, and the dialog shows what
 * happened to each.
 */

/** What the dialog shows about a submission that can be approved. */
export type ApprovableRow = {
  name: string;
  type: string;
  author: string;
  revision: number | null;
  riskKinds: string[];
  override: boolean;
};

type Selection = {
  approvable: ReadonlyMap<string, ApprovableRow>;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

const useSelection = () => {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("BulkApprove's parts go inside BulkApproveProvider.");
  return selection;
};

/** Holds the selection for the queue's checkboxes and the toolbar. */
export const BulkApproveProvider = ({
  approvable,
  children,
}: {
  /** Submissions this reviewer can approve now, by id. */
  approvable: Record<string, ApprovableRow>;
  children: ReactNode;
}) => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const map = new Map(Object.entries(approvable));
  const value: Selection = {
    approvable: map,
    selected,
    toggle: (id) =>
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else if (map.has(id)) next.add(id);
        return next;
      }),
    selectAll: () => setSelected(new Set(map.keys())),
    clear: () => setSelected(new Set()),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

/** A row's checkbox: enabled when it can be approved, labelled with why when it can't. */
export const ApproveSelectCell = ({
  id,
  name,
  reason,
}: {
  id: string;
  name: string;
  /** Why it can't be approved now; null when it can. */
  reason: string | null;
}) => {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={reason ? `${name}: ${reason}` : `Select ${name}`}
      title={reason ?? undefined}
      disabled={reason !== null}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className="size-4 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40"
    />
  );
};

type Listed = ApprovableRow & { id: string };

/** Risky first, then in the queue's order. */
const riskyFirst = (rows: Listed[]) => [
  ...rows.filter((row) => row.riskKinds.length > 0),
  ...rows.filter((row) => row.riskKinds.length === 0),
];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const checkbox =
  "mt-0.5 size-4 shrink-0 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * The part of the dialog that scrolls: the list, between the bars that stay put. Browsers let the
 * keyboard reach a scrolling region on their own.
 */
const ScrollingList = ({ label, children }: { label: string; children: ReactNode }) => (
  <section
    aria-label={label}
    className="min-h-0 flex-1 overflow-y-auto px-4 py-1 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-focus"
  >
    {children}
  </section>
);

/** One submission in the list: name and type, then who and which revision, override and flags. */
const ListedRow = ({
  row,
  included,
  onToggle,
}: {
  row: Listed;
  included: boolean;
  onToggle: () => void;
}) => (
  <li className="border-b border-hairline last:border-b-0">
    <label className="flex cursor-pointer items-start gap-2.5 rounded-control px-1 py-2.5 hover:bg-canvas">
      <input
        type="checkbox"
        aria-label={`Include ${row.name}`}
        checked={included}
        onChange={onToggle}
        className={checkbox}
      />
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[13px] font-semibold text-fg">{row.name}</span>
          <TypeBadge type={row.type} className="shrink-0" />
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted">
          <span>
            {row.author}
            {row.revision !== null ? ` · revision ${row.revision}` : ""}
          </span>
          {row.override || row.riskKinds.length > 0 ? (
            <span className="flex flex-wrap justify-end gap-1.5">
              {row.override ? <Badge>override</Badge> : null}
              {row.riskKinds.map((kind) => (
                <Badge key={kind} tone="warning">
                  ⚠ {kind}
                </Badge>
              ))}
            </span>
          ) : null}
        </span>
      </span>
    </label>
  </li>
);

const outcome = (r: ApproveResult) =>
  r.result === "approved" ? (r.override ? "Approved (override)" : "Approved") : "Not approved";

const ResultList = ({ results }: { results: ApproveResult[] }) => (
  <ul className="text-sm">
    {results.map((r) => (
      <li key={r.id} className="border-b border-hairline py-2.5 last:border-b-0">
        <span className="mr-2 font-mono text-xs font-semibold">{outcome(r)}:</span>
        <Link href={`/reviews/${r.id}`} className="font-mono text-link hover:underline">
          {r.name}
        </Link>
        {r.revision !== null ? (
          <span className="ml-2 font-mono text-xs text-muted">revision {r.revision}</span>
        ) : null}
        {r.reason ? <p className="mt-1 text-muted">{r.reason}</p> : null}
      </li>
    ))}
  </ul>
);

/** Whether a row matches the filter: by name, type or author, ignoring case. */
const matches = (row: Listed, filter: string) => {
  const needle = filter.trim().toLowerCase();
  return (
    !needle ||
    [row.name, row.type, row.author].some((value) => value.toLowerCase().includes(needle))
  );
};

/** Select all and Approve selected, above the Needs review table; only when something can be. */
export const BulkApproveToolbar = ({ help }: { help?: ReactNode }) => {
  const router = useRouter();
  const { approvable, selected, selectAll, clear } = useSelection();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApproveResult[] | null>(null);
  // What the dialog lists, kept as it was when it opened: approving refreshes the page.
  const [listed, setListed] = useState<Listed[]>([]);
  // Which of them go: all at first; the dialog's checkboxes take some out.
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set());
  const [approving, startApprove] = useTransition();
  // After approving, the page refreshes with fewer rows, maybe none: the results stay open.
  if (approvable.size === 0 && !open) return null;
  const chosen = [...selected].filter((id) => approvable.has(id));
  const going = listed.filter((row) => included.has(row.id));
  const overrides = going.filter((row) => row.override).length;
  const shown = listed.filter((row) => matches(row, filter));
  const allShownIncluded = shown.length > 0 && shown.every((row) => included.has(row.id));
  const setShown = (include: boolean) =>
    setIncluded((previous) => {
      const next = new Set(previous);
      for (const row of shown) {
        if (include) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  const toggle = (id: string) =>
    setIncluded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const close = () => {
    setOpen(false);
    if (results) {
      setResults(null);
      clear();
      router.refresh();
    }
  };
  const title = results ? (
    "Approved"
  ) : (
    <span className="flex flex-wrap items-center gap-2.5">
      Approve {plural(going.length, "submission", "submissions")}?
      <Badge aria-hidden>Batch review</Badge>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 pb-4">
      {approvable.size > 0 ? (
        <>
          <Button variant="secondary" onClick={selectAll}>
            Select all ({approvable.size})
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              const rows = riskyFirst(
                chosen.flatMap((id) => {
                  const row = approvable.get(id);
                  return row ? [{ ...row, id }] : [];
                }),
              );
              setListed(rows);
              setIncluded(new Set(rows.map((row) => row.id)));
              setFilter("");
              setText("");
              setError(null);
              setOpen(true);
            }}
          >
            Approve selected ({chosen.length})
          </Button>
          {help}
        </>
      ) : null}
      <Dialog open={open} onClose={close} title={title} size="large">
        {results ? (
          <>
            <ScrollingList label="What happened to each">
              <ResultList results={results} />
            </ScrollingList>
            <div className="flex shrink-0 justify-end border-t border-hairline px-4 py-4">
              <Button onClick={close}>Done</Button>
            </div>
          </>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              startApprove(async () => {
                const state = await approveSelectedAction(
                  going.map((row) => ({ id: row.id, revision: row.revision })),
                  text,
                );
                if ("error" in state) return setError(state.error);
                setResults(state.results);
              });
            }}
          >
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-hairline bg-canvas px-4 py-2.5">
              <div className="relative min-w-40 flex-1">
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
                />
                <input
                  type="search"
                  aria-label="Filter submissions"
                  placeholder="Filter by name, type or author"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className={`${inputClasses} h-8 pl-8 text-xs`}
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <input
                  type="checkbox"
                  checked={allShownIncluded}
                  onChange={() => setShown(!allShownIncluded)}
                  className={checkbox.replace("mt-0.5 ", "")}
                />
                {going.length} selected
              </label>
              <span aria-hidden className="text-strong">
                |
              </span>
              <button
                type="button"
                onClick={() => setShown(false)}
                className="text-xs font-semibold text-muted underline decoration-dotted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
              >
                Deselect all
              </button>
            </div>
            <ScrollingList label="Submissions to approve">
              {shown.length > 0 ? (
                <ul>
                  {shown.map((row) => (
                    <ListedRow
                      key={row.id}
                      row={row}
                      included={included.has(row.id)}
                      onToggle={() => toggle(row.id)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted">No submission matches.</p>
              )}
            </ScrollingList>
            <div className="grid shrink-0 gap-3 border-t border-hairline px-4 py-4">
              <p className="flex items-start gap-2 text-sm text-muted">
                <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-accent-strong" />
                <span>
                  <strong className="font-semibold text-fg">
                    {plural(going.length, "submission", "submissions")} selected
                  </strong>
                  {overrides > 0
                    ? `: ${overrides === 1 ? "one is" : `${overrides} are`} your own, approved as ${overrides === 1 ? "an override" : "overrides"}, marked in the conversation and the audit log.`
                    : "."}
                </span>
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-approve-message">
                  Message <span className="font-normal text-muted">(optional)</span>
                </Label>
                <textarea
                  id="bulk-approve-message"
                  rows={2}
                  maxLength={5000}
                  placeholder="A note for every approval"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-describedby="bulk-approve-hint bulk-approve-error"
                  className={`${inputClasses} h-auto resize-none py-2`}
                />
                <p id="bulk-approve-hint" className="text-xs text-muted">
                  Added to every approval. Once approved, the author or a moderator can release each
                  one.
                </p>
                <FieldError id="bulk-approve-error">{error}</FieldError>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" loading={approving} disabled={going.length === 0}>
                  <Check size={16} aria-hidden />
                  Approve {plural(going.length, "submission", "submissions")}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};
