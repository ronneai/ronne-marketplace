"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { submitSelectedAction } from "./actions";
import type { BulkResult } from "./types";

/**
 * Submitting several drafts at once from My submissions (feature 052). The page marks each open
 * draft Ready or n to fix from one check when it loads; only ready ones can be selected. Submit
 * selected asks first, then submits each on its own and shows what happened to each.
 */
type Selection = {
  /** The ready drafts' ids, with their names, as the page found them. */
  ready: ReadonlyMap<string, string>;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

const useSelection = () => {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("BulkSubmit's parts go inside BulkSubmitProvider.");
  return selection;
};

/** Holds the selection for the table's checkboxes and the toolbar. */
export const BulkSubmitProvider = ({
  ready,
  children,
}: {
  /** Ready drafts: id → `@scope/name`. */
  ready: Record<string, string>;
  children: ReactNode;
}) => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readyMap = new Map(Object.entries(ready));
  const value: Selection = {
    ready: readyMap,
    selected,
    toggle: (id) =>
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else if (readyMap.has(id)) next.add(id);
        return next;
      }),
    selectAll: () => setSelected(new Set(readyMap.keys())),
    clear: () => setSelected(new Set()),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

/** A row's checkbox: enabled only when the draft is ready, labelled with why when it isn't. */
export const SelectCell = ({
  id,
  name,
  errors,
}: {
  id: string;
  name: string;
  /** What Submit would refuse now; 0 means ready. */
  errors: number;
}) => {
  const { selected, toggle } = useSelection();
  const ready = errors === 0;
  return (
    <input
      type="checkbox"
      aria-label={
        ready
          ? `Select ${name}`
          : `Fix ${errors} ${errors === 1 ? "issue" : "issues"} in ${name} first`
      }
      title={ready ? undefined : `Fix ${errors} ${errors === 1 ? "issue" : "issues"} first`}
      disabled={!ready}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className="size-4 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40"
    />
  );
};

/** Next to a draft's status: Ready, or how many issues block it, linking to the editor. */
export const ReadinessMark = ({ id, errors }: { id: string; errors: number }) =>
  errors === 0 ? (
    <Badge tone="accent" className="ml-2">
      Ready
    </Badge>
  ) : (
    <Link
      href={`/submissions/${id}`}
      className="ml-2 font-mono text-xs text-warning-text hover:underline"
    >
      {errors} to fix
    </Link>
  );

const OUTCOME: Record<BulkResult["result"], string> = {
  submitted: "Submitted",
  resubmitted: "Resubmitted",
  not_ready: "Not submitted",
  not_found: "Not submitted",
  not_submittable: "Not submitted",
};

/** Select all ready and Submit selected, above the table; only when something is ready. */
export const BulkToolbar = ({ help }: { help?: ReactNode }) => {
  const router = useRouter();
  const { ready, selected, selectAll, clear } = useSelection();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  // What the dialog confirms, kept as it was when it opened: submitting refreshes the page.
  const [confirming, setConfirming] = useState<{ id: string; name: string }[]>([]);
  const [submitting, startSubmit] = useTransition();
  // After a submit the page refreshes with fewer ready drafts, maybe none: the results stay open.
  if (ready.size === 0 && !open) return null;
  const chosen = [...selected].filter((id) => ready.has(id));
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
      {ready.size > 0 ? (
        <>
          <Button variant="secondary" onClick={selectAll}>
            Select all ready ({ready.size})
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              setConfirming(chosen.map((id) => ({ id, name: ready.get(id) ?? id })));
              setOpen(true);
            }}
          >
            Submit selected ({chosen.length})
          </Button>
          {help}
        </>
      ) : null}
      <Dialog
        open={open}
        onClose={close}
        title={results ? "Submitted" : `Submit ${confirming.length} for review`}
      >
        {results ? (
          <div className="grid gap-4">
            <ul className="grid gap-2 text-sm">
              {results.map((r) => (
                <li key={r.id}>
                  <span className="mr-2 font-mono text-xs font-semibold">{OUTCOME[r.result]}:</span>
                  <Link
                    href={`/submissions/${r.id}`}
                    className="font-mono text-link hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.reasons.length > 0 ? (
                    <ul className="ml-4 list-disc text-muted">
                      {r.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <ul className="grid gap-1 font-mono text-sm">
              {confirming.map((draft) => (
                <li key={draft.id}>{draft.name}</li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              Each goes to reviewers with its files frozen, as Submit does in the editor. You can
              withdraw one until it's approved.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                loading={submitting}
                onClick={() =>
                  startSubmit(async () =>
                    setResults(await submitSelectedAction(confirming.map((draft) => draft.id))),
                  )
                }
              >
                Submit {confirming.length} {confirming.length === 1 ? "draft" : "drafts"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
