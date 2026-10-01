"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { approveSelectedAction } from "./actions";
import type { ApproveResult } from "./types";

/**
 * Approving several submissions at once from the review queue (feature 054). Only rows this
 * reviewer can approve now can be selected. Approve selected lists them, the risky ones first with
 * their flags and root's own marked as overrides, takes one optional message for all, then
 * approves each on its own and shows what happened to each.
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

/** Risky first, then in the queue's order. */
const riskyFirst = (rows: (ApprovableRow & { id: string })[]) => [
  ...rows.filter((row) => row.riskKinds.length > 0),
  ...rows.filter((row) => row.riskKinds.length === 0),
];

const ResultList = ({ results }: { results: ApproveResult[] }) => (
  <ul className="grid gap-2 text-sm">
    {results.map((r) => (
      <li key={r.id}>
        <span className="mr-2 font-mono text-xs font-semibold">
          {r.result === "approved"
            ? r.override
              ? "Approved (override)"
              : "Approved"
            : "Not approved"}
          :
        </span>
        <Link href={`/reviews/${r.id}`} className="font-mono text-link hover:underline">
          {r.name}
        </Link>
        {r.revision !== null ? (
          <span className="ml-2 font-mono text-xs text-muted">revision {r.revision}</span>
        ) : null}
        {r.reason ? <p className="ml-4 text-muted">{r.reason}</p> : null}
      </li>
    ))}
  </ul>
);

/** Select all and Approve selected, above the Needs review table; only when something can be. */
export const BulkApproveToolbar = ({ help }: { help?: ReactNode }) => {
  const router = useRouter();
  const { approvable, selected, selectAll, clear } = useSelection();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApproveResult[] | null>(null);
  // What the dialog confirms, kept as it was when it opened: approving refreshes the page.
  const [confirming, setConfirming] = useState<(ApprovableRow & { id: string })[]>([]);
  const [approving, startApprove] = useTransition();
  // After approving, the page refreshes with fewer rows, maybe none: the results stay open.
  if (approvable.size === 0 && !open) return null;
  const chosen = [...selected].filter((id) => approvable.has(id));
  const overrides = confirming.filter((row) => row.override).length;
  const close = () => {
    setOpen(false);
    if (results) {
      setResults(null);
      clear();
      router.refresh();
    }
  };
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
              setConfirming(
                riskyFirst(
                  chosen.flatMap((id) => {
                    const row = approvable.get(id);
                    return row ? [{ ...row, id }] : [];
                  }),
                ),
              );
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
      <Dialog
        open={open}
        onClose={close}
        title={
          results
            ? "Approved"
            : `Approve ${confirming.length} ${confirming.length === 1 ? "submission" : "submissions"}?`
        }
      >
        {results ? (
          <div className="grid gap-4">
            <ResultList results={results} />
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              startApprove(async () => {
                const state = await approveSelectedAction(
                  confirming.map((row) => row.id),
                  text,
                );
                if ("error" in state) return setError(state.error);
                setResults(state.results);
              });
            }}
          >
            <ul className="grid gap-2 text-sm">
              {confirming.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{row.name}</span>
                  <Badge>{row.type}</Badge>
                  <span className="text-muted">
                    {row.author}
                    {row.revision !== null ? `, revision ${row.revision}` : ""}
                  </span>
                  {row.override ? <Badge>override</Badge> : null}
                  {row.riskKinds.map((kind) => (
                    <Badge key={kind} tone="warning">
                      ⚠ {kind}
                    </Badge>
                  ))}
                </li>
              ))}
            </ul>
            {overrides > 0 ? (
              <p className="text-sm text-muted">
                {overrides === 1 ? "One is" : `${overrides} are`} your own: approved as{" "}
                {overrides === 1 ? "an override" : "overrides"}, marked in the conversation and the
                audit log.
              </p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="bulk-approve-message">Message (optional)</Label>
              <textarea
                id="bulk-approve-message"
                rows={3}
                maxLength={5000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-describedby="bulk-approve-hint bulk-approve-error"
                className={`${inputClasses} h-auto py-2`}
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
              <Button type="submit" loading={approving}>
                Approve {confirming.length} {confirming.length === 1 ? "submission" : "submissions"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};
