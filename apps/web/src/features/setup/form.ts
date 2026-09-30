import { type DatabaseAnswers, DEFAULT_PORTS } from "@/server/setup/database-url";
import { DEFAULT_VALUES, type SetupError, type SetupValues } from "./types";

/** Reads the form the way the server actions do: pure, so it's tested on its own. */

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

const invalid = (field: SetupError["field"], message: string): SetupError => ({
  code: "invalid",
  section: "database",
  field,
  message,
});

export const readKind = (form: FormData): SetupValues["kind"] => {
  const kind = text(form, "database.kind");
  return kind === "mysql" || kind === "postgres" ? kind : "sqlite";
};

/** The non-secret values, with the defaults for anything missing. */
export const readValues = (form: FormData, defaults: SetupValues = DEFAULT_VALUES): SetupValues => {
  const kind = readKind(form);
  return {
    kind,
    path: text(form, "database.path") || defaults.path,
    host: text(form, "database.host") || defaults.host,
    port: text(form, "database.port"),
    name: text(form, "database.name") || defaults.name,
    user: text(form, "database.user"),
    keep: form.get("database.keep") === "on",
    publicUrl: text(form, "public_url") || defaults.publicUrl,
    rootEmail: text(form, "root.email"),
    rootName: text(form, "root.name"),
  };
};

/** The database answers, as the terminal collects them, or the first thing wrong with them. */
export const readDatabaseAnswers = (
  form: FormData,
): { ok: true; answers: DatabaseAnswers } | { ok: false; error: SetupError } => {
  const kind = readKind(form);
  if (kind === "sqlite") {
    const path = text(form, "database.path");
    if (!path) return { ok: false, error: invalid("database.path", "Enter a file path.") };
    return { ok: true, answers: { dialect: "sqlite", path } };
  }
  const host = text(form, "database.host");
  if (!host) return { ok: false, error: invalid("database.host", "Enter the host.") };
  const port = text(form, "database.port") || DEFAULT_PORTS[kind];
  if (!/^\d{1,5}$/.test(port))
    return { ok: false, error: invalid("database.port", "Enter a port number.") };
  const database = text(form, "database.name");
  if (!database) return { ok: false, error: invalid("database.name", "Enter the database name.") };
  const user = text(form, "database.user");
  if (!user) return { ok: false, error: invalid("database.user", "Enter the user.") };
  const password = String(form.get("database.password") ?? "");
  return { ok: true, answers: { dialect: kind, host, port, database, user, password } };
};

export type RootInput = { email: string; name: string; password: string; again: string };

/** The root account's answers; the passwords untrimmed, as typed. */
export const readRootInput = (form: FormData): RootInput => ({
  email: text(form, "root.email"),
  name: text(form, "root.name"),
  password: String(form.get("root.password") ?? ""),
  again: String(form.get("root.password_again") ?? ""),
});
