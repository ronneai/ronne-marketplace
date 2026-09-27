/**
 * Everything setup asks or tells the user goes through this interface. The clack implementation
 * talks to a terminal; tests and non-interactive mode (flags and env vars) provide their own.
 * Each question has a stable `id`, so answers can be scripted.
 */
export type Choice<T extends string> = { value: T; label: string; hint?: string };

export type Validator = (value: string) => string | undefined;

export interface SetupPrompts {
  /** False in non-interactive mode: a failed check then stops setup instead of asking again. */
  readonly interactive: boolean;
  select<T extends string>(q: {
    id: string;
    message: string;
    choices: Choice<T>[];
    initial?: T;
  }): Promise<T>;
  text(q: { id: string; message: string; initial?: string; validate?: Validator }): Promise<string>;
  password(q: { id: string; message: string; validate?: Validator }): Promise<string>;
  confirm(q: { id: string; message: string; initial: boolean }): Promise<boolean>;
  log: {
    step(message: string): void;
    info(message: string): void;
    success(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

/** The user pressed Ctrl+C at a prompt. */
export class SetupCancelledError extends Error {
  constructor() {
    super("Setup was cancelled. Nothing after the last completed step was written.");
    this.name = "SetupCancelledError";
  }
}
