/** Why a command stopped, with the exit code it ends with (spec 022). */
export class RmkError extends Error {
  constructor(
    message: string,
    /** 1 an error; 2 a usage error; 3 conflicts left in place. */
    readonly exitCode: 1 | 2 | 3 = 1,
    readonly code: string = "error",
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "RmkError";
  }
}

export const usage = (message: string) => new RmkError(message, 2, "usage");
