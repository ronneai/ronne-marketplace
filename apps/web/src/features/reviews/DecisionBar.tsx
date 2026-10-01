"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import type { ReviewDecision } from "@/server/domains/submissions/actions/reviews";
import { decideAction } from "./actions";

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

/** The reviewer's decisions (feature 014): each asks for its message in a dialog, then refreshes. */
export const DecisionBar = ({ id, decisions }: { id: string; decisions: ReviewDecision[] }) => {
  const router = useRouter();
  const [open, setOpen] = useState<ReviewDecision | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
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
              setError(null);
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
                const result = await decideAction(id, open, text);
                if (result.error) return setError(result.error);
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
