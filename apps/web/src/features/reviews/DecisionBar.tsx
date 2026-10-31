"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { useToast } from "@/components/ui/toast";
import { useWhy } from "@/i18n/why";
import type { Dependent, ReviewDecision } from "@/server/domains/submissions/actions/reviews";
import type { DecisionOption } from "@/server/domains/submissions/services/decisions";
import { decideAction, dependentsAction, rejectAction } from "./actions";
import { useQueueStatus } from "./QueueStatus";

/** How each decision looks and whether its message is required; its words are messages (131). */
const COPY: Record<
  ReviewDecision,
  { required: boolean; variant: "primary" | "secondary" | "destructive" }
> = {
  approve: { required: false, variant: "primary" },
  request_changes: { required: true, variant: "secondary" },
  reject: { required: true, variant: "destructive" },
  override: { required: false, variant: "secondary" },
  scan_override: { required: true, variant: "secondary" },
};

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
}) => {
  const t = useTranslations("author.review.dependents");
  const status = useTranslations("author.status");
  const why = useWhy();
  return (
    <fieldset className="grid gap-2 rounded-control border border-hairline p-3">
      <legend className="px-1 text-sm font-semibold">
        {t("legend", { count: dependents.length })}
      </legend>
      <Help id="dependents-listed" />
      <ul className="grid gap-1 text-sm">
        {dependents.map((d) => (
          <li key={d.id}>
            <span className="font-mono">{d.name}</span>{" "}
            <span className="text-muted">
              {d.sendBack.ok
                ? t("line", { status: status(d.status), author: d.authorName })
                : t("lineRefused", {
                    status: status(d.status),
                    author: d.authorName,
                    reason: why(d.sendBack.why),
                  })}
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
        {t("sendBack")}
      </label>
      {sendBack ? (
        <>
          <Label htmlFor="dependents-message">{t("theirMessage")}</Label>
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
        <p className="text-xs text-muted">{t("stay")}</p>
      )}
    </fieldset>
  );
};

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
  initialText = "",
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
  /** The message to start from: the findings the author is asked to fix (137). */
  initialText?: string;
}) => {
  const t = useTranslations("author.review");
  const said = useTranslations("common.done");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(initialText);
  const [sendBack, setSendBack] = useState(true);
  // What the dependents are told (056), prefilled in the reviewer's language and editable.
  const [othersText, setOthersText] = useState(
    t("dependents.message", { name: name ?? t("dependents.thisItem") }),
  );
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const [pending, start] = useTransition();
  const copy = COPY[decision];
  return (
    <Dialog open onClose={onClose} title={t(`decision.${decision}.title`)}>
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
                toast.ok(said("rejected"));
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
            toast.ok(
              said(
                decision === "reject"
                  ? "rejected"
                  : decision === "request_changes"
                    ? "changesRequested"
                    : "approved",
              ),
            );
            onDone?.();
            onClose();
            // On the review page, the decision shows where it's recorded: the Conversation tab
            // (137). A queue row stays where it is.
            if (via !== "queue") router.push(`${pathname}?tab=conversation`);
            router.refresh();
          });
        }}
      >
        <Label htmlFor="decision-message">{t("decision.message")}</Label>
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
          {t(`decision.${decision}.hint`)}
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
            <p className="font-semibold">{t("decision.rejectedSkipped")}</p>
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
            {t("decision.cancel")}
          </Button>
          <Button
            type="submit"
            variant={copy.variant === "destructive" ? "destructive" : "primary"}
            loading={pending}
          >
            {t(`decision.${decision}.button`)}
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
  const t = useTranslations("author.review.decision");
  const why = useWhy();
  const [open, setOpen] = useState<ReviewDecision | null>(null);
  if (decisions.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {decisions.map(asOption).map((option) => (
          <Button
            key={option.decision}
            variant={COPY[option.decision].variant}
            disabledReason={option.allowed ? null : why(option.why)}
            onClick={() => setOpen(option.decision)}
          >
            {t(`${option.decision}.button`)}
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
  const t = useTranslations("author.review.decision");
  const why = useWhy();
  const [open, setOpen] = useState<{ decision: ReviewDecision; dependents: Dependent[] } | null>(
    null,
  );
  const toast = useToast();
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
            aria-label={t("rowLabel", { decision: t(`${option.decision}.button`), name })}
            disabledReason={option.allowed ? null : why(option.why)}
            loading={pending && option.decision === "reject"}
            onClick={() => {
              if (option.decision !== "reject")
                return setOpen({ decision: option.decision, dependents: [] });
              start(async () => {
                const result = await dependentsAction(id);
                // No field to put it next to: an error toast that stays (138).
                if ("error" in result) return toast.error(result.error);
                setOpen({ decision: "reject", dependents: result.dependents });
              });
            }}
          >
            {t(`${option.decision}.button`)}
          </Button>
        ))}
      </div>
      {open ? (
        <DecisionDialog
          id={id}
          name={name}
          decision={open.decision}
          dependents={open.dependents}
          via="queue"
          onClose={() => setOpen(null)}
          onDone={() =>
            say(t(open.decision === "reject" ? "statusRejected" : "statusRequested", { name }))
          }
        />
      ) : null}
    </div>
  );
};
