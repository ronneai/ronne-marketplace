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
  | "root.password_again";

export type SetupSection = "database" | "instance" | "root";

export type SetupErrorCode =
  | "already_set_up"
  | "not_configured"
  | "database"
  | "invalid"
  | "mismatch"
  | "settings_unwritable"
  | "database_ahead"
  | "migration_failed";

/** What went wrong, where it belongs, and the words to show (never a secret). */
export type SetupError = {
  code: SetupErrorCode;
  section: SetupSection;
  field?: SetupField;
  message: string;
  /** The driver's message or the statement that fixes it (database problems). */
  detail?: string;
};

export type TestResult =
  | { ok: true; dialect: DatabaseDialect; serverVersion: string; warning?: string }
  | { ok: false; error: SetupError };

export type StepName = "settings" | "migrations" | "root";
export const STEP_NAMES: StepName[] = ["settings", "migrations", "root"];

export type StepStatus = "pending" | "running" | "done" | "failed";
export type StepResult = { status: StepStatus; detail?: string };

export type StepOutcome =
  | { ok: true; detail: string; notices: string[]; email?: string }
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
  notices: string[];
  values: SetupValues;
  done?: { email: string };
};

export const PENDING_STEPS: Record<StepName, StepResult> = {
  settings: { status: "pending" },
  migrations: { status: "pending" },
  root: { status: "pending" },
};

export const STEP_LABELS: Record<StepName, string> = {
  settings: "Settings written",
  migrations: "Migrations applied",
  root: "Root account created",
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
