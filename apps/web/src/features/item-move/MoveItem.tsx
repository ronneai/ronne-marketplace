"use client";

import { parseItemName } from "@ronneai/core";
import { FolderInput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { itemPath } from "@/components/catalogue/ItemCard";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label, selectClasses } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { ItemMoveImpact } from "@/server/domains/workspaces/models/item-move";
import type { ItemMoveView } from "@/server/domains/workspaces/services/item-moves";
import { askItemMoveFromForm, cancelItemMoveFromForm, itemMoveImpactFor } from "./actions";
import type { ItemMoveActionState, ItemMoveCancelState, ItemMoveImpactResult } from "./types";

/** How many of a list to show before "and N more". */
const SHOWN = 8;

/** What a failed read of the impact sets as its error; the form words it. */
const LOAD_FAILED = "load_failed";

/** A name in the monospace face the sentences around it use. */
const mono = (chunks: React.ReactNode) => (
  <span className="font-mono [overflow-wrap:anywhere]">{chunks}</span>
);

/** The scope part of a full item name: `@acme/devops/deploy` → `@acme/devops`. */
const scopeOf = (name: string) => name.slice(0, name.lastIndexOf("/"));

/**
 * What moving changes (134), from the checks: the new name, the old one kept, Claude Code's new
 * plugin, the open work that takes the new name; or why the name is taken there.
 */
export const MoveItemChanges = ({ impact }: { impact: ItemMoveImpact }) => {
  const t = useTranslations("item.move");
  const shown = impact.dependents.slice(0, SHOWN);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm">
      {impact.clash ? (
        <Notice kind="error" title={t("clashTitle")}>
          {t("clash", {
            clash: impact.clash,
            scope: scopeOf(impact.newName),
            name: impact.item.name,
            newName: impact.newName,
          })}
        </Notice>
      ) : null}
      <Notice kind="info" title={t("changesTitle")}>
        <div className="grid gap-2">
          <p>{t.rich("newName", { from: impact.item.fullName, to: impact.newName, mono })}</p>
          <p className="text-muted">{t("oldName")}</p>
          <p className="text-muted">{t("claudeCode")}</p>
          {impact.proposals > 0 ? <p>{t("proposals", { count: impact.proposals })}</p> : null}
          {impact.dependents.length + impact.dependentsHidden > 0 ? (
            <div>
              <p>{t("dependents")}</p>
              <ul className="grid gap-0.5">
                {shown.map((name) => (
                  <li key={name} className="font-mono text-xs [overflow-wrap:anywhere]">
                    {name}
                  </li>
                ))}
                {impact.dependents.length > SHOWN ? (
                  <li>{t("more", { count: impact.dependents.length - SHOWN })}</li>
                ) : null}
                {impact.dependentsHidden > 0 ? (
                  <li className="text-muted">{t("hidden", { count: impact.dependentsHidden })}</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      </Notice>
    </div>
  );
};

type Step = "form" | "confirm";

/**
 * Move to another scope… (134): which scope, what changes, a message when it's a request, and the
 * button that says what will happen. A move made at once asks once more.
 */
export const MoveItemForm = ({
  item,
  view,
  onDone,
  loaded,
}: {
  item: { id: string; fullName: string };
  view: Pick<ItemMoveView, "workspace" | "way" | "targets">;
  /** Closes the dialog; with the item's name now when it moved. */
  onDone: (newName?: string) => void;
  /** The impact and the step when already known (its tests); else they're read. */
  loaded?: {
    to?: string;
    impact?: ItemMoveImpactResult;
    step?: Step;
    state?: ItemMoveActionState;
  };
}) => {
  const t = useTranslations("item.move");
  const [state, action, pending] = useActionState<ItemMoveActionState, FormData>(
    askItemMoveFromForm,
    loaded?.state ?? {},
  );
  const [to, setTo] = useState(loaded?.to ?? "");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<Step>(loaded?.step ?? "form");
  const [impact, setImpact] = useState<ItemMoveImpactResult | null>(loaded?.impact ?? null);

  // The checks as the scope changes.
  useEffect(() => {
    if (loaded || !to) return;
    let current = true;
    itemMoveImpactFor({ itemId: item.id, toScopeId: to })
      .then((result) => {
        if (current) setImpact(result);
      })
      .catch(() => {
        if (current) setImpact({ error: LOAD_FAILED });
      });
    return () => {
      current = false;
    };
  }, [item.id, to, loaded]);

  if (state.done)
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <p role="status" className="text-sm text-fg [overflow-wrap:anywhere]">
          <span className="mr-2 font-mono text-xs font-semibold">{t("ok")}</span>
          {state.done === "moved"
            ? t("doneMoved", { newName: state.newName ?? "" })
            : t("doneAsked", { scope: scopeOf(state.newName ?? "") })}
        </p>
        <DialogActions>
          <Button onClick={() => onDone(state.done === "moved" ? state.newName : undefined)}>
            {t("done")}
          </Button>
        </DialogActions>
      </div>
    );

  const checked = impact && "item" in impact && impact.target.id === to ? impact : null;
  const shown = state.refused ?? checked;
  const blocked = !to
    ? t("blocked.pick")
    : !checked
      ? t("blocked.checking")
      : checked.refused
        ? t("blocked.clash")
        : null;
  const request = view.way === "request";
  const target = view.targets.find((scope) => scope.id === to);

  return (
    <form
      action={action}
      // Enter in a field submits the form: a move made at once goes to its confirmation instead.
      onSubmit={(event) => {
        if (step === "form" && !request) {
          event.preventDefault();
          if (!blocked) setStep("confirm");
        }
      }}
      // One column as wide as the dialog, never its widest field: a select is as wide as its
      // longest option in iOS Safari (115).
      className="grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0"
    >
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="toScopeId" value={to} />
      {step === "form" ? (
        <>
          <Help id="item-move-who" />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
            <Label htmlFor={`move-item-${item.id}-to`}>{t("whereTo")}</Label>
            <select
              id={`move-item-${item.id}-to`}
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setImpact(null);
              }}
              className={selectClasses}
            >
              <option value="">{t("pick")}</option>
              {view.targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            {/* The chosen scope's description under the select, not in it: an option is as wide
                as its text in iOS Safari (115). */}
            {target?.description ? (
              <p className="text-xs text-muted [overflow-wrap:anywhere]">{target.description}</p>
            ) : null}
          </div>
          {impact && "error" in impact ? (
            <FieldError id={`move-item-${item.id}-impact`}>
              {impact.error === LOAD_FAILED ? t("impactFailed") : impact.error}
            </FieldError>
          ) : shown ? (
            <MoveItemChanges impact={shown} />
          ) : null}
          {request ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`move-item-${item.id}-message`}>{t("message")}</Label>
              <textarea
                id={`move-item-${item.id}-message`}
                name="message"
                maxLength={500}
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className={inputClasses}
              />
              <p className="text-xs text-muted">{t("answeredBy", { workspace: view.workspace })}</p>
            </div>
          ) : null}
          <FieldError id={`move-item-${item.id}-error`}>{state.error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={() => onDone()}>
              {t("cancel")}
            </Button>
            {request ? (
              <Button type="submit" loading={pending} disabledReason={blocked}>
                {t("ask")}
              </Button>
            ) : (
              <Button disabledReason={blocked} onClick={() => setStep("confirm")}>
                {t("moveItem")}
              </Button>
            )}
          </DialogActions>
        </>
      ) : (
        <>
          <p className="text-sm text-fg">
            {t.rich("question", {
              item: item.fullName,
              scope: checked ? scopeOf(checked.newName) : "",
              newName: checked?.newName ?? "",
              mono,
            })}
          </p>
          {checked ? <MoveItemChanges impact={checked} /> : null}
          <FieldError id={`move-item-${item.id}-error`}>{state.error}</FieldError>
          <DialogActions>
            <Button variant="ghost" onClick={() => setStep("form")}>
              {t("back")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("moveItem")}
            </Button>
          </DialogActions>
        </>
      )}
    </form>
  );
};

