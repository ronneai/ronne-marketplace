"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import type { Dependent, ReviewDecision } from "@/server/domains/submissions/actions/reviews";
import type { DecisionOption } from "@/server/domains/submissions/services/decisions";
import { decideAction, dependentsAction, rejectAction } from "./actions";
import { useQueueStatus } from "./QueueStatus";

const COPY: Record<
  ReviewDecision,
  {
    button: string;
    title: string;
    hint: string;
    required: boolean;
    variant: "primary" | "secondary" | "destructive";
  }
> = {
  approve: {
    button: "Approve",
    title: "Approve this submission?",
    hint: "Optional. Once approved, the author or a moderator can release it.",
    required: false,
    variant: "primary",
  },
  request_changes: {
    button: "Request changes",
    title: "Request changes",
    hint: "Required. Say what to change; the author edits and resubmits.",
    required: true,
    variant: "secondary",
  },
  reject: {
    button: "Reject",
    title: "Reject this submission?",
    hint: "Required. Rejecting is final: the author has to start a new draft.",
    required: true,
    variant: "destructive",
  },
  override: {
    button: "Approve (override)",
    title: "Approve your own submission?",
    hint: "Optional. As root, you can approve your own submission; it's marked as an override in the conversation and the audit log.",
    required: false,
    variant: "secondary",
  },
};

/** What the dependents of a rejected submission are told, prefilled and editable (056). */
export const dependentsMessage = (name: string) =>
  `${name} was rejected: remove it from dependencies, or depend on another item.`;

/**
 * The open submissions that depend on the one being rejected (056), and whether to send them back
 * too: on by default, with their own message.
 */
export const DependentsChoice = ({
  dependents,
  sendBack,
  onSendBack,
  text,
  onText,
}: {
  dependents: Dependent[];
  sendBack: boolean;
  onSendBack: (value: boolean) => void;
  text: string;
  onText: (value: string) => void;
}) => (
  <fieldset className="grid gap-2 rounded-control border border-hairline p-3">
    <legend className="px-1 text-sm font-semibold">
      {dependents.length === 1 ? "1 submission depends" : `${dependents.length} submissions depend`}{" "}
      on this
    </legend>
    <Help id="dependents-listed" />
    <ul className="grid gap-1 text-sm">
      {dependents.map((d) => (
        <li key={d.id}>
          <span className="font-mono">{d.name}</span>{" "}
          <span className="text-muted">
            ({d.status.replace("_", " ")}, by {d.authorName})
            {d.sendBack.ok ? "" : `: ${d.sendBack.reason}`}
          </span>
        </li>
      ))}
    </ul>
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={sendBack}
        onChange={(event) => onSendBack(event.target.checked)}
        className="size-4 rounded-sm border border-strong accent-(--accent)"
      />
      Request changes on them too
    </label>
    {sendBack ? (
      <>
        <Label htmlFor="dependents-message">Their message</Label>
        <textarea
          id="dependents-message"
          rows={2}
          maxLength={5000}
          required
          value={text}
          onChange={(event) => onText(event.target.value)}
          className={`${inputClasses} h-auto py-2`}
        />
      </>
    ) : (
      <p className="text-xs text-muted">They stay as they are, marked blocked.</p>
    )}
  </fieldset>
);

/**
 * One decision's dialog (014): its message, and for Reject the dependents' choice (056). From a
 * queue row (058), `via: "queue"` goes to the audit log.
 */
