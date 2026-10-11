"use client";

import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Table, Td, Th } from "@/components/ui/Table";
import { MoveChanges } from "@/features/admin-workspaces/MoveScope";
import type { MoveRequestRow } from "@/server/domains/workspaces/services/scope-moves";
import { approveMoveFromForm, declineMoveFromForm } from "./actions";
import type { MoveAnswerState } from "./types";

const REASON_MAX_LENGTH = 500;

/** What would refuse a move now, counted: shown on its row so it's seen before Approve. */
const refusals = (impact: MoveRequestRow["impact"]) =>
  impact.outsideDependents.length +
  impact.outsideHidden +
  impact.ownDependencies.length +
  impact.ownHidden +
  impact.aliasTaken.length +
  impact.aliasHidden +
  (impact.clash ? 1 : 0);

/**
 * Approve (115): checks the move again and moves it, or lists what refuses it now and leaves it
 * open. Once moved, the page refreshes and the row is gone.
 */
export const ApproveMoveForm = ({
  move,
  loaded,
}: {
  move: MoveRequestRow;
  /** What the last Approve answered, for its tests. */
  loaded?: MoveAnswerState;
}) => {
  const [state, action, pending] = useActionState<MoveAnswerState, FormData>(
    approveMoveFromForm,
    loaded ?? {},
  );
  const errorId = `approve-move-${move.id}-error`;
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="moveId" value={move.id} />
      <input type="hidden" name="workspace" value={move.to} />
      <Button
        type="submit"
        loading={pending}
        aria-label={`Approve moving ${move.scope} to ${move.to}`}
        aria-describedby={state.error ? errorId : undefined}
      >
        Approve
      </Button>
      <FieldError id={errorId}>{state.error}</FieldError>
      {state.refused ? <MoveChanges impact={state.refused} /> : null}
    </form>
  );
};

const DeclineMoveForm = ({ move, onDone }: { move: MoveRequestRow; onDone: () => void }) => {
  const [state, action, pending] = useActionState<MoveAnswerState, FormData>(
    declineMoveFromForm,
    {},
  );
  const [reason, setReason] = useState("");
  const reasonId = `decline-move-${move.id}-reason`;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="moveId" value={move.id} />
      <input type="hidden" name="workspace" value={move.to} />
      <p className="text-sm text-muted">
        Decline moving <span className="font-mono text-fg">{move.scope}</span> to{" "}
        <span className="font-mono text-fg">{move.to}</span>?
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={reasonId}>Reason (optional)</Label>
        <textarea
          id={reasonId}
          name="reason"
          maxLength={REASON_MAX_LENGTH}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-describedby={`${reasonId}-hint`}
          className={`${inputClasses} h-auto py-2`}
        />
        <p id={`${reasonId}-hint`} className="text-xs text-muted">
          {move.askedBy.name} sees it on the scope's row. {[...reason].length}/{REASON_MAX_LENGTH}
        </p>
      </div>
      <FieldError id={`decline-move-${move.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Decline
        </Button>
      </DialogActions>
    </form>
  );
};

/** Decline, with an optional reason, in a dialog; once declined, the row is gone with it. */
export const DeclineMoveButton = ({ move }: { move: MoveRequestRow }) => {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={`Decline moving ${move.scope} to ${move.to}`}
      >
        Decline
      </Button>
      <Dialog open={open} onClose={close} title="Decline move">
        <DeclineMoveForm key={round} move={move} onDone={close} />
      </Dialog>
    </>
  );
};

/**
 * Scope moves waiting for an answer (115), oldest first: the scope and its items, from and to,
 * its name there (marked when renamed), who asked and when, the message, the not-reviewed
 * versions, and what would refuse it now; Approve or Decline. `showTarget` adds the target column:
 * the Requests page lists every workspace the reader answers for; a workspace's tab doesn't need it.
 */
export const ScopeMovesTable = ({
  moves,
  showTarget = false,
}: {
  moves: MoveRequestRow[];
  showTarget?: boolean;
}) => {
  if (moves.length === 0)
    return (
      <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
        No moves waiting.
      </p>
    );
  return (
    <div className="grid gap-2">
      <Help id="move-approve" />
      <Table>
        <thead>
          <tr>
            <Th>Scope</Th>
            <Th>From</Th>
            {showTarget ? <Th>To</Th> : null}
            <Th>Its name there</Th>
            <Th>Asked by (UTC)</Th>
            <Th>Message</Th>
            <Th>
              <span className="sr-only">Answer</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m) => {
            const refused = refusals(m.impact);
            return (
              <tr key={m.id}>
                <Td className="py-2">
                  <span className="block font-mono text-[13px] text-fg">{m.scope}</span>
                  <span className="block text-xs text-muted">
                    {m.items} {m.items === 1 ? "item" : "items"}
                  </span>
                  {m.notReviewed.length > 0 ? (
                    <span className="block text-xs text-warning-text">
                      Not reviewed: {m.notReviewed.join(", ")}. Approving reviews them.
                    </span>
                  ) : null}
                  {refused > 0 ? (
                    <span className="block text-xs text-error-text">
                      {refused === 1 ? "1 thing refuses" : `${refused} things refuse`} it now:
                      Approve lists them.
                    </span>
                  ) : null}
                </Td>
                <Td mono>{m.from}</Td>
                {showTarget ? <Td mono>{m.to}</Td> : null}
                <Td className="py-2">
                  <span className="font-mono text-xs text-fg">{m.newName}</span>
                  {m.renamed ? <span className="block text-xs text-muted">Renamed</span> : null}
                </Td>
                <Td className="py-2 whitespace-nowrap">
                  <span className="block text-sm text-fg">{m.askedBy.name}</span>
                  <span className="block font-mono text-xs text-muted">{m.askedBy.email}</span>
                  <LocalTime value={m.createdAt} />
                </Td>
                <Td className="max-w-80 py-2 text-sm break-words whitespace-pre-line">
                  {m.message ?? <span className="text-muted">None</span>}
                </Td>
                <Td className="py-2">
                  <div className="flex flex-nowrap items-start gap-2">
                    <ApproveMoveForm move={m} />
                    <DeclineMoveButton move={m} />
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
};
