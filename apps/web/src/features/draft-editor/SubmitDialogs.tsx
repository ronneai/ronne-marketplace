"use client";

import { hasErrors } from "@ronneai/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError } from "@/components/ui/Field";
import { useToast } from "@/components/ui/toast";
import { IssueList } from "@/components/validation/IssueList";
import {
  checkSubmissionAction,
  deleteSubmissionAction,
  restoreAction,
  submitDraftAction,
  withdrawAction,
  withdrawInfoAction,
} from "./actions";
import type { GroupMember, SubmitPreview, SubmitResult } from "./types";

/** Names as the language lists them: "@a", "@a and @b", "@a, @b, and @c" in English (131). */
const useNames = () => {
  const format = useFormatter();
  return (list: readonly string[]) => format.list(list, { type: "conjunction" });
};

/**
 * Submit's words in the person's language (131). `blocked` is why Submit is off (112), or null:
 * the item's own errors, or the first of its drafts that isn't ready; nothing while it's checking.
 * `label` is the button's words: Submit alone, or with how many more of the person's drafts; in
 * the author's personal workspace (114) it's approved as it's sent, so not "for review".
 */
export const useSubmitWords = () => {
  const t = useTranslations("author.editor.submit");
  return {
    blocked: (result: SubmitPreview | SubmitResult | null): string | null => {
      if (!result) return null;
      if (!result.ok) return result.error;
      const waiting = "members" in result ? result.members.find((m) => !m.ready) : undefined;
      if (waiting) return t("memberNotReady", { name: waiting.name });
      return hasErrors(result.issues) ? t("fixErrors") : null;
    },
    label: (resubmit: boolean, members: readonly GroupMember[], personal = false): string =>
      members.length === 0
        ? t(personal ? "label" : "forReview", { resubmit: String(resubmit) })
        : t("withMore", { resubmit: String(resubmit), count: members.length }),
  };
};

/**
 * What the dialog does after Submit (112): refused, it says so ("Something changed since the
 * check") and checks again; with drafts sent along, it says what went; otherwise it closes.
 */
export const afterSubmit = (
  submitted: SubmitResult,
): { next: "recheck" } | { next: "outcome"; sent: string[] } | { next: "close" } =>
  !submitted.ok
    ? { next: "recheck" }
    : submitted.sent && submitted.sent.length > 0
      ? { next: "outcome", sent: submitted.sent }
      : { next: "close" };

/** What went for review (112): the item, and the drafts that went with it. */
export const SubmitOutcome = ({
  itemName,
  sent,
  personal = false,
}: {
  itemName: string;
  sent: readonly string[];
  personal?: boolean;
}) => {
  const t = useTranslations("author.editor");
  const names = useNames();
  return (
    <p role="status" className="text-sm text-fg">
      <span className="mr-2 font-mono text-xs font-semibold">{t("ok")}</span>
      {t(personal ? "submit.outcomePersonal" : "submit.outcome", {
        item: itemName,
        names: names(sent),
      })}
    </p>
  );
};

/**
 * The person's own drafts that go with the item (112), dependencies first: each with what brings
 * it in, whether it and another need each other, and its checks, linking to the draft.
 */