export const DecisionDialog = ({
  id,
  name,
  decision,
  dependents = [],
  via,
  revision,
  onClose,
  onDone,
}: {
  id: string;
  /** The item's name, for the dependents' message (056). */
  name?: string;
  decision: ReviewDecision;
  /** Open submissions that depend on this one (056), listed when rejecting. */
  dependents?: Dependent[];
  via?: "queue";
  /** The revision the page shows: an approval goes only if it's still the latest (AUTHZ-2). */
  revision?: number | null;
  onClose: () => void;
  /** After the decision went through, before the page refreshes. */
  onDone?: () => void;
}) => {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sendBack, setSendBack] = useState(true);
  const [othersText, setOthersText] = useState(dependentsMessage(name ?? "This item"));
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [pending, start] = useTransition();
  const copy = COPY[decision];
  return (
    <Dialog open onClose={onClose} title={copy.title}>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            if (decision === "reject" && dependents.length > 0) {
              const result = await rejectAction(id, text, sendBack ? othersText : null, via);
              if (result.error) return setError(result.error);
              // Ones that couldn't be sent back stay in view, with why.
              if (result.skipped?.length) {
                setSkipped(result.skipped);
                onDone?.();
                return router.refresh();
              }
            } else {
              const result = await decideAction(id, decision, text, via, revision);
              if (result.error) {
                setError(result.error);
                // Someone else decided it, or its author withdrew it: show the queue as it is now.
                return router.refresh();
              }
            }
            onDone?.();
            onClose();
            router.refresh();
          });
        }}
      >
        <Label htmlFor="decision-message">Message</Label>
        <textarea
          id="decision-message"
          rows={4}
          maxLength={5000}
          required={copy.required}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby="decision-hint decision-error"
          className={`${inputClasses} h-auto py-2`}
        />
        <p id="decision-hint" className="text-xs text-muted">
          {copy.hint}
        </p>
        {decision === "reject" && dependents.length > 0 ? (
          <DependentsChoice
            dependents={dependents}
            sendBack={sendBack}
            onSendBack={setSendBack}
            text={othersText}
            onText={setOthersText}
          />
        ) : null}
        {skipped.length > 0 ? (
          <div className="grid gap-1 text-sm">
            <p className="font-semibold">Rejected. Not sent back:</p>
            <ul className="grid gap-0.5 text-muted">
              {skipped.map((d) => (
                <li key={d.name}>
                  <span className="font-mono">{d.name}</span>: {d.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <FieldError id="decision-error">{error}</FieldError>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={copy.variant === "destructive" ? "destructive" : "primary"}
            loading={pending}
          >
            {copy.button}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

/** A decision as a button: allowed, or disabled with the reason (058). */
const asOption = (decision: ReviewDecision | DecisionOption): DecisionOption =>
  typeof decision === "string" ? { decision, allowed: true } : decision;

/** The reviewer's decisions (feature 014): each asks for its message in a dialog, then refreshes. */
export const DecisionBar = ({
  id,
  name,
  decisions,
  dependents = [],
  revision,
}: {
  id: string;
  /** The revision the page shows, sent with an approval (security audit AUTHZ-2). */
  revision?: number | null;
  /** The item's name, for the dependents' message (056). */
  name?: string;
  /** Each decision, or (058) each with whether it's allowed and why not. */
  decisions: readonly (ReviewDecision | DecisionOption)[];
  /** Open submissions that depend on this one (056), listed when rejecting. */
  dependents?: Dependent[];
}) => {
  const [open, setOpen] = useState<ReviewDecision | null>(null);
  if (decisions.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {decisions.map(asOption).map((option) => (
          <Button
            key={option.decision}
            variant={COPY[option.decision].variant}
            disabledReason={option.allowed ? null : option.reason}
            onClick={() => setOpen(option.decision)}
          >
            {COPY[option.decision].button}
          </Button>
        ))}
      </div>
      {open ? (
        <DecisionDialog
          id={id}
          name={name}
          decision={open}
          dependents={dependents}
          revision={revision}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
};

/** The decisions a queue row offers (058): request changes and reject, one at a time. */
const ROW_DECISIONS: readonly ReviewDecision[] = ["request_changes", "reject"];

/**
 * A review queue row's own decisions (058): Request changes and Reject, each with its required
 * message, as on the review page. Rejecting loads the submission's dependents first (056).
 */
export const RowDecisions = ({
  id,
  name,
  decisions,
}: {
  id: string;
  name: string;
  decisions: readonly DecisionOption[];
}) => {
  const [open, setOpen] = useState<{ decision: ReviewDecision; dependents: Dependent[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const say = useQueueStatus();
  const shown = decisions.filter((option) => ROW_DECISIONS.includes(option.decision));
  if (shown.length === 0) return null;
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
        {shown.map((option) => (
          <Button
            key={option.decision}
            variant={option.decision === "reject" ? "text-destructive" : "text"}
            aria-label={`${COPY[option.decision].button}: ${name}`}
            disabledReason={option.allowed ? null : option.reason}
            loading={pending && option.decision === "reject"}
            onClick={() => {
              setError(null);
              if (option.decision !== "reject")
                return setOpen({ decision: option.decision, dependents: [] });
              start(async () => {
                const result = await dependentsAction(id);
                if ("error" in result) return setError(result.error);
                setOpen({ decision: "reject", dependents: result.dependents });
              });
            }}
          >
            {COPY[option.decision].button}
          </Button>
        ))}
      </div>
      <FieldError id={`row-decision-error-${id}`}>{error}</FieldError>
      {open ? (
        <DecisionDialog
          id={id}
          name={name}
          decision={open.decision}
          dependents={open.dependents}
          via="queue"
          onClose={() => setOpen(null)}
          onDone={() =>
            say(open.decision === "reject" ? `Rejected ${name}.` : `Requested changes on ${name}.`)
          }
        />
      ) : null}
    </div>
  );
};
