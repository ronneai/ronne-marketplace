import { Checkbox, FieldError, Label, Select, TextField } from "@/components/ui/Field";
import { HelpTip } from "@/components/ui/HelpTip";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { DEFAULT_PORTS } from "@/server/setup/database-url";
import type { SetupError, SetupField, SetupPageProps, SetupValues } from "./types";

/**
 * The three groups of questions, shared by the single form (without JavaScript) and the
 * step-by-step wizard. Field names are the terminal's prompt ids, so both setups speak the same.
 */

export type FieldsProps = {
  page: SetupPageProps;
  values: SetupValues;
  error?: SetupError;
};

const fieldError = (error: SetupError | undefined, field: SetupField) =>
  error?.field === field ? error.message : undefined;

/** A section's error that isn't about one field (a failed connection check, for example). */
export const SectionError = ({
  error,
  section,
}: {
  error?: SetupError;
  section: SetupError["section"];
}) => {
  if (!error || error.section !== section || error.field) return null;
  return (
    <Notice kind="error" title={error.message}>
      {error.detail ? (
        <code className="block font-mono text-xs break-words">{error.detail}</code>
      ) : null}
    </Notice>
  );
};

export const DatabaseFields = ({
  page,
  values,
  error,
  onKindChange,
}: FieldsProps & { onKindChange?: (kind: SetupValues["kind"]) => void }) => {
  const docker = page.runtime === "docker";
  const showSqlite = values.kind === "sqlite";
  const showServer = values.kind !== "sqlite";
  return (
    <fieldset className="grid gap-4" data-section="database">
      <legend className="text-base font-semibold text-fg">Database</legend>
      <SectionError error={error} section="database" />
      {page.currentDatabase ? (
        <Checkbox
          id="database.keep"
          name="database.keep"
          defaultChecked={values.keep}
          label={
            <>
              Keep the database already in the settings:{" "}
              <code className="font-mono">{page.currentDatabase}</code>
            </>
          }
        />
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="database.kind">Which database?</Label>
        <Select
          id="database.kind"
          name="database.kind"
          defaultValue={values.kind}
          onChange={
            onKindChange
              ? (event) => onKindChange(event.target.value as SetupValues["kind"])
              : undefined
          }
        >
          <option value="sqlite">SQLite: a file on this machine, nothing else to install</option>
          <option value="mysql">
            MySQL or MariaDB: MySQL 8.4+ or MariaDB 10.11+, already running
          </option>
          <option value="postgres">PostgreSQL: 15+, already running</option>
        </Select>
        <HelpTip question="Which one should I pick?">
          <p>
            SQLite is the default and needs nothing else: one file, backed up by copying it. Pick
            MySQL, MariaDB or PostgreSQL when you already run one, or expect many people at once.
          </p>
        </HelpTip>
      </div>
      <div
        className="grid gap-4"
        data-kind="sqlite"
        hidden={!showSqlite && onKindChange !== undefined}
      >
        <TextField
          id="database.path"
          name="database.path"
          label="SQLite file"
          defaultValue={values.path}
          hint={
            docker
              ? "Relative to the app, inside the ronne-data volume. Keep the default unless you know why."
              : "Relative to apps/web. The folder is created if it's missing."
          }
          error={fieldError(error, "database.path")}
          autoComplete="off"
        />
      </div>
      <div
        className="grid gap-4"
        data-kind="server"
        hidden={!showServer && onKindChange !== undefined}
      >
        {onKindChange ? null : (
          <p className="text-xs text-muted">For MySQL, MariaDB or PostgreSQL only.</p>
        )}
        {docker ? (
          <Notice kind="info" title="Running the database with Compose?">
            <code className="font-mono">docker compose --profile postgres up -d</code> (or{" "}
            <code className="font-mono">mysql</code>) starts one next to Ronne. Use the host{" "}
            <code className="font-mono">postgres</code> (or <code className="font-mono">mysql</code>
            ), the database and user <code className="font-mono">ronne</code>, and the password from{" "}
            <code className="font-mono">RONNE_DB_PASSWORD</code>.
          </Notice>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <TextField
            id="database.host"
            name="database.host"
            label="Host"
            defaultValue={values.host}
            error={fieldError(error, "database.host")}
            autoComplete="off"
          />
          <TextField
            id="database.port"
            name="database.port"
            label="Port"
            inputMode="numeric"
            defaultValue={values.port}
            placeholder={values.kind === "postgres" ? DEFAULT_PORTS.postgres : DEFAULT_PORTS.mysql}
            error={fieldError(error, "database.port")}
            autoComplete="off"
          />
        </div>
        <TextField
          id="database.name"
          name="database.name"
          label="Database name"
          defaultValue={values.name}
          hint="It must exist already; setup doesn't create databases."
          error={fieldError(error, "database.name")}
          autoComplete="off"
        />
        <TextField
          id="database.user"
          name="database.user"
          label="User"
          defaultValue={values.user}
          error={fieldError(error, "database.user")}
          autoComplete="off"
        />
        <div className="grid gap-1.5">
          <Label htmlFor="database.password">Password</Label>
          <PasswordInput id="database.password" name="database.password" autoComplete="off" />
          <FieldError id="database.password-error">
            {fieldError(error, "database.password")}
          </FieldError>
        </div>
      </div>
    </fieldset>
  );
};

export const InstanceFields = ({ page, values, error }: FieldsProps) => {
  return (
    <fieldset className="grid gap-4" data-section="instance">
      <legend className="text-base font-semibold text-fg">Instance</legend>
      <SectionError error={error} section="instance" />
      <TextField
        id="public_url"
        name="public_url"
        label="Public address (PUBLIC_URL)"
        type="url"
        defaultValue={values.publicUrl}
        readOnly={page.publicUrlFromEnvironment}
        hint={
          page.publicUrlFromEnvironment
            ? "Set by PUBLIC_URL in the environment (compose.yaml), which wins over the settings. Change it there, for example PUBLIC_URL=https://ronne.example docker compose up -d."
            : "Where people will open Ronne AI Marketplace: the address a reverse proxy serves, or http://localhost:3000 on this machine."
        }
        error={fieldError(error, "public_url")}
        autoComplete="off"
      />
      <HelpTip question="What is it used for?">
        <p>
          Links in the app, the address <code className="font-mono">rmk login</code> uses, and the
          origin sign-in trusts. Behind a reverse proxy, use the public https address.
        </p>
      </HelpTip>
    </fieldset>
  );
};

export const RootFields = ({ values, error }: FieldsProps) => {
  return (
    <fieldset className="grid gap-4" data-section="root">
      <legend className="text-base font-semibold text-fg">Root account</legend>
      <SectionError error={error} section="root" />
      <p className="text-sm text-muted">
        Root can do everything, including creating other users and scopes.{" "}
      </p>
      <HelpTip question="What can root do?">
        <p>
          Everything: create scopes and users, review and release items, and override a decision
          (which is recorded). This is the first root; other people get their own accounts, created
          by a root, and a root can make them root too.
        </p>
      </HelpTip>
      <TextField
        id="root.email"
        name="root.email"
        label="Email"
        type="email"
        defaultValue={values.rootEmail}
        autoComplete="username"
        maxLength={255}
        error={fieldError(error, "root.email")}
      />
      <TextField
        id="root.name"
        name="root.name"
        label="Display name"
        defaultValue={values.rootName}
        autoComplete="name"
        maxLength={80}
        error={fieldError(error, "root.name")}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="root.password">Password</Label>
        <PasswordInput
          id="root.password"
          name="root.password"
          autoComplete="new-password"
          aria-invalid={fieldError(error, "root.password") ? true : undefined}
          aria-describedby="root.password-hint"
        />
        <p id="root.password-hint" className="text-xs text-muted">
          12 to 128 characters. Nothing else is required: length is what matters.
        </p>
        <FieldError id="root.password-error">{fieldError(error, "root.password")}</FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="root.password_again">Password again</Label>
        <PasswordInput
          id="root.password_again"
          name="root.password_again"
          autoComplete="new-password"
          aria-invalid={fieldError(error, "root.password_again") ? true : undefined}
        />
        <FieldError id="root.password_again-error">
          {fieldError(error, "root.password_again")}
        </FieldError>
      </div>
    </fieldset>
  );
};
