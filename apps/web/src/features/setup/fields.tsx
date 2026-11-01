import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Help } from "@/components/help/Help";
import { Checkbox, FieldError, Label, Select, TextField } from "@/components/ui/Field";
import { HelpTip } from "@/components/ui/HelpTip";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { DEFAULT_PORTS } from "@/server/setup/database-url";
import { useSay } from "./say";
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

/** A hook, since the words are in the person's language: the field's error, if it is about it. */
const useFieldError = () => {
  const say = useSay();
  return (error: SetupError | undefined, field: SetupField) =>
    error?.field === field ? say(error.say, error.message) : undefined;
};

/** A section's error that isn't about one field (a failed connection check, for example). */
export const SectionError = ({
  error,
  section,
}: {
  error?: SetupError;
  section: SetupError["section"];
}) => {
  const say = useSay();
  if (!error || error.section !== section || error.field) return null;
  return (
    <Notice kind="error" title={say(error.say, error.message)}>
      {error.detail ? (
        <code className="block font-mono text-xs break-words">{error.detail}</code>
      ) : null}
    </Notice>
  );
};

/**
 * The setup code (161), asked for before anything else. A link the install script opened
 * (`/setup#code=…`) fills it, at load or pasted into a page already open: the fragment is read
 * here, in the browser, and never reaches the server or a proxy's log; it's then taken out of the
 * address bar and the history.
 */
export const CodeField = ({ page, error }: Pick<FieldsProps, "page" | "error">) => {
  const t = useTranslations("admin.setup.code");
  const fieldError = useFieldError();
  useEffect(() => {
    const fill = () => {
      const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
      if (!code) return;
      const input = document.getElementById("setup.code");
      if (input instanceof HTMLInputElement) input.value = code;
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    };
    fill();
    window.addEventListener("hashchange", fill);
    return () => window.removeEventListener("hashchange", fill);
  }, []);
  return (
    <fieldset className="grid gap-2" data-section="code">
      <legend className="sr-only">{t("label")}</legend>
      <SectionError error={error} section="code" />
      <TextField
        id="setup.code"
        name="setup.code"
        label={t("label")}
        hint={t.rich("hint", {
          command: page.setupCodeCommand,
          code: (chunks) => <code className="font-mono break-all">{chunks}</code>,
        })}
        error={fieldError(error, "setup.code")}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="font-mono"
      />
      <Help id="setup-code" />
    </fieldset>
  );
};

export const DatabaseFields = ({
  page,
  values,
  error,
  onKindChange,
}: FieldsProps & { onKindChange?: (kind: SetupValues["kind"]) => void }) => {
  const t = useTranslations("admin.setup.database");
  const fieldError = useFieldError();
  const mono = (chunks: React.ReactNode) => <code className="font-mono">{chunks}</code>;
  const docker = page.runtime === "docker";
  const showSqlite = values.kind === "sqlite";
  const showServer = values.kind !== "sqlite";
  return (
    <fieldset className="grid gap-4" data-section="database">
      <legend className="text-base font-semibold text-fg">{t("legend")}</legend>
      <SectionError error={error} section="database" />
      {page.currentDatabase ? (
        <Checkbox
          id="database.keep"
          name="database.keep"
          defaultChecked={values.keep}
          label={t.rich("keep", { database: page.currentDatabase, code: mono })}
        />
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="database.kind">{t("which")}</Label>
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
          <option value="sqlite">{t("sqlite")}</option>
          <option value="mysql">{t("mysql")}</option>
          <option value="postgres">{t("postgres")}</option>
        </Select>
        <HelpTip question={t("pickQuestion")}>
          <p>{t("pickAnswer")}</p>
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
          label={t("sqliteFile")}
          defaultValue={values.path}
          hint={docker ? t("pathDocker") : page.runtime === "npm" ? t("pathNpm") : t("pathNode")}
          error={fieldError(error, "database.path")}
          autoComplete="off"
        />
      </div>
      <div
        className="grid gap-4"
        data-kind="server"
        hidden={!showServer && onKindChange !== undefined}
      >
        {onKindChange ? null : <p className="text-xs text-muted">{t("serverOnly")}</p>}
        {docker ? (
          <Notice kind="info" title={t("composeTitle")}>
            {t.rich("composeBody", { code: mono })}
          </Notice>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <TextField
            id="database.host"
            name="database.host"
            label={t("host")}
            defaultValue={values.host}
            error={fieldError(error, "database.host")}
            autoComplete="off"
          />
          <TextField
            id="database.port"
            name="database.port"
            label={t("port")}
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
          label={t("name")}
          defaultValue={values.name}
          hint={t("nameHint")}
          error={fieldError(error, "database.name")}
          autoComplete="off"
        />
        <TextField
          id="database.user"
          name="database.user"
          label={t("user")}
          defaultValue={values.user}
          error={fieldError(error, "database.user")}
          autoComplete="off"
        />
        <div className="grid gap-1.5">
          <Label htmlFor="database.password">{t("password")}</Label>
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
  const t = useTranslations("admin.setup.instance");
  const fieldError = useFieldError();
  return (
    <fieldset className="grid gap-4" data-section="instance">
      <legend className="text-base font-semibold text-fg">{t("legend")}</legend>
      <SectionError error={error} section="instance" />
      <TextField
        id="public_url"
        name="public_url"
        label={t("publicUrl")}
        type="url"
        defaultValue={values.publicUrl}
        readOnly={page.publicUrlFromEnvironment}
        hint={
          page.publicUrlFromEnvironment
            ? page.runtime === "docker"
              ? t("envDocker")
              : t("envOther")
            : t("hint", { local: page.localUrl ?? "http://localhost:3000" })
        }
        error={fieldError(error, "public_url")}
        autoComplete="off"
      />
      <HelpTip question={t("helpQuestion")}>
        <p>
          {t.rich("helpAnswer", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
      </HelpTip>
    </fieldset>
  );
};

export const RootFields = ({ values, error }: FieldsProps) => {
  const t = useTranslations("admin.setup.root");
  const fieldError = useFieldError();
  return (
    <fieldset className="grid gap-4" data-section="root">
      <legend className="text-base font-semibold text-fg">{t("legend")}</legend>
      <SectionError error={error} section="root" />
      <p className="text-sm text-muted">{t("intro")}</p>
      <HelpTip question={t("helpQuestion")}>
        <p>{t("helpAnswer")}</p>
      </HelpTip>
      <TextField
        id="root.email"
        name="root.email"
        label={t("email")}
        type="email"
        defaultValue={values.rootEmail}
        autoComplete="username"
        maxLength={255}
        error={fieldError(error, "root.email")}
      />
      <TextField
        id="root.name"
        name="root.name"
        label={t("name")}
        defaultValue={values.rootName}
        autoComplete="name"
        maxLength={80}
        error={fieldError(error, "root.name")}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="root.password">{t("password")}</Label>
        <PasswordInput
          id="root.password"
          name="root.password"
          autoComplete="new-password"
          aria-invalid={fieldError(error, "root.password") ? true : undefined}
          aria-describedby="root.password-hint"
        />
        <p id="root.password-hint" className="text-xs text-muted">
          {t("passwordHint")}
        </p>
        <FieldError id="root.password-error">{fieldError(error, "root.password")}</FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="root.password_again">{t("again")}</Label>
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
