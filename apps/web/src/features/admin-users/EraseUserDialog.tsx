"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, Input, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import { eraseUserFromForm } from "./actions";
import { dataHref } from "./DownloadDataDialog";
import type { AdminActionState } from "./types";

export type ErasableUser = { id: string; email: string; name: string; role: "root" | "user" };

/** Whether what root typed is the account's email: any case, spaces around it ignored. */
export const confirmsEmail = (typed: string, email: string): boolean =>
  typed.trim().toLowerCase() === email;

/** The pseudonym an erased account becomes (103), shown inside the sentences as it is written. */
const PSEUDONYM = "deleted-user-<id>";
const GOES = [
  "identity",
  "credentials",
  "sessions",
  "scim",
  "memberships",
  "drafts",
  "ip",
] as const;
const STAYS = ["items", "submissions", "audit", "workspace"] as const;

/**
 * The erase confirmation (103): the account, what goes and what stays, a reminder to give the
 * person what they asked for first, and the account's email typed to enable Erase. It's remounted each time the
 * dialog opens, so no result lingers.
 */
export const EraseUserForm = ({
  user,
  onDone,
  initialState = {},
  initialTyped = "",
}: {
  user: ErasableUser;
  onDone: () => void;
  /** The state to start from and what's typed, for the component tests of each state. */
  initialState?: AdminActionState;
  initialTyped?: string;
}) => {
  const t = useTranslations("admin.erase");
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    eraseUserFromForm,
    initialState,
  );
  const [typed, setTyped] = useState(initialTyped);
  const confirmed = confirmsEmail(typed, user.email);
  const id = `erase-${user.id}`;

  useToastWhen(state, state.done, "ok", onDone);
  if (state.done) return null;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <p className="text-sm text-fg">
        <span className="font-semibold">{user.name}</span>{" "}
        <span className="text-[13px] text-muted">{user.email}</span>
      </p>
      <Notice kind="warn" title={t("irreversibleTitle")}>
        {t("irreversibleBody")} <Help id="erase-user" />
      </Notice>
      {user.role === "root" ? (
        <Notice kind="warn" title={t("rootTitle", { email: user.email })}>
          {t("rootBody")}
        </Notice>
      ) : null}
      {/* Side by side from `md` up, so the dialog is wide and short rather than narrow and tall. */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="grid content-start gap-1 text-sm">
          <p className="font-semibold text-fg">{t("goesHeading")}</p>
          <ul className="list-disc pl-5 text-muted">
            {GOES.map((key) => (
              <li key={key}>{t(`goes.${key}`, { pseudonym: PSEUDONYM })}</li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-1 text-sm">
          <p className="font-semibold text-fg">{t("staysHeading")}</p>
          <ul className="list-disc pl-5 text-muted">
            {STAYS.map((key) => (
              <li key={key}>{t(`stays.${key}`, { pseudonym: PSEUDONYM })}</li>
            ))}
          </ul>
        </div>
      </div>
      {/* The reminder and the confirmation side by side from `md` up: shorter, so it fits a laptop. */}
      <div className="grid gap-4 md:grid-cols-2 md:items-end md:gap-6">
        <p className="text-sm text-muted">
          {t.rich("reminder", {
            download: (chunks) => (
              <a href={dataHref(user.id)} className="underline underline-offset-2 hover:text-fg">
                {chunks}
              </a>
            ),
          })}
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{t("confirm")}</Label>
          <Input
            id={id}
            name="confirm"
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder={user.email}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
      </div>
      <FieldError id={`${id}-error`}>{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="destructive" loading={pending} disabled={!confirmed}>
          {t("button")}
        </Button>
      </DialogActions>
    </form>
  );
};

/**
 * Opens the erase dialog, from the button on the user's page (123). Each button owns its dialog.
 * Closing it refreshes the page, which the action itself doesn't (the page would turn into the
 * erased account's before root read the outcome).
 */
export const EraseUserButton = ({ user }: { user: ErasableUser }) => {
  const t = useTranslations("admin.erase");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
    router.refresh();
  };
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {t("button")}
      </Button>
      <Dialog open={open} onClose={close} title={t("title")} size="xlarge">
        {open ? <EraseUserForm key={round} user={user} onDone={close} /> : null}
      </Dialog>
    </>
  );
};
