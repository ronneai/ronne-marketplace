import type { DatabaseDialect } from "@/server/db/url";

/** The form's field names are the terminal setup's prompt ids (feature 003). */
export type SetupField =
  | "database.kind"
  | "database.path"
  | "database.host"
  | "database.port"
  | "database.name"
  | "database.user"
  | "database.password"
  | "public_url"
  | "root.email"
  | "root.name"
  | "root.password"
  | "root.password_again"
  | "setup.code";

export type SetupSection = "code" | "database" | "instance" | "root";

/**
 * The words of a message of the setup in the person's language (feature 132): a key of
 * `admin.setup.errors` or `admin.setup.detail` and its values. The English beside it stays what
 * the tests and any caller read; a text with no `say` (a driver's own, the database check's) is
 * shown as it is.
 */
export type Say = { key: string; values?: Record<string, string | number | boolean> };

export type SetupErrorCode =
  | "already_set_up"
  | "database_unavailable"
  | "not_configured"
  | "database"
  | "invalid"
  | "mismatch"
  | "settings_unwritable"
  | "database_ahead"
  | "migration_failed"
  | "setup_code_missing"
  | "setup_code_wrong"
  | "setup_code_rate_limited";

/** What went wrong, where it belongs, and the words to show (never a secret). */
export type SetupError = {
  code: SetupErrorCode;
  section: SetupSection;
  field?: SetupField;
  message: string;
  say?: Say;
  /** The driver's message or the statement that fixes it (database problems). */
  detail?: string;
};

/** Something worth knowing that didn't stop the install. */
export type SetupNotice = { text: string; say?: Say };

export type TestResult =
  | { ok: true; dialect: DatabaseDialect; serverVersion: string; warning?: string }
  | { ok: false; error: SetupError };

export type StepName = "settings" | "migrations" | "root";
export const STEP_NAMES: StepName[] = ["settings", "migrations", "root"];

export type StepStatus = "pending" | "running" | "done" | "failed";
export type StepResult = { status: StepStatus; detail?: string; say?: Say };

export type StepOutcome =
  | { ok: true; detail: string; say?: Say; notices: SetupNotice[]; email?: string }
  | { ok: false; error: SetupError };

/** The non-secret answers, sent back so the form keeps them; passwords never are. */
export type SetupValues = {
  kind: DatabaseDialect;
  path: string;
  host: string;
  port: string;
  name: string;
  user: string;
  /** Keep the database already in the settings (an interrupted setup). */
  keep: boolean;
  publicUrl: string;
  rootEmail: string;
  rootName: string;
};

/** The state of the single-form install (`installAll`), also what the wizard shows. */
export type InstallState = {
  steps: Record<StepName, StepResult>;
  error?: SetupError;
  /** Things worth knowing that didn't stop the install. */
  notices: SetupNotice[];
  values: SetupValues;
  done?: { email: string };
};

export const PENDING_STEPS: Record<StepName, StepResult> = {
  settings: { status: "pending" },
  migrations: { status: "pending" },
  root: { status: "pending" },
};

export const DEFAULT_VALUES: SetupValues = {
  kind: "sqlite",
  path: "./data/ronne.db",
  host: "localhost",
  port: "",
  name: "ronne",
  user: "",
  keep: true,
  publicUrl: "http://localhost:3000",
  rootEmail: "",
  rootName: "",
};

/** What the page knows before the form is used. */
export type SetupPageProps = {
  state: "not_configured" | "incomplete";
  /** RONNE_RUNTIME (`server/runtime.ts`): the image, the npm package, or a clone. */
  runtime: "docker" | "npm" | "node";
  /** The settings file the install writes. */
  envFile: string;
  /** This machine's address on the server's port, suggested when PUBLIC_URL isn't set. */
  localUrl?: string;
  /** PUBLIC_URL comes from the process environment (compose.yaml), so the file can't change it. */
  publicUrlFromEnvironment: boolean;
  /** The database already in the settings, without its password, when `incomplete`. */
  currentDatabase?: string;
  initial: SetupValues;
};
