"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Help } from "@/components/help/Help";
import { docsHref, type SectionOf } from "@/components/help/topics";
import { Button } from "@/components/ui/Button";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import type { InstructionStep } from "@/server/domains/identity/models/auth-provider-type";
import type {
  IdentityProvider,
  MappedRole,
} from "@/server/domains/identity/models/identity-provider";
import { issuerFromPreset, type OidcPreset } from "@/server/domains/identity/models/oidc-presets";
import { saveProviderFromForm } from "./actions";
import type { ProviderFormState } from "./types";

/** A group row; `key` is the form's own, since rows have no id until they're saved. */
type Mapping = { key: number; group: string; workspaceId: string; role: MappedRole };

export type ProviderFormProps = {
  provider: IdentityProvider | null;
  presets: readonly OidcPreset[];
  workspaces: readonly { id: string; name: string }[];
  mappings: readonly {
    group: string;
    workspaceId: string | null;
    role: MappedRole;
    warning: string | null;
  }[];
  /** `<PUBLIC_URL>/api/auth/sso/callback/`: the redirect URI is this and the provider's id. */
  callbackBase: string;
  /** Add provider with this preset chosen (`&preset=`, from its card). */
  initialPreset?: string;
  steps: Record<string, InstructionStep[]>;
};

const ROLES: readonly MappedRole[] = ["user", "moderator", "admin"];

/** What a save said: stale (someone saved since), or another error. */
export const ProviderFormMessages = ({ state }: { state: ProviderFormState }) =>
  state.stale ? (
    <Notice kind="warn" title="Someone saved this provider since you opened it.">
      Reload the page to see their changes, then make yours again.
    </Notice>
  ) : state.error ? (
    <Notice kind="error" title={state.error} />
  ) : null;

/** Each preset's guide in the Documentation's Authentication topic. */
const PRESET_GUIDES: Record<string, SectionOf<"authentication">> = {
  google: "google",
  entra: "entra",
  okta: "okta",
  keycloak: "keycloak",
  authentik: "authentik",
  auth0: "auth0",
  other: "other-oidc",
};

/** The Documentation's guide for a preset; the topic's providers section for one it lacks. */
export const presetGuide = (presetId: string): string =>
  docsHref("authentication", PRESET_GUIDES[presetId] ?? "providers");

/** The setup steps for the chosen preset, numbered, the redirect URI first with Copy. */
export const ProviderSteps = ({
  steps,
  presetId,
}: {
  steps: readonly InstructionStep[];
  presetId: string;
}) => (
  <aside aria-labelledby="provider-steps-title" className="grid content-start gap-3">
    <h3 id="provider-steps-title" className="text-sm font-semibold text-fg">
      Set it up at the provider
    </h3>
    <Help id="provider-values" href={presetGuide(presetId)} />
    <ol className="grid gap-3">
      {steps.map((step, i) => (
        <li key={step.title} className="grid gap-1 text-sm">
          <span className="font-semibold text-fg">
            {i + 1}. {step.title}
          </span>
          <span className="text-muted">{step.body}</span>
          {step.copy ? (
            <>
              <CopyableCommand command={step.copy} prompt={false} wrap />
              <Help id="redirect-uri" />
            </>
          ) : null}
        </li>
      ))}
    </ol>
  </aside>
);

/**
 * Admin › Settings › Authentication › Add / Edit provider (106). New: the presets as cards, then
 * the id (chosen once: it's in the redirect URI). The client secret is write-only: once saved, the
 * form says so and offers Replace. Groups map to a workspace and a role. The version (`updatedAt`)
 * travels with the form, so a save over someone else's is refused as stale.
 */
