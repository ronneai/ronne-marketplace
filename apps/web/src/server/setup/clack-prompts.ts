import * as p from "@clack/prompts";
import { SetupCancelledError, type SetupPrompts } from "./prompts";

/** clack returns a symbol when the user presses Ctrl+C; setup turns that into SetupCancelledError. */
const answered = <T>(value: T): Exclude<T, symbol> => {
  if (p.isCancel(value)) throw new SetupCancelledError();
  return value as Exclude<T, symbol>;
};

/** SetupPrompts for a terminal, using @clack/prompts. */
export const clackPrompts: SetupPrompts = {
  interactive: true,
  select: async (q) =>
    answered(
      await p.select({
        message: q.message,
        options: q.choices.map((c) => ({ value: c.value, label: c.label, hint: c.hint })) as never,
        initialValue: q.initial,
      }),
    ),
  text: async (q) =>
    answered(
      await p.text({
        message: q.message,
        initialValue: q.initial,
        validate: q.validate ? (value) => q.validate?.(value ?? "") : undefined,
      }),
    ),
  password: async (q) =>
    answered(
      await p.password({
        message: q.message,
        validate: q.validate ? (value) => q.validate?.(value ?? "") : undefined,
      }),
    ),
  confirm: async (q) => answered(await p.confirm({ message: q.message, initialValue: q.initial })),
  log: {
    step: (m) => p.log.step(m),
    info: (m) => p.log.info(m),
    success: (m) => p.log.success(m),
    warn: (m) => p.log.warn(m),
    error: (m) => p.log.error(m),
  },
};
