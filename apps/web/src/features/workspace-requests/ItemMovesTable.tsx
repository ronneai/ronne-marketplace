"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Table, Td, Th } from "@/components/ui/Table";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { useToastWhen } from "@/components/ui/toast";
import { MoveItemChanges } from "@/features/item-move/MoveItem";
import type { ItemMoveRequestRow } from "@/server/domains/workspaces/services/item-moves";
import { approveItemMoveFromForm, declineItemMoveFromForm } from "./actions";
import type { ItemMoveAnswerState } from "./types";

const REASON_MAX_LENGTH = 500;

/**
 * Approve (134): checks the name again and moves the item, or says why it's taken now and leaves
 * the request open. Once moved, the page refreshes and the row is gone.
 */
export const ApproveItemMoveForm = ({
  move,
  loaded,
}: {
  move: ItemMoveRequestRow;
  /** What the last Approve answered, for its tests. */
  loaded?: ItemMoveAnswerState;
}) => {
  const t = useTranslations("workspaces.itemMoves");
  const [state, action, pending] = useActionState<ItemMoveAnswerState, FormData>(
    approveItemMoveFromForm,
    loaded ?? {},
  );
  // An error of a button in a row has no form to sit next to: it is a toast that stays (138).
  useToastWhen(state, state.error, "error");
  if (state.done)
    return (
      <p role="status" className="text-xs text-muted [overflow-wrap:anywhere]">
        {state.done}
      </p>
    );
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="moveId" value={move.id} />
      <Button
        type="submit"
        loading={pending}
        aria-label={t("approveAria", { item: move.item, to: move.to })}
      >
        {t("approve")}
      </Button>
      {state.refused ? <MoveItemChanges impact={state.refused} /> : null}
    </form>
  );
};

export const DeclineItemMoveForm = ({
  move,
  onDone,
}: {
  move: ItemMoveRequestRow;
  onDone: () => void;
}) => {
  const t = useTranslations("workspaces.itemMoves");
  const [state, action, pending] = useActionState<ItemMoveAnswerState, FormData>(
    declineItemMoveFromForm,
    {},
  );
  const [reason, setReason] = useState("");
  const reasonId = `decline-item-move-${move.id}-reason`;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="moveId" value={move.id} />
      <input type="hidden" name="workspace" value={move.workspace} />
      <p className="text-sm text-muted [overflow-wrap:anywhere]">
        {t.rich("declineBody", {
          item: move.item,
          to: move.to,
          mono: (chunks) => <span className="font-mono text-fg">{chunks}</span>,
        })}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={reasonId}>{t("reason")}</Label>
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
          {t("reasonHint", {
            name: move.askedBy.name,
            used: [...reason].length,
            max: REASON_MAX_LENGTH,
          })}
        </p>
      </div>
      <FieldError id={`decline-item-move-${move.id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("decline")}
        </Button>
      </DialogActions>
    </form>
  );
};

/** Decline, with an optional reason, in a dialog. */
export const DeclineItemMoveButton = ({ move }: { move: ItemMoveRequestRow }) => {
  const t = useTranslations("workspaces.itemMoves");
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
        aria-label={t("declineAria", { item: move.item, to: move.to })}
      >
        {t("decline")}
      </Button>
      <Dialog open={open} onClose={close} title={t("declineTitle")}>
        <DeclineItemMoveForm key={round} move={move} onDone={close} />
      </Dialog>
    </>
  );
};

/**
 * Item moves waiting for an answer (134), oldest first: the item and its type, from and to, its
 * name there, who asked and when, the message, and what would refuse it now; Approve or Decline.
 */
export const ItemMovesTable = ({ moves }: { moves: ItemMoveRequestRow[] }) => {
  const t = useTranslations("workspaces.itemMoves");
  const answer = useTranslations("workspaces.requests");
  if (moves.length === 0)
    return (
      <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
        {t("none")}
      </p>
    );
  return (
    <div className="grid gap-2">
      <Help id="item-move-approve" />
      <Table>
        <thead>
          <tr>
            <Th>{t("item")}</Th>
            <Th>{t("from")}</Th>
            <Th>{t("to")}</Th>
            <Th>{t("newName")}</Th>
            <Th>{t("askedBy")}</Th>
            <Th>{t("message")}</Th>
            <Th>
              <span className="sr-only">{answer("answer")}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m) => (
            <tr key={m.id}>
              <Td className="py-2">
                <span className="block font-mono text-[13px] break-all text-fg">{m.item}</span>
                <TypeBadge type={m.type} />
                {m.refusal ? (
                  <span className="block text-xs text-error-text">
                    {t("refusal", { refusal: m.refusal })}
                  </span>
                ) : null}
              </Td>
              <Td mono>{m.from}</Td>
              <Td mono>{m.to}</Td>
              <Td className="py-2">
                <span className="font-mono text-xs break-all text-fg">{m.newName}</span>
              </Td>
              <Td className="py-2 whitespace-nowrap">
                <span className="block text-sm text-fg">{m.askedBy.name}</span>
                <span className="block font-mono text-xs text-muted">{m.askedBy.email}</span>
                <LocalTime value={m.createdAt} />
              </Td>
              <Td className="max-w-80 py-2 text-sm break-words whitespace-pre-line">
                {m.message ?? <span className="text-muted">{answer("noMessage")}</span>}
              </Td>
              <Td className="py-2">
                <div className="flex flex-nowrap items-start gap-2">
                  <ApproveItemMoveForm move={m} />
                  <DeclineItemMoveButton move={m} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