/** The item's page under a full name (`@acme/devops/deploy`), or null when it isn't one. */
const pathOf = (fullName: string) => {
  const ref = parseItemName(fullName);
  return ref ? itemPath(ref) : null;
};

/** Move to another scope… on the item page (134), for members of its workspace and root. */
export const MoveItemButton = ({
  item,
  view,
}: {
  item: { id: string; fullName: string };
  view: Pick<ItemMoveView, "workspace" | "way" | "targets">;
}) => {
  const t = useTranslations("item.move");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  // Closing shows the item as it is now: its new page when it moved, else this one again.
  const close = (newName?: string) => {
    setOpen(false);
    setRound((r) => r + 1);
    const moved = newName ? pathOf(newName) : null;
    if (moved) router.push(moved);
    else router.refresh();
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FolderInput size={16} aria-hidden="true" />
        {t("button")}
      </Button>
      <Dialog
        open={open}
        onClose={() => close()}
        title={t("title", { item: item.fullName })}
        size="large"
      >
        {open ? <MoveItemForm key={round} item={item} view={view} onDone={close} /> : null}
      </Dialog>
    </>
  );
};

/**
 * The item's move request on its page (134): "Moving to @acme/devops, asked by Ana" with Cancel
 * while open, for its asker and whoever may answer it; "Move to @acme/devops declined" with the
 * reason, for its asker, until the next request.
 */
export const MoveItemNotice = ({
  latest,
  loaded,
}: {
  latest: NonNullable<ItemMoveView["latest"]>;
  /** What the last Cancel answered, for its tests. */
  loaded?: ItemMoveCancelState;
}) => {
  const t = useTranslations("item.move");
  const router = useRouter();
  const [state, action, pending] = useActionState<ItemMoveCancelState, FormData>(
    async (previous, form) => {
      const result = await cancelItemMoveFromForm(previous, form);
      if (result.done) router.refresh();
      return result;
    },
    loaded ?? {},
  );
  if (latest.status === "declined")
    return (
      <Notice kind="warn" title={t("notice.declined", { scope: latest.to })}>
        {latest.reason ? <p className="[overflow-wrap:anywhere]">“{latest.reason}”</p> : null}
      </Notice>
    );
  if (state.done)
    return (
      <p role="status" className="text-sm text-muted">
        {t("notice.cancelled")}
      </p>
    );
  return (
    <Notice
      kind="info"
      title={
        latest.mine
          ? t("notice.movingMine", { scope: latest.to })
          : t("notice.moving", {
              scope: latest.to,
              name: latest.askedByName ?? t("formerUser"),
            })
      }
    >
      <form action={action} className="flex flex-wrap items-center gap-x-2 text-xs">
        <input type="hidden" name="moveId" value={latest.id} />
        <Button
          type="submit"
          variant="text"
          loading={pending}
          aria-label={t("notice.cancelMove", { scope: latest.to })}
          className="text-xs"
        >
          {t("notice.cancel")}
        </Button>
        {state.error ? (
          <FieldError id={`move-${latest.id}-cancel`}>{state.error}</FieldError>
        ) : null}
      </form>
    </Notice>
  );
};
