"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { AskToJoinLink } from "@/components/workspaces/AskToJoinLink";
import { submitSelectedAction } from "./actions";
import type { BulkResult } from "./types";

/**
 * Submitting several drafts at once from My submissions (feature 052). The page marks each open
 * draft Ready or n to fix from one check when it loads; only ready ones can be selected. Submit
 * selected asks first, then submits them, in groups that go all or none (112), and shows what
 * happened to each. Selecting a draft selects the person's own drafts it depends on too, which go
 * with it (056); those can't be unselected while it is.
 */
type Selection = {
  /** The ready drafts' ids, with their names, as the page found them. */
  ready: ReadonlyMap<string, string>;
  selected: ReadonlySet<string>;
  /** For a selected draft's dependency: the name of a selected draft that needs it (056). */
  neededBy: (id: string) => string | null;
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

type Needs = Readonly<Record<string, readonly string[]>>;

/** The name of a selected draft that needs `id` (056), or null. */
export const neededBy = (
  id: string,
  selected: ReadonlySet<string>,
  needs: Needs,
  ready: ReadonlyMap<string, string>,
): string | null => {
  for (const other of selected)
    if (other !== id && (needs[other] ?? []).includes(id)) return ready.get(other) ?? other;
  return null;
};

/**
 * The selection after ticking or unticking `id`: ticking a ready draft adds the ready drafts it
 * needs, depth first; unticking one that a selected draft needs does nothing (056).
 */
export const toggled = (
  selected: ReadonlySet<string>,
  id: string,
  ready: ReadonlyMap<string, string>,
  needs: Needs,
): ReadonlySet<string> => {
  const next = new Set(selected);
  if (next.has(id)) {
    if (!neededBy(id, selected, needs, ready)) next.delete(id);
    return next;
  }
  const add = (one: string) => {
    if (next.has(one) || !ready.has(one)) return;
    next.add(one);
    for (const dependency of needs[one] ?? []) add(dependency);
  };
  add(id);
  return next;
};

/** Holds the selection for the table's checkboxes and the toolbar. */
export const BulkSubmitProvider = ({
  ready,
  needs = {},
  children,
}: {
  /** Ready drafts: id → `@scope/name`. */
  ready: Record<string, string>;
  /** Each draft's own dependency drafts, by id (056): selected with it. */
  needs?: Record<string, readonly string[]>;
  children: ReactNode;
}) => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const readyMap = new Map(Object.entries(ready));
  const value: Selection = {
    ready: readyMap,
    selected,
    neededBy: (id) => neededBy(id, selected, needs, readyMap),
    toggle: (id) => setSelected((previous) => toggled(previous, id, readyMap, needs)),
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
  const { selected, toggle, neededBy } = useSelection();
  const ready = errors === 0;
  const lockedFor = selected.has(id) ? neededBy(id) : null;
  return (
    <input
      type="checkbox"
      aria-label={
        !ready
          ? `Fix ${errors} ${errors === 1 ? "issue" : "issues"} in ${name} first`
          : lockedFor
            ? `${name}: included for ${lockedFor}`
            : `Select ${name}`
      }
      title={
        !ready
          ? `Fix ${errors} ${errors === 1 ? "issue" : "issues"} first`
          : lockedFor
            ? `Included for ${lockedFor}: it goes with it`
            : undefined
      }
      disabled={!ready || lockedFor !== null}
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
  not_a_member: "Not submitted",
};

/**
 * What Submit selected did to each draft, with why one wasn't submitted, and Ask to join for one in
 * a workspace the person isn't in (094).
 */
export const BulkResults = ({ results }: { results: BulkResult[] }) => (
  <ul className="grid gap-2 text-sm">
    {results.map((r) => (
      <li key={r.id}>
        <span className="mr-2 font-mono text-xs font-semibold">{OUTCOME[r.result]}:</span>
        <Link href={`/submissions/${r.id}`} className="font-mono text-link hover:underline">
          {r.name}
        </Link>
        {r.reasons.length > 0 ? (
          <ul className="ml-4 list-disc text-muted">
            {r.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {r.joinWorkspace ? (
              <li>
                <AskToJoinLink workspace={r.joinWorkspace} />
              </li>
            ) : null}
          </ul>
        ) : null}
      </li>
    ))}
  </ul>
);

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
            <BulkResults results={results} />
            <DialogActions>
              <Button onClick={close}>Done</Button>
            </DialogActions>
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
              withdraw one until it's released.
            </p>
            <DialogActions>
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
            </DialogActions>
          </div>
        )}
      </Dialog>
    </div>
  );
};