export const GroupList = ({
  itemName,
  members,
}: {
  itemName: string;
  members: readonly GroupMember[];
}) => {
  const t = useTranslations("author.editor.submit");
  const names = useNames();
  return (
    <section aria-labelledby="submit-group" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="submit-group" className="text-sm font-semibold text-fg">
          {t("goesWith", { count: members.length })}
        </h3>
        <Help id="submit-together" />
      </div>
      <ul className="grid gap-3" aria-label={t("groupLabel", { item: itemName })}>
        {members.map((member) => (
          <li key={member.id} className="grid gap-1 rounded-control border border-hairline p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/submissions/${member.id}`}
                className="font-mono text-sm text-fg underline"
              >
                {member.name}
              </Link>
              {member.inCycle ? <Badge tone="warning">{t("needEachOther")}</Badge> : null}
              <Badge tone={member.ready ? "accent" : "error"}>
                {t(member.ready ? "ready" : "notReady")}
              </Badge>
            </div>
            {member.neededBy.length > 0 ? (
              <p className="text-xs text-muted">
                {t("neededBy", { names: names(member.neededBy) })}
              </p>
            ) : null}
            {member.issues.length > 0 ? <IssueList issues={member.issues} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * Submit for review (feature 013). It first runs every check on the saved files, 011's and the
 * registry's, and lists the results; Submit is only offered when there are no errors. Unsaved
 * changes have to be saved first: the server only checks what's saved.
 */
export const SubmitDialog = ({
  resubmit = false,
  draftId,
  itemName,
  dirty,
  onClose,
  personal = false,
}: {
  /** Sent back for changes (014): the same checks, then the next revision. */
  resubmit?: boolean;
  draftId: string;
  itemName: string;
  dirty: boolean;
  onClose: () => void;
  /** In the author's personal workspace (114): approved as it's sent. */
  personal?: boolean;
}) => {
  const t = useTranslations("author.editor");
  const said = useTranslations("common.done");
  const toast = useToast();
  const words = useSubmitWords();
  const router = useRouter();
  const [result, setResult] = useState<SubmitPreview | SubmitResult | null>(null);
  const [sent, setSent] = useState<string[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const members = result?.ok && "members" in result ? result.members : [];
  const label = words.label(resubmit, members, personal);
  const [checking, startCheck] = useTransition();
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (dirty) return;
    startCheck(async () => setResult(await checkSubmissionAction(draftId)));
  }, [dirty, draftId]);

  const blocked = words.blocked(result);
  // Once something went for review, closing in any way shows the page as it is now.
  const closeSent = () => {
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onClose={sent ? closeSent : onClose} title={words.label(resubmit, [], personal)}>
      {dirty ? (
        <div className="grid gap-4">
          <p className="text-sm text-fg">{t("submit.saveFirst")}</p>
          <DialogActions>
            <Button variant="secondary" onClick={onClose}>
              {t("close")}
            </Button>
          </DialogActions>
        </div>
      ) : sent ? (
        <div className="grid gap-4">
          <SubmitOutcome itemName={itemName} sent={sent} personal={personal} />
          <DialogActions>
            <Button onClick={closeSent}>{t("close")}</Button>
          </DialogActions>
        </div>
      ) : (
        <div className="grid gap-4">
          {checking || !result ? (
            <p role="status" className="text-sm text-muted">
              {t("submit.checking", { item: itemName })}
            </p>
          ) : !result.ok && result.issues.length === 0 ? (
            <FieldError id="submit-error">{result.error}</FieldError>
          ) : hasErrors(result.issues) ? (
            <div className="grid gap-2">
              <p className="text-sm text-fg">{result.ok ? t("submit.fixThese") : result.error}</p>
              <IssueList issues={result.issues} />
            </div>
          ) : (
            <div className="grid gap-2">
              <p role="status" className="text-sm text-fg">
                <span className="mr-2 font-mono text-xs font-semibold">{t("ok")}</span>
                {t("submit.allPassed")}
              </p>
              {result.issues.length > 0 ? <IssueList issues={result.issues} /> : null}
              <p className="text-sm text-muted">
                {t(personal ? "submit.afterPersonal" : "submit.after")}
              </p>
              <Help id={personal ? "personal-review" : "after-submit"} />
            </div>
          )}
          {refused ? <FieldError id="submit-refused">{refused}</FieldError> : null}
          {members.length > 0 && !checking ? (
            <GroupList itemName={itemName} members={members} />
          ) : null}
          <DialogActions>
            <Button variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              disabled={checking || !result}
              disabledReason={blocked}
              loading={submitting}
              onClick={() =>
                startSubmit(async () => {
                  const then = afterSubmit(await submitDraftAction(draftId));
                  if (then.next === "recheck") {
                    setRefused(t("submit.changed"));
                    return setResult(await checkSubmissionAction(draftId));
                  }
                  if (then.next === "outcome") return setSent(then.sent);
                  toast.ok(said("submitted"));
                  onClose();
                  router.refresh();
                })
              }
            >
              {label}
            </Button>
          </DialogActions>
        </div>
      )}
    </Dialog>
  );
};

/** Withdraw (013): archive it, or delete it for good when no reviewer took part (057). */
export const WithdrawDialog = ({
  draftId,
  itemName,
  dependents = 0,
  canDelete = false,
  onClose,
}: {
  draftId: string;
  itemName: string;
  /** Open submissions that depend on it (056): they're blocked once it's withdrawn. */
  dependents?: number;
  canDelete?: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("author.editor");
  const said = useTranslations("common.done");
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"archive" | "delete">("archive");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={t("withdrawDialog.title", { item: itemName })}>
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="sr-only">{t("withdrawDialog.legend")}</legend>
          {(["archive", "delete"] as const).map((value) => {
            const disabled = value === "delete" && !canDelete;
            return (
              <label
                key={value}
                className={`grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded-control border p-3 text-sm ${
                  mode === value ? "border-accent" : "border-hairline"
                } ${disabled ? "text-muted" : "cursor-pointer text-fg"}`}
              >
                <input
                  type="radio"
                  name="withdrawMode"
                  value={value}
                  checked={mode === value}
                  disabled={disabled}
                  onChange={() => setMode(value)}
                  className="mt-0.5 size-4 accent-(--accent)"
                />
                <span className="font-semibold">{t(`withdrawDialog.${value}`)}</span>
                <span className="col-start-2 text-muted">
                  {t(disabled ? "withdrawDialog.history" : `withdrawDialog.${value}Text`)}
                </span>
              </label>
            );
          })}
        </fieldset>
        <Help id="withdraw" />
        {dependents > 0 ? (
          <p className="text-sm text-warning-text">
            {t("withdrawDialog.dependents", { count: dependents, item: itemName })}
          </p>
        ) : null}
        <FieldError id="withdraw-error">{error}</FieldError>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            {t("keep")}
          </Button>
          <Button
            variant={mode === "delete" ? "destructive" : "primary"}
            loading={pending}
            onClick={() =>
              start(async () => {
                const result = await withdrawAction(draftId, mode);
                if (!result.ok) {
                  // A reviewer took part meanwhile: only archiving is left.
                  if (result.reviewHistory) setMode("archive");
                  return setError(result.error);
                }
                toast.ok(said("archived"));
                onClose();
                router.refresh();
              })
            }
          >
            {t(`withdrawDialog.${mode}`)}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
};

/** Deleting an archived submission for good (057): it can't be undone, so it asks first. */
export const DeleteArchivedDialog = ({
  draftId,
  itemName,
  onClose,
  fromList = false,
}: {
  draftId: string;
  itemName: string;
  onClose: () => void;
  /** Opened from My submissions: stay there; from its own page, go to My submissions. */
  fromList?: boolean;
}) => {
  const t = useTranslations("author.editor");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={t("deleteArchivedTitle", { item: itemName })}>
      <div className="grid gap-4">
        <p className="text-sm text-fg">{t("withdrawDialog.deleteText")}</p>
        <FieldError id="delete-error">{error}</FieldError>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            {t("keep")}
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              start(async () => {
                const result = await deleteSubmissionAction(draftId);
                if (!result.ok) return setError(result.error);
                onClose();
                if (fromList) router.refresh();
                else router.push("/submissions");
              })
            }
          >
            {t("deleteForGood")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
};

/**
 * Withdraw from a list or the review page (058): a text-only button that loads what the dialog
 * needs (whether it can be deleted, its dependents) when it's clicked, then opens it.
 */
export const WithdrawButton = ({ draftId, itemName }: { draftId: string; itemName: string }) => {
  const t = useTranslations("author.editor");
  const [info, setInfo] = useState<{ canDelete: boolean; dependents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="text"
        aria-label={t("withdrawDialog.label", { item: itemName })}
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await withdrawInfoAction(draftId);
            if ("error" in result) return setError(result.error);
            setInfo(result);
          })
        }
      >
        {t("withdraw")}
      </Button>
      <FieldError id={`withdraw-info-error-${draftId}`}>{error}</FieldError>
      {info ? (
        <WithdrawDialog
          draftId={draftId}
          itemName={itemName}
          canDelete={info.canDelete}
          dependents={info.dependents}
          onClose={() => setInfo(null)}
        />
      ) : null}
    </>
  );
};

/** Restore (057): an archived submission comes back as a draft. Nothing is lost, so no question. */
export const RestoreButton = ({ draftId }: { draftId: string }) => {
  const t = useTranslations("author.editor");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await restoreAction(draftId);
            if (!result.ok) return setError(result.error);
            router.refresh();
          })
        }
      >
        {t("restore")}
      </Button>
      <FieldError id={`restore-error-${draftId}`}>{error}</FieldError>
    </>
  );
};
