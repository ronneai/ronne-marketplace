"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import type { Dependent, ReviewDecision } from "@/server/domains/submissions/actions/reviews";
import { decideAction, rejectAction } from "./actions";

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

/** The reviewer's decisions (feature 014): each asks for its message in a dialog, then refreshes. */
export const DecisionBar = ({
  id,
  name,
  decisions,
  dependents = [],
}: {
  id: string;
  /** The item's name, for the dependents' message (056). */
  name?: string;
  decisions: ReviewDecision[];
  /** Open submissions that depend on this one (056), listed when rejecting. */
  dependents?: Dependent[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState<ReviewDecision | null>(null);
  const [text, setText] = useState("");
  const [sendBack, setSendBack] = useState(true);
  const [othersText, setOthersText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [pending, start] = useTransition();
  if (decisions.length === 0) return null;
  const copy = open ? COPY[open] : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {decisions.map((decision) => (
          <Button
            key={decision}
            variant={COPY[decision].variant}
            onClick={() => {
              setText("");
              setSendBack(true);
              setOthersText(dependentsMessage(name ?? "This item"));
              setError(null);
              setSkipped([]);
              setOpen(decision);
            }}
          >
            {COPY[decision].button}
          </Button>
        ))}
      </div>
      {open && copy ? (
        <Dialog open onClose={() => setOpen(null)} title={copy.title}>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              start(async () => {
                if (open === "reject" && dependents.length > 0) {
                  const result = await rejectAction(id, text, sendBack ? othersText : null);
                  if (result.error) return setError(result.error);
                  // Ones that couldn't be sent back stay in view, with why.
                  if (result.skipped?.length) {
                    setSkipped(result.skipped);
                    return router.refresh();
                  }
                } else {
                  const result = await decideAction(id, open, text);
                  if (result.error) return setError(result.error);
                }
                setOpen(null);
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
            {open === "reject" && dependents.length > 0 ? (
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
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={copy.variant === "destructive" ? "destructive" : "primary"}
                loading={pending}
              >
                {copy.button}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
};
