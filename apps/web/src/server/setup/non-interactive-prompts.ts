import type { SetupPrompts } from "./prompts";

/** A value setup needs wasn't given as a flag or environment variable. Exit code 2. */
export class MissingInputError extends Error {
  constructor(readonly input: string) {
    super(`Missing ${input}.`);
    this.name = "MissingInputError";
  }
}

/** A given value failed validation, and non-interactive mode can't ask again. Exit code 2. */
export class InvalidInputError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid ${input}: ${reason}`);
    this.name = "InvalidInputError";
  }
}

export type NonInteractiveValues = {
  publicUrl?: string;
  rootEmail?: string;
  rootName?: string;
  rootPassword?: string;
};

/** Which flag or variable answers each question, for error messages. */
const SOURCES: Record<string, string> = {
  "database.kind": "DATABASE_URL (or --database-url)",
  public_url: "PUBLIC_URL (or --public-url)",
  "root.email": "RONNE_ROOT_EMAIL (or --root-email)",
  "root.name": "RONNE_ROOT_NAME (or --root-name)",
  "root.password": "RONNE_ROOT_PASSWORD",
  "root.password_again": "RONNE_ROOT_PASSWORD",
};

/**
 * SetupPrompts that answer from flags and environment variables, with plain output (no colours or
 * spinners) for Docker and CI. Nothing is ever asked: a missing or invalid value is an error.
 */
export function nonInteractivePrompts(
  values: NonInteractiveValues,
  out: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  },
): SetupPrompts {
  const answers: Record<string, string | undefined> = {
    public_url: values.publicUrl,
    "root.email": values.rootEmail,
    "root.name": values.rootName,
    "root.password": values.rootPassword,
    "root.password_again": values.rootPassword,
  };
  const source = (id: string) => SOURCES[id] ?? id;
  const answer = (
    id: string,
    initial: string | undefined,
    validate?: (v: string) => string | undefined,
  ) => {
    const value = answers[id] ?? initial;
    if (value === undefined || value === "") throw new MissingInputError(source(id));
    const reason = validate?.(value);
    if (reason) throw new InvalidInputError(source(id), reason);
    return value;
  };

  return {
    interactive: false,
    // Only asked when no DATABASE_URL was given and .env has none.
    select: async (q) => {
      throw new MissingInputError(source(q.id));
    },
    text: async (q) => answer(q.id, q.initial, q.validate),
    password: async (q) => answer(q.id, undefined, q.validate),
    // Only asked to reuse the database in .env: yes, since no other one was given.
    confirm: async () => true,
    log: {
      step: (m) => out.stdout(m),
      info: (m) => out.stdout(m),
      success: (m) => out.stdout(`✓ ${m}`),
      warn: (m) => out.stderr(`! ${m}`),
      error: (m) => out.stderr(`✗ ${m}`),
    },
  };
}