export const ProviderForm = ({
  provider,
  presets,
  workspaces,
  mappings,
  callbackBase,
  initialPreset,
  steps,
}: ProviderFormProps) => {
  const [state, action, pending] = useActionState<ProviderFormState, FormData>(
    saveProviderFromForm,
    {},
  );
  const isNew = provider === null;
  const presetId = provider?.preset ?? initialPreset ?? "";
  const preset = presets.find((p) => p.id === presetId) ?? null;
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [issuer, setIssuer] = useState(
    provider
      ? String(provider.config.issuer ?? "")
      : preset && !preset.issuer.includes("{")
        ? preset.issuer
        : "",
  );
  // The redirect URI follows the id as it's typed (it's chosen once, then fixed).
  const [typedId, setTypedId] = useState(presetId === "other" ? "" : presetId);
  const redirectUri = `${callbackBase}${provider ? provider.id : typedId || "<id>"}`;
  const [replaceSecret, setReplaceSecret] = useState(!provider?.hasSecret);
  const nextKey = useRef(mappings.length);
  const [rows, setRows] = useState<Mapping[]>(
    mappings.map((m, i) => ({
      key: i,
      group: m.group,
      workspaceId: m.workspaceId ?? "",
      role: m.role,
    })),
  );
  const fieldError = (key: string) => state.fields?.[key];

  const setPiece = (key: string, value: string) => {
    const nextPieces = { ...pieces, [key]: value };
    setPieces(nextPieces);
    if (preset) setIssuer(issuerFromPreset(preset, nextPieces) ?? "");
  };

  if (isNew && !preset)
    return (
      <section aria-labelledby="choose-preset-title" className="grid gap-3">
        <h3 id="choose-preset-title" className="text-base font-semibold text-fg">
          Choose your identity provider
        </h3>
        <p className="text-sm text-muted">
          OpenID Connect. Each fills the form and shows its setup steps.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link
                href={`/admin/settings?tab=authentication&provider=new&preset=${p.id}`}
                className="grid min-h-11 w-full gap-1 rounded-control border border-strong bg-surface p-3 text-left text-sm hover:border-accent focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className="font-semibold text-fg">{p.label}</span>
                <span className="text-xs break-all text-muted">
                  {p.issuer || "Any provider that publishes a discovery document"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  const chosenSteps = steps[presetId] ?? steps.other ?? [];
  const scopesDefault = provider
    ? ((provider.config.scopes as string[]) ?? []).join(" ")
    : (preset?.scopes ?? []).join(" ");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        action={action}
        aria-label={isNew ? "Add provider" : "Edit provider"}
        className="grid content-start gap-4"
      >
        <input type="hidden" name="mode" value={isNew ? "new" : "edit"} />
        <input type="hidden" name="type" value="oidc" />
        <input type="hidden" name="preset" value={presetId} />
        {provider ? <input type="hidden" name="id" value={provider.id} /> : null}
        {provider ? (
          <input type="hidden" name="version" value={new Date(provider.updatedAt).toISOString()} />
        ) : null}

        <ProviderFormMessages state={state} />

        {isNew ? (
          <div className="grid gap-1">
            <Label htmlFor="provider-id">Provider id</Label>
            <input
              id="provider-id"
              name="id"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,30}[a-z0-9]"
              aria-describedby="provider-id-hint"
              className={inputClasses}
              value={typedId}
              onChange={(e) => setTypedId(e.target.value)}
            />
            <p id="provider-id-hint" className="text-xs text-muted">
              3 to 32 lowercase letters, digits and dashes. It is in the redirect URI and can&apos;t
              be changed later.
            </p>
          </div>
        ) : null}

        <div className="grid gap-1">
          <Label htmlFor="provider-name">Display name</Label>
          <input
            id="provider-name"
            name="name"
            required
            maxLength={100}
            className={inputClasses}
            defaultValue={provider?.name ?? preset?.label ?? ""}
            aria-describedby="provider-name-hint"
          />
          <p id="provider-name-hint" className="text-xs text-muted">
            On the sign-in button: &quot;Continue with …&quot;.
          </p>
        </div>

        {isNew && preset && Object.keys(preset.pieces).length > 0
          ? Object.entries(preset.pieces).map(([key, piece]) => (
              <div key={key} className="grid gap-1">
                <Label htmlFor={`piece-${key}`}>{piece.label}</Label>
                <input
                  id={`piece-${key}`}
                  className={inputClasses}
                  placeholder={piece.example}
                  value={pieces[key] ?? ""}
                  onChange={(e) => setPiece(key, e.target.value)}
                />
              </div>
            ))
          : null}

        <div className="grid gap-1">
          <Label htmlFor="provider-issuer">Issuer URL</Label>
          <input
            id="provider-issuer"
            name="issuer"
            required
            className={`${inputClasses} font-mono`}
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder={preset?.issuer || "https://"}
            aria-invalid={fieldError("issuer") ? true : undefined}
            aria-describedby="provider-issuer-error"
          />
          <FieldError id="provider-issuer-error">{fieldError("issuer")}</FieldError>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="provider-client-id">Client ID</Label>
          <input
            id="provider-client-id"
            name="clientId"
            required
            className={`${inputClasses} font-mono`}
            defaultValue={String(provider?.config.clientId ?? "")}
            aria-invalid={fieldError("clientId") ? true : undefined}
            aria-describedby="provider-client-id-error"
          />
          <FieldError id="provider-client-id-error">{fieldError("clientId")}</FieldError>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="provider-secret">Client secret</Label>
          {replaceSecret ? (
            <input
              id="provider-secret"
              name="clientSecret"
              type="password"
              autoComplete="off"
              required={isNew}
              className={`${inputClasses} font-mono`}
              aria-invalid={fieldError("clientSecret") ? true : undefined}
              aria-describedby="provider-secret-hint provider-secret-error"
            />
          ) : (
            <div className="flex items-center gap-3 text-sm text-fg">
              <span>Secret saved</span>
              <Button variant="text" onClick={() => setReplaceSecret(true)}>
                Replace
              </Button>
            </div>
          )}
          <p id="provider-secret-hint" className="text-xs text-muted">
            Stored encrypted and never shown again.
          </p>
          <FieldError id="provider-secret-error">{fieldError("clientSecret")}</FieldError>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="provider-scopes">Scopes</Label>
          <input
            id="provider-scopes"
            name="scopes"
            className={`${inputClasses} font-mono`}
            defaultValue={scopesDefault}
            aria-describedby="provider-scopes-hint"
          />
          <p id="provider-scopes-hint" className="text-xs text-muted">
            openid is always asked for.
            {preset?.groupsScope ? ` Add ${preset.groupsScope} when you map groups.` : ""}
          </p>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold text-fg">Who may sign in</legend>
          <div className="grid gap-1">
            <Label htmlFor="provider-domains">
              Email domains that get an account on first sign-in
            </Label>
            <input
              id="provider-domains"
              name="domains"
              className={inputClasses}
              placeholder="example.com, example.org"
              defaultValue={provider?.domains.join(", ") ?? ""}
              aria-describedby="provider-domains-hint"
            />
            <p id="provider-domains-hint" className="text-xs text-muted">
              Empty: nobody is created; only existing accounts are linked.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-fg">
            <input
              type="checkbox"
              name="linkByEmail"
              defaultChecked={provider?.linkByEmail ?? true}
              className="mt-0.5 size-4 accent-(--accent)"
            />
            <span>Link existing accounts by verified email</span>
          </label>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold text-fg">
            Groups <Help id="provider-groups" />
          </legend>
          <div className="grid gap-1">
            <Label htmlFor="provider-groups-claim">Groups claim</Label>
            <input
              id="provider-groups-claim"
              name="groupsClaim"
              className={`${inputClasses} font-mono`}
              defaultValue={provider ? (provider.groupsClaim ?? "") : (preset?.groupsClaim ?? "")}
            />
          </div>
          {mappings.some((m) => m.warning) ? (
            <Notice kind="warn" title="A group's workspace was deleted.">
              It is skipped at sign-in; choose another workspace or remove the row.
            </Notice>
          ) : null}
          <ul className="grid gap-2">
            {rows.map((row, i) => (
              <li
                key={row.key}
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto] sm:items-end"
              >
                <div className="grid gap-1">
                  <Label htmlFor={`mapping-group-${i}`}>Group</Label>
                  <input
                    id={`mapping-group-${i}`}
                    name="mappingGroup"
                    className={`${inputClasses} font-mono`}
                    value={row.group}
                    onChange={(e) =>
                      setRows(rows.map((r, j) => (j === i ? { ...r, group: e.target.value } : r)))
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`mapping-workspace-${i}`}>Workspace</Label>
                  <select
                    id={`mapping-workspace-${i}`}
                    name="mappingWorkspace"
                    className={inputClasses}
                    value={row.workspaceId}
                    onChange={(e) =>
                      setRows(
                        rows.map((r, j) => (j === i ? { ...r, workspaceId: e.target.value } : r)),
                      )
                    }
                  >
                    <option value="">Choose…</option>
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`mapping-role-${i}`}>Role</Label>
                  <select
                    id={`mapping-role-${i}`}
                    name="mappingRole"
                    className={inputClasses}
                    value={row.role}
                    onChange={(e) =>
                      setRows(
                        rows.map((r, j) =>
                          j === i ? { ...r, role: e.target.value as MappedRole } : r,
                        ),
                      )
                    }
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <IconButton
                  label={`Remove group ${row.group || i + 1}`}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                setRows([
                  ...rows,
                  { key: nextKey.current++, group: "", workspaceId: "", role: "user" },
                ])
              }
            >
              <Plus className="size-4" aria-hidden /> Add a group
            </Button>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            {isNew ? "Add provider" : "Save"}
          </Button>
        </div>
      </form>
      <ProviderSteps
        steps={chosenSteps.map((s) => (s.copy ? { ...s, copy: redirectUri } : s))}
        presetId={presetId}
      />
    </div>
  );
};
