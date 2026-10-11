"use client";

import { NAME_PROBLEM_MESSAGES, normalizeScopeName } from "@ronneai/core";
import { FolderInput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
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

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** A target as the select shows it: the asker's own personal workspace as Personal (114). */
export const targetLabel = (target: MoveTarget) =>
  target.personal ? `Personal (${target.name})` : target.name;

/** A list, its first few named, the rest counted, and those the asker can't see counted too. */
const Listed = ({
  items,
  hidden = 0,
  render = (item: string) => <span className="font-mono [overflow-wrap:anywhere]">{item}</span>,
}: {
  items: string[];
  hidden?: number;
  render?: (item: string) => React.ReactNode;
}) => (
  <ul className="grid gap-0.5">
    {items.slice(0, SHOWN).map((item) => (
      <li key={item}>{render(item)}</li>
    ))}
    {items.length > SHOWN ? <li>and {items.length - SHOWN} more</li> : null}
    {hidden > 0 ? (
      <li className="text-muted">
        and {hidden} more you can't see: in a workspace you aren't in, or a name nobody has
      </li>
    ) : null}
  </ul>
);

/** Who would see the items in the target (093, 114). */
const seenBy = (impact: MoveImpact) =>
  impact.target.personal
    ? "Only you and root"
    : impact.target.visibility === "public"
      ? "Everyone on this instance"
      : `Only ${impact.target.name}'s members and root`;

/**
 * What moving changes and what refuses it (115), from the checks: the new names, who sees and
 * reviews the items, open work stranded, not-reviewed versions, and the refusals, listed.
 */
export const MoveChanges = ({ impact }: { impact: MoveImpact }) => {
  const refusals =
    impact.outsideDependents.length +
    impact.outsideHidden +
    impact.ownDependencies.length +
    impact.ownHidden;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm">
      {refusals > 0 || impact.aliasTaken.length + impact.aliasHidden > 0 ? (
        <Notice kind="error" title="This move would break something">
          <div className="grid gap-2">
            {impact.outsideDependents.length + impact.outsideHidden > 0 ? (
              <div>
                <p>
                  Released items outside {impact.target.name} depend on its items, and would stop
                  installing for people who can't see {impact.target.name}:
                </p>
                <Listed items={impact.outsideDependents} hidden={impact.outsideHidden} />
              </div>
            ) : null}
            {impact.ownDependencies.length + impact.ownHidden > 0 ? (
              <div>
                <p>
                  Its items depend on items in a private workspace other than {impact.target.name},
                  which they couldn't depend on there:
                </p>
                <Listed
                  items={impact.ownDependencies.map((d) => `${d.item} → ${d.dependency}`)}
                  hidden={impact.ownHidden}
                />
              </div>
            ) : null}
            {impact.aliasTaken.length + impact.aliasHidden > 0 ? (
              <div>
                <p>These new names are other items' old names, and stay theirs:</p>
                <Listed items={impact.aliasTaken} hidden={impact.aliasHidden} />
              </div>
            ) : null}
          </div>
        </Notice>
      ) : null}
      <Notice kind="info" title="What changes">
        <div className="grid gap-2">
          {impact.items.length > 0 ? (
            <div>
              <p>Its {plural(impact.items.length, "item")} will be named:</p>
              <Listed
                items={impact.items.map((i) => `${i.from} → ${i.to}`)}
                render={(line) => (
                  <span className="font-mono text-xs [overflow-wrap:anywhere]">{line}</span>
                )}
              />
              <p className="mt-1 text-muted">
                Their old names keep working, and <span className="font-mono">rmk</span> moves
                projects to the new ones; in Claude Code they show as new plugins.
              </p>
            </div>
          ) : (
            <p>It has no items yet.</p>
          )}
          <p>
            <strong>Who will see them:</strong> {seenBy(impact)}.
            {impact.fewerSee
              ? " Installs by people who can no longer see them stop updating."
              : null}
          </p>
          <p>
            <strong>Who will review them:</strong>{" "}
            {impact.target.personal
              ? "nobody: personal workspaces aren't reviewed."
              : `${impact.target.name}'s moderators and admins.`}
          </p>
          {impact.notMembers.length + impact.notMembersHidden > 0 ? (
            <div>
              <p>
                Open work by people who aren't {impact.target.name}'s members: they'll be able to
                read and withdraw it, not change or submit it.
              </p>
              <Listed
                items={impact.notMembers.map((n) => `${n.item} (${n.author})`)}
                hidden={impact.notMembersHidden}
              />
            </div>
          ) : null}
          {impact.openDependents.length + impact.openHidden > 0 ? (
            <div>
              <p>Open submissions outside that depend on its items will fail at release:</p>
              <Listed items={impact.openDependents} hidden={impact.openHidden} />
            </div>
          ) : null}
          {impact.notReviewed.length > 0 ? (
            <div>
              <p>
                Not reviewed (114): someone else has to approve the move, and approving reviews
                them.
              </p>
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
      .catch(() => setTargets({ error: "Couldn't read the workspaces. Try again in a moment." }));
  }, [scope.id, loaded]);

  // The checks again as the target or the name changes, a moment after typing stops.
  useEffect(() => {
    if (loaded || !to) return;
    const timer = setTimeout(() => {
      moveImpactFor({ scopeId: scope.id, to, name })
        .then(setImpact)
        .catch(() => setImpact({ error: "Couldn't check the move. Try again in a moment." }));
    }, 250);
    return () => clearTimeout(timer);
  }, [scope.id, to, name, loaded]);

  if (state.done)
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <p role="status" className="text-sm text-fg">
          <span className="mr-2 font-mono text-xs font-semibold">OK:</span>
          {state.done === "moved"
            ? `Moved @${scope.name} to ${to}.`
            : `Asked to move @${scope.name} to ${to}.`}
        </p>
        <DialogActions>
          <Button onClick={onDone}>Done</Button>
        </DialogActions>
      </div>
    );

  const shown = state.refused ?? (impact && "items" in impact ? impact : null);
  const checked = impact && "items" in impact && impact.target.name === to ? impact : null;
  const way = checked?.way ?? null;
  const clash = checked?.clash ? checked : null;
  const blocked = !to
    ? "Pick a workspace."
    : !checked
      ? "Checking the move…"
      : checked.nameProblem
        ? "Fix the scope's name first."
        : checked.clash
          ? "Pick another name for it there."
          : checked.refused
            ? "Something listed above refuses the move."
            : null;
  const full = (n: string) => (to === "global" ? `@${n}` : `@${to}/${n}`);
  const items = checked?.items.length ?? 0;
  const question = `Move @${scope.name} and its ${plural(items, "item")} to ${to}, ${
    name === scope.name ? "as" : "renamed to"
  } ${full(name)}?`;

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
            <Label htmlFor={`move-${scope.id}-to`}>Where to</Label>
            {targets && "error" in targets ? (
              <FieldError id={`move-${scope.id}-targets`}>{targets.error}</FieldError>
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
                <option value="">Pick a workspace</option>
                {(targets?.targets ?? []).map((target) => (
                  <option key={target.name} value={target.name}>
                    {targetLabel(target)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`move-${scope.id}-name`}>Its name there</Label>
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
                ? NAME_PROBLEM_MESSAGES[checked.nameProblem]
                : clash
                  ? `${to} already has a scope called ${name}: pick another name for it there.`
                  : "Its current name, unless the workspace has a scope by that name."}
            </p>
          </div>
          {impact && "error" in impact ? (
            <FieldError id={`move-${scope.id}-impact`}>{impact.error}</FieldError>
          ) : shown ? (
            <MoveChanges impact={shown} />
          ) : null}
          {way === "request" ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`move-${scope.id}-message`}>Message (optional)</Label>
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
                  ? "Root will answer."
                  : `${to}'s admins or root will answer.`}
              </p>
            </div>
          ) : null}
          <FieldError id={`move-${scope.id}-error`}>{state.error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            {way === "request" ? (
              <Button type="submit" loading={pending} disabledReason={blocked}>
                Ask to move
              </Button>
            ) : (
              <Button disabledReason={blocked} onClick={() => setStep("confirm")}>
                Move scope
              </Button>
            )}
          </DialogActions>
        </>
      ) : step === "confirm" ? (
        <>
          <p className="text-sm text-fg">{question}</p>
          {checked ? <MoveChanges impact={checked} /> : null}
          {to === "global" ? (
            <Notice kind="warn" title="Everyone will see them">
              Its items will be everyone's on this instance.
            </Notice>
          ) : null}
          <FieldError id={`move-${scope.id}-error`}>{state.error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={() => setStep("form")}>
              Back
            </Button>
            {way === "twice" ? (
              <Button onClick={() => setStep("type")}>Continue</Button>
            ) : (
              <Button type="submit" loading={pending}>
                Move scope
              </Button>
            )}
          </DialogActions>
        </>
      ) : (
        <>
          <p className="text-sm text-fg">
            Nobody else answers this move. To confirm, type the scope's name,{" "}
            <span className="font-mono">{scope.name}</span>.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`move-${scope.id}-confirm`}>Scope name</Label>
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
              Back
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabledReason={confirm.trim() === scope.name ? null : "Type the scope's name."}
            >
              Move scope
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
      <IconButton onClick={() => setOpen(true)} label={`Move @${scope.name}`}>
        <FolderInput size={16} aria-hidden="true" />
      </IconButton>
      <Dialog open={open} onClose={close} title={`Move @${scope.name}`} size="wide">
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
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    cancelMoveFromForm,
    loaded ?? {},
  );
  if (move.status === "declined")
    return (
      <span className="grid gap-0.5 text-xs break-words text-muted">
        <span>Move to {move.toWorkspace} declined</span>
        {move.reason ? <span className="text-fg">“{move.reason}”</span> : null}
      </span>
    );
  if (state.done) return <span className="text-xs text-muted">Cancelled</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <input type="hidden" name="moveId" value={move.id} />
      <input type="hidden" name="workspace" value={workspace} />
      <span>Moving to {move.toWorkspace}</span>
      <Button
        type="submit"
        variant="text"
        loading={pending}
        aria-label={`Cancel the move to ${move.toWorkspace}`}
        className="text-xs"
      >
        Cancel
      </Button>
      {state.error ? <FieldError id={`move-${move.id}-cancel`}>{state.error}</FieldError> : null}
    </form>
  );
};
