"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, Label, selectClasses, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { createUserFromForm } from "./actions";
import { OneTimePassword } from "./OneTimePassword";
import { PasswordChoice } from "./PasswordChoice";
import type { AdminActionState } from "./types";

/**
 * The typed address's domain as the block list compares it, as the server reads it: after the
 * last `@`, through IDNA (the URL parser's, so `bücher.example` is `xn--bcher-kva.example`),
 * lowercased, without final dots.
 */
export const typedDomain = (email: string) => {
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  const domain = email.slice(at + 1).trim();
  if (domain === "") return "";
  try {
    return new URL(`http://${domain}`).hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    return domain.toLowerCase().replace(/\.+$/, "");
  }
};

export const CreateUserForm = ({
  onDone,
  blockedDomains = [],
}: {
  onDone: () => void;
  /** The block list (191): an address in one of these asks *Create anyway* first. */
  blockedDomains?: readonly string[];
}) => {
  const t = useTranslations("admin.users.create");
  const roles = useTranslations("common.roles");
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    createUserFromForm,
    {},
  );
  const [role, setRole] = useState("user");
  const [email, setEmail] = useState("");
  const domain = typedDomain(email);
  const blocked = domain !== "" && blockedDomains.includes(domain);
  if (state.oneTime)
    return (
      <div className="grid gap-4">
        <OneTimePassword value={state.oneTime} />
        <div>
          <Button onClick={onDone}>{t("done")}</Button>
        </div>
      </div>
    );
  return (
    <form action={action} className="grid gap-4">
      <TextField
        id="new-email"
        name="email"
        type="email"
        label={t("email")}
        required
        maxLength={255}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {blocked ? (
        // Root's own accounts aren't governed by the rules (191): it asks once.
        <Notice kind="warn" title={t("blockedTitle", { domain })}>
          <div className="grid gap-2">
            <p>{t("blockedBody")}</p>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="confirmBlocked" className="size-4 accent-(--accent)" />
              {t("blockedConfirm")}
            </label>
          </div>
        </Notice>
      ) : null}
      <TextField id="new-name" name="name" label={t("name")} required maxLength={255} />
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="new-role">{t("role")}</Label>
          <Help id="role-root" />
        </div>
        <select
          id="new-role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={selectClasses}
        >
          <option value="user">{roles("user")}</option>
          <option value="root">{roles("root")}</option>
        </select>
      </div>
      {role === "root" ? (
        <Notice kind="warn" title={t("rootTitle")}>
          {t("rootBody")}
        </Notice>
      ) : null}
      <PasswordChoice idPrefix="new" />
      <FieldError id="create-error">{state.error}</FieldError>
      <DialogActions>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("button")}
        </Button>
      </DialogActions>
    </form>
  );
};

/** "Create user" and its dialog. Each opening starts a fresh form, so a shown password never lingers. */
export const CreateUserDialog = ({
  blockedDomains = [],
}: {
  blockedDomains?: readonly string[];
}) => {
  const t = useTranslations("admin.users.create");
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("button")}</Button>
      <Dialog open={open} onClose={close} title={t("title")}>
        <CreateUserForm key={round} onDone={close} blockedDomains={blockedDomains} />
      </Dialog>
    </>
  );
};
