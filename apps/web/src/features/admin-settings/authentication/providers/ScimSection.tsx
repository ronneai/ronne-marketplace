"use client";

import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import {
  generateScimFromForm,
  revokeScimFromForm,
  turnOffScimFromForm,
  turnOnScimFromForm,
} from "./actions";
import type { ScimActionState } from "./types";

/** A token as the section shows it (dates as ISO strings, from the server). */
export type ScimTokenView = {
  id: string;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

export type ScimSectionProps = {
  id: string;
  name: string;
  preset: string;
  enabledAt: string | null;
  base: string;
  tokens: ScimTokenView[];
};

/** What the provider's SCIM settings need, in its own words where they differ (108). */
const STEPS: Record<string, string[]> = {
  entra: [
    "In Entra, open the enterprise application for Ronne, then Provisioning, and set the mode to Automatic.",
    "Paste the base URL above as the Tenant URL and the token as the Secret Token, then Test Connection.",
    "In Mappings, map objectId to externalId (Entra's default, mailNickname, can be given to someone new).",
    "Assign the users and groups to provision, then start provisioning.",
  ],
  okta: [
    "In Okta, open the app for Ronne, then Provisioning, and turn on SCIM provisioning.",
    "Set the SCIM connector base URL to the base URL above, the unique identifier to userName, and HTTP Header authentication with the token.",
    "Turn on Create, Update and Deactivate users, and Push Groups for the groups Ronne maps.",
  ],
};

const GENERIC_STEPS = [
  "In the provider's SCIM settings, set the base URL above and the token as a Bearer token.",
  "Send the person's email as userName, and an id that never changes as externalId.",
  "Assign the users and groups to provision; the groups' names (or ids) are what this page's group mappings match.",
];

const ConfirmDialog = ({
  open,
  onClose,
  title,
  children,
  id,
  action,
  pending,
  label,
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  id: string;
  action: (form: FormData) => void;
  pending: boolean;
  label: string;
  destructive?: boolean;
}) => (
  <Dialog open={open} onClose={onClose} title={title}>
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="text-sm text-fg">{children}</div>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={destructive ? "destructive" : "primary"} loading={pending}>
          {label}
        </Button>
      </DialogActions>
    </form>
  </Dialog>
);

/** A new token, shown once (108): copy it to the provider now. */
export const NewToken = ({ state }: { state: ScimActionState }) =>
  state.token ? (
    <div className="grid gap-2">
      <Notice kind="warn" title="Copy the token now">
        It&apos;s shown once: Ronne keeps only its hash. Paste it into the provider&apos;s SCIM
        settings.
        {state.previousExpiresAt ? (
          <>
            {" "}
            The token before keeps working until{" "}
            <LocalTime value={new Date(state.previousExpiresAt)} />, so change it at the provider
            before then.
          </>
        ) : null}
      </Notice>
      <CopyableCommand command={state.token} prompt={false} />
    </div>
  ) : null;

/**
 * Provisioning (SCIM) on a provider's page (108): off until root turns it on; then the base URL,
 * the one token (Generate, Rotate with a 24-hour overlap, Revoke), when it was last used, and the
 * provider's setup steps. Turning it off stops every request at once and keeps the token.
 */
export const ScimSection = ({ id, name, preset, enabledAt, base, tokens }: ScimSectionProps) => {
  const [onState, turnOn, turningOn] = useActionState<ScimActionState, FormData>(
    turnOnScimFromForm,
    {},
  );
  const [offState, turnOff, turningOff] = useActionState<ScimActionState, FormData>(
    turnOffScimFromForm,
    {},
  );
  const [made, generate, generating] = useActionState<ScimActionState, FormData>(
    generateScimFromForm,
    {},
  );
  const [revokeState, revoke, revoking] = useActionState<ScimActionState, FormData>(
    revokeScimFromForm,
    {},
  );
  const [confirm, setConfirm] = useState<"on" | "off" | "rotate" | "revoke" | null>(null);
  const close = () => setConfirm(null);
  const error = onState.error ?? offState.error ?? made.error ?? revokeState.error;
  const current = tokens.find((t) => t.expiresAt === null);
  const previous = tokens.find((t) => t.expiresAt !== null);
  const steps = STEPS[preset] ?? GENERIC_STEPS;

  return (
    <section aria-labelledby="scim-title" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="scim-title" className="text-base font-semibold text-fg">
          Provisioning (SCIM)
        </h3>
        <Badge tone={enabledAt ? "accent" : "muted"}>{enabledAt ? "On" : "Off"}</Badge>
        <Help id="scim-provider" />
      </div>
      <p className="text-sm text-muted">
        {name} creates, updates and deprovisions accounts by itself, and keeps workspace roles in
        step with its groups through this page&apos;s group mappings. Deprovisioning disables an
        account; it never erases one.
      </p>
      {error ? <Notice kind="error" title={error} /> : null}

      {enabledAt ? (
        <>
          <div className="grid gap-1.5">
            <p className="text-xs font-semibold text-muted">Base URL</p>
            <CopyableCommand command={base} prompt={false} />
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-semibold text-muted">Token</p>
            {current ? (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">Made</dt>
                <dd>
                  <LocalTime value={new Date(current.createdAt)} />
                  {current.createdBy ? ` by ${current.createdBy}` : ""}
                </dd>
                <dt className="text-muted">Last used</dt>
                <dd>
                  {current.lastUsedAt ? (
                    <LocalTime value={new Date(current.lastUsedAt)} />
                  ) : (
                    "Never"
                  )}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-muted">No token yet: the provider can&apos;t connect.</p>
            )}
            {previous?.expiresAt ? (
              <p className="text-sm text-muted">
                The token before the last rotation works until{" "}
                <LocalTime value={new Date(previous.expiresAt)} />
                {previous.lastUsedAt ? (
                  <>
                    {" "}
                    (last used <LocalTime value={new Date(previous.lastUsedAt)} />)
                  </>
                ) : null}
                .
              </p>
            ) : null}
            <NewToken state={made} />
          </div>

          <div className="flex flex-wrap gap-2">
            {current ? (
              <Button variant="secondary" onClick={() => setConfirm("rotate")}>
                Rotate
              </Button>
            ) : (
              <form action={generate}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" loading={generating}>
                  Generate token
                </Button>
              </form>
            )}
            {tokens.length > 0 ? (
              <Button variant="destructive" onClick={() => setConfirm("revoke")}>
                Revoke
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setConfirm("off")}>
              Turn off SCIM
            </Button>
          </div>

          <div className="grid gap-1.5">
            <p className="text-xs font-semibold text-muted">At the provider</p>
            <ol className="list-decimal pl-5 text-sm text-fg">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        <div>
          <Button onClick={() => setConfirm("on")}>Turn on SCIM</Button>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "on"}
        onClose={close}
        title={`Turn on SCIM for ${name}?`}
        id={id}
        action={turnOn}
        pending={turningOn}
        label="Turn on SCIM"
      >
        <p>
          {name} will create and update accounts, disable them when it deprovisions someone, and
          give workspace roles through its groups. Its sign-in stops applying the groups claim: SCIM
          becomes the one source of its groups. Roles its sign-in already gave stay until the
          provider changes that person&apos;s groups. Next, generate a token for it.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "off"}
        onClose={close}
        title={`Turn off SCIM for ${name}?`}
        id={id}
        action={turnOff}
        pending={turningOff}
        label="Turn off SCIM"
        destructive
      >
        <p>
          Every request from {name}&apos;s SCIM is refused at once. Accounts, links and groups stay,
          and so does the token, for when you turn it on again.
        </p>
      </ConfirmDialog>
      <Dialog open={confirm === "rotate"} onClose={close} title="Rotate the SCIM token?">
        <form
          action={(form) => {
            close();
            generate(form);
          }}
          className="grid gap-3"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="rotate" value="yes" />
          <p className="text-sm text-fg">
            A new token is made and shown once. The current one keeps working for 24 hours, so you
            can change it at the provider calmly; a token from an earlier rotation stops now.
          </p>
          <DialogActions>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={generating}>
              Rotate
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirm === "revoke"}
        onClose={close}
        title="Revoke the SCIM token?"
        id={id}
        action={revoke}
        pending={revoking}
        label="Revoke"
        destructive
      >
        <p>
          Every SCIM token of {name} stops working at once, the one before a rotation too. Its
          requests are refused until you generate a new token and give it to the provider.
        </p>
      </ConfirmDialog>
    </section>
  );
};
