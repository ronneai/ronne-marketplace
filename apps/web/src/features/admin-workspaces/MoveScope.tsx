"use client";

import { NAME_MAX_LENGTH, normalizeScopeName } from "@ronneai/core";
import { FolderInput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import type { MoveImpact } from "@/server/domains/workspaces/models/scope-move";
import type { MoveTarget } from "@/server/domains/workspaces/services/scope-moves";
import { askMoveFromForm, cancelMoveFromForm, moveImpactFor, moveTargetsFor } from "./actions";
import type {
  MoveActionState,
  MoveImpactResult,
  MoveTargetsResult,
  WorkspaceActionState,
} from "./types";

/** How many of a list to show before "and N more". */
const SHOWN = 8;

/** What a failed read of the targets or the impact sets as its error; the form words it. */
const LOAD_FAILED = "load_failed";

/** A name in the monospace face the sentences around it use. */
const mono = (chunks: React.ReactNode) => <span className="font-mono">{chunks}</span>;

/** A target as the select shows it: the asker's own personal workspace as Personal (114). */
const useTargetLabel = () => {
  const t = useTranslations("admin.move");
  return (target: MoveTarget) =>
    target.personal ? t("personalTarget", { name: target.name }) : target.name;
};

/** A list, its first few named, the rest counted, and those the asker can't see counted too. */
const Listed = ({
  items,
  hidden = 0,
  render = (item: string) => <span className="font-mono [overflow-wrap:anywhere]">{item}</span>,
}: {
  items: string[];
  hidden?: number;
  render?: (item: string) => React.ReactNode;
}) => {
  const t = useTranslations("admin.move");
  return (
    <ul className="grid gap-0.5">
      {items.slice(0, SHOWN).map((item) => (
        <li key={item}>{render(item)}</li>
      ))}
      {items.length > SHOWN ? <li>{t("more", { count: items.length - SHOWN })}</li> : null}
      {hidden > 0 ? <li className="text-muted">{t("hidden", { count: hidden })}</li> : null}
    </ul>
  );
};

/** Who would see the items in the target (093, 114). */
const useSeenBy = () => {
  const t = useTranslations("admin.move.seenBy");
  return (impact: MoveImpact) =>
    impact.target.personal
      ? t("personal")
      : impact.target.visibility === "public"
        ? t("public")
        : t("private", { workspace: impact.target.name });
};

/**
 * What moving changes and what refuses it (115), from the checks: the new names, who sees and
 * reviews the items, open work stranded, not-reviewed versions, and the refusals, listed.
 */
export const MoveChanges = ({ impact }: { impact: MoveImpact }) => {
  const t = useTranslations("admin.move");
  const seenBy = useSeenBy();
  const refusals =
    impact.outsideDependents.length +
    impact.outsideHidden +
    impact.ownDependencies.length +
    impact.ownHidden;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm">
      {refusals > 0 || impact.aliasTaken.length + impact.aliasHidden > 0 ? (
        <Notice kind="error" title={t("breakTitle")}>
          <div className="grid gap-2">
            {impact.outsideDependents.length + impact.outsideHidden > 0 ? (
              <div>
                <p>{t("outsideDependents", { workspace: impact.target.name })}</p>
                <Listed items={impact.outsideDependents} hidden={impact.outsideHidden} />
              </div>
            ) : null}
            {impact.ownDependencies.length + impact.ownHidden > 0 ? (
              <div>
                <p>{t("ownDependencies", { workspace: impact.target.name })}</p>
                <Listed
                  items={impact.ownDependencies.map((d) => `${d.item} → ${d.dependency}`)}
                  hidden={impact.ownHidden}
                />
              </div>
            ) : null}
            {impact.aliasTaken.length + impact.aliasHidden > 0 ? (
              <div>
                <p>{t("aliasTaken")}</p>
                <Listed items={impact.aliasTaken} hidden={impact.aliasHidden} />
              </div>
            ) : null}
          </div>
        </Notice>
      ) : null}
      <Notice kind="info" title={t("changesTitle")}>
        <div className="grid gap-2">
          {impact.items.length > 0 ? (
            <div>
              <p>{t("itemsNamed", { count: impact.items.length })}</p>
              <Listed
                items={impact.items.map((i) => `${i.from} → ${i.to}`)}
                render={(line) => (
                  <span className="font-mono text-xs [overflow-wrap:anywhere]">{line}</span>
                )}
              />
              <p className="mt-1 text-muted">{t.rich("oldNames", { mono })}</p>
            </div>
          ) : (
            <p>{t("noItems")}</p>
          )}
          <p>
            {t.rich("whoSee", {
              who: seenBy(impact),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
            {impact.fewerSee ? ` ${t("fewerSee")}` : null}
          </p>
          <p>
            {t.rich("whoReview", {
              who: impact.target.personal
                ? t("reviewNobody")
                : t("reviewBy", { workspace: impact.target.name }),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          {impact.notMembers.length + impact.notMembersHidden > 0 ? (
            <div>
              <p>{t("notMembers", { workspace: impact.target.name })}</p>
              <Listed
                items={impact.notMembers.map((n) => `${n.item} (${n.author})`)}
                hidden={impact.notMembersHidden}
              />
            </div>
          ) : null}
          {impact.openDependents.length + impact.openHidden > 0 ? (
            <div>
              <p>{t("openDependents")}</p>
              <Listed items={impact.openDependents} hidden={impact.openHidden} />
            </div>
          ) : null}
          {impact.notReviewed.length > 0 ? (
            <div>
              <p>{t("notReviewed")}</p>
              <Listed items={impact.notReviewed} />
            </div>
          ) : null}
        </div>
      </Notice>
    </div>
  );
};

type Step = "form" | "confirm" | "type";

/**
 * Move… (115): where to, the scope's name there (a clash asks for another), what changes, a
 * message when it's a request, and the button that says what will happen. A move made at once
 * confirms; root's, and a `global` admin's into `global`, also has the scope's name typed.
 */
export const MoveForm = ({
  scope,
  workspace,
  onDone,
  loaded,
}: {
  scope: { id: string; name: string };
  /** The scope's workspace now, for its page's refresh. */
  workspace: string;
  onDone: () => void;
  /** The targets and the impact when already known (its tests); else they're read. */
  loaded?: {
    targets: MoveTargetsResult;
    impact?: MoveImpactResult;
    to?: string;
    /** The step to show first: the confirmations, for their tests. */
    step?: Step;
    /** What the last submit answered, for its tests. */
    state?: MoveActionState;
    /** The name typed for it there, for its tests. */
    name?: string;
  };
}) => {
  const t = useTranslations("admin.move");
  const problems = useTranslations("common.nameProblem");
  const targetLabel = useTargetLabel();
  const [state, action, pending] = useActionState<MoveActionState, FormData>(
    askMoveFromForm,
    loaded?.state ?? {},
  );
  const [targets, setTargets] = useState<MoveTargetsResult | null>(loaded?.targets ?? null);
  const [to, setTo] = useState(loaded?.to ?? "");
  const [typed, setTyped] = useState(loaded?.name ?? scope.name);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<Step>(loaded?.step ?? "form");
  const [impact, setImpact] = useState<MoveImpactResult | null>(loaded?.impact ?? null);
  const name = normalizeScopeName(typed);

  useEffect(() => {
    if (loaded) return;
    moveTargetsFor(scope.id)
      .then(setTargets)
      .catch(() => setTargets({ error: LOAD_FAILED }));
  }, [scope.id, loaded]);

  // The checks again as the target or the name changes, a moment after typing stops.
  useEffect(() => {
    if (loaded || !to) return;
    const timer = setTimeout(() => {
      moveImpactFor({ scopeId: scope.id, to, name })
        .then(setImpact)
        .catch(() => setImpact({ error: LOAD_FAILED }));
    }, 250);
    return () => clearTimeout(timer);
  }, [scope.id, to, name, loaded]);

  useToastWhen(
    state,
    state.done === "moved"
      ? t("doneMoved", { scope: scope.name, workspace: to })
      : state.done
        ? t("doneAsked", { scope: scope.name, workspace: to })
        : null,
    "ok",
    onDone,
  );
  if (state.done) return null;
  const shown = state.refused ?? (impact && "items" in impact ? impact : null);
  const checked = impact && "items" in impact && impact.target.name === to ? impact : null;
  const way = checked?.way ?? null;
  const clash = checked?.clash ? checked : null;
  const blocked = !to
    ? t("blocked.pick")
    : !checked
      ? t("blocked.checking")
      : checked.nameProblem
        ? t("blocked.fixName")
        : checked.clash
          ? t("blocked.pickAnother")
          : checked.refused
            ? t("blocked.refuses")
            : null;
  const full = (n: string) => (to === "global" ? `@${n}` : `@${to}/${n}`);
  const items = checked?.items.length ?? 0;
  const question = t("question", {
    scope: scope.name,
    items,
    workspace: to,
    renamed: String(name !== scope.name),
    full: full(name),
  });

  return (
    <form
      action={action}
      // Enter in a field submits the form: before the confirmations, it goes to them instead (a
      // request has none).
      onSubmit={(event) => {
        if (step === "form" && way !== "request") {
          event.preventDefault();
          if (!blocked) setStep("confirm");
        }
      }}
      // One column as wide as the dialog, never its widest field (115): a select is as wide as its
      // longest option in iOS Safari.
      className="grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0"
    >
      <input type="hidden" name="scopeId" value={scope.id} />
      <input type="hidden" name="workspace" value={workspace} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="name" value={name} />
      {step === "form" ? (
        <>
          <Help id="move-who" />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
            <Label htmlFor={`move-${scope.id}-to`}>{t("whereTo")}</Label>
            {targets && "error" in targets ? (
              <FieldError id={`move-${scope.id}-targets`}>
                {targets.error === LOAD_FAILED ? t("targetsFailed") : targets.error}
              </FieldError>
            ) : (
              <select
                id={`move-${scope.id}-to`}
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setImpact(null);
                }}
                className={selectClasses}
              >
                <option value="">{t("pick")}</option>
                {(targets?.targets ?? []).map((target) => (
                  <option key={target.name} value={target.name}>
                    {targetLabel(target)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`move-${scope.id}-name`}>{t("nameThere")}</Label>
            <input
              id={`move-${scope.id}-name`}
              value={typed}
              maxLength={65}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              aria-describedby={`move-${scope.id}-name-hint`}
              aria-invalid={checked?.nameProblem || clash ? true : undefined}
              className={inputClasses}
            />
            <p id={`move-${scope.id}-name-hint`} className="text-xs text-muted">
              {checked?.nameProblem
                ? problems(checked.nameProblem, { max: NAME_MAX_LENGTH })
                : clash
                  ? t("clash", { workspace: to, name })
                  : t("nameHint")}
            </p>
          </div>
          {impact && "error" in impact ? (
            <FieldError id={`move-${scope.id}-impact`}>
              {impact.error === LOAD_FAILED ? t("impactFailed") : impact.error}
            </FieldError>
          ) : shown ? (
            <MoveChanges impact={shown} />
          ) : null}
          {way === "request" ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`move-${scope.id}-message`}>{t("message")}</Label>
              <textarea
                id={`move-${scope.id}-message`}
                name="message"
                maxLength={500}
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className={inputClasses}
              />
              <p className="text-xs text-muted">
                {checked?.answeredBy === "root"
                  ? t("rootAnswers")
                  : t("adminsAnswer", { workspace: to })}
              </p>
            </div>
          ) : null}
          <FieldError id={`move-${scope.id}-error`}>{state.error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={onDone}>
              {t("cancel")}
            </Button>
            {way === "request" ? (
              <Button type="submit" loading={pending} disabledReason={blocked}>
                {t("ask")}
              </Button>
            ) : (
              <Button disabledReason={blocked} onClick={() => setStep("confirm")}>
                {t("moveScope")}
              </Button>
            )}
          </DialogActions>
        </>
      ) : step === "confirm" ? (
        <>
          <p className="text-sm text-fg">{question}</p>
          {checked ? <MoveChanges impact={checked} /> : null}
          {to === "global" ? (
            <Notice kind="warn" title={t("everyoneTitle")}>
              {t("everyoneBody")}
            </Notice>
          ) : null}
          <FieldError id={`move-${scope.id}-error`}>{state.error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={() => setStep("form")}>
              {t("back")}
            </Button>
            {way === "twice" ? (
              <Button onClick={() => setStep("type")}>{t("continue")}</Button>
            ) : (
              <Button type="submit" loading={pending}>
                {t("moveScope")}
              </Button>
            )}
          </DialogActions>
        </>
      ) : (
        <>
          <p className="text-sm text-fg">{t.rich("typeIntro", { scope: scope.name, mono })}</p>
          <div className="grid gap-1.5">
            <Label htmlFor={`move-${scope.id}-confirm`}>{t("scopeName")}</Label>
            <input
              id={`move-${scope.id}-confirm`}
              name="confirm"
              value={confirm}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setConfirm(event.target.value)}
              className={inputClasses}
            />
          </div>
          <FieldError id={`move-${scope.id}-error`}>{state.error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={() => setStep("confirm")}>
              {t("back")}
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabledReason={confirm.trim() === scope.name ? null : t("blocked.typeName")}
            >
              {t("moveScope")}
            </Button>
          </DialogActions>
        </>
      )}
    </form>
  );
};

/** Move… on a scope's row (115), for root and its workspace's admins. */
export const MoveScopeButton = ({
  scope,
  workspace,
}: {
  scope: { id: string; name: string };
  workspace: string;
}) => {
  const t = useTranslations("admin.move");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  // Closing shows the page as it is now: the row's move, or the scope gone from it.
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
    router.refresh();
  };
  return (
    <>
      <IconButton onClick={() => setOpen(true)} label={t("moveLabel", { scope: scope.name })}>
        <FolderInput size={16} aria-hidden="true" />
      </IconButton>
      <Dialog
        open={open}
        onClose={close}
        title={t("moveTitle", { scope: scope.name })}
        size="large"
      >
        {open ? <MoveForm key={round} scope={scope} workspace={workspace} onDone={close} /> : null}
      </Dialog>
    </>
  );
};

/**
 * A scope row's move (115), under its description: "Moving to acme" with Cancel while open, or
 * "Move to acme declined" with the reason, until the next request. It wraps, the reason too.
 */
export const MoveState = ({
  move,
  workspace,
  loaded,
}: {
  move: { id: string; toWorkspace: string; status: string; reason: string | null };
  workspace: string;
  /** What the last Cancel answered, for its tests. */
  loaded?: WorkspaceActionState;
}) => {
  const t = useTranslations("admin.move");
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    cancelMoveFromForm,
    loaded ?? {},
  );
  useToastWhen(state, state.error, "error");
  if (move.status === "declined")
    return (
      <span className="grid gap-0.5 text-xs break-words text-muted">
        <span>{t("declined", { workspace: move.toWorkspace })}</span>
        {move.reason ? <span className="text-fg">“{move.reason}”</span> : null}
      </span>
    );
  if (state.done) return <span className="text-xs text-muted">{t("cancelled")}</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <input type="hidden" name="moveId" value={move.id} />
      <input type="hidden" name="workspace" value={workspace} />
      <span>{t("moving", { workspace: move.toWorkspace })}</span>
      <Button
        type="submit"
        variant="text"
        loading={pending}
        aria-label={t("cancelMove", { workspace: move.toWorkspace })}
        className="text-xs"
      >
        {t("cancel")}
      </Button>
    </form>
  );
};
