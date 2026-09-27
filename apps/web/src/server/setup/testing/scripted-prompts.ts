import { SetupCancelledError, type SetupPrompts } from "../prompts";

type Answer = string | boolean | typeof CANCEL;
export const CANCEL = Symbol("cancel");

/**
 * SetupPrompts that answer from a script, for tests. Each id maps to one answer or a list used in
 * order (for questions asked again). Like clack, an answer that fails the question's validator is
 * rejected and the next answer in the list is used. Unexpected questions fail the test.
 */
export function scriptedPrompts(
  script: Record<string, Answer | Answer[]>,
  options: { interactive?: boolean } = {},
) {
  const queues = new Map(
    Object.entries(script).map(([id, a]) => [id, Array.isArray(a) ? [...a] : [a]]),
  );
  const asked: string[] = [];
  const logs: { level: string; message: string }[] = [];
  const rejected: { id: string; value: string; reason: string }[] = [];

  const next = (id: string): Answer => {
    asked.push(id);
    const queue = queues.get(id);
    if (!queue || queue.length === 0)
      throw new Error(`Unexpected question "${id}" (no scripted answer left)`);
    const answer = queue.shift() as Answer;
    if (answer === CANCEL) throw new SetupCancelledError();
    return answer;
  };
  const validated = (id: string, validate?: (v: string) => string | undefined): string => {
    for (;;) {
      const value = String(next(id));
      const reason = validate?.(value);
      if (!reason) return value;
      rejected.push({ id, value, reason });
    }
  };
  const log = (level: string) => (message: string) => void logs.push({ level, message });

  const prompts: SetupPrompts = {
    interactive: options.interactive ?? true,
    select: async (q) => String(next(q.id)) as never,
    text: async (q) => validated(q.id, q.validate),
    password: async (q) => validated(q.id, q.validate),
    confirm: async (q) => Boolean(next(q.id)),
    log: {
      step: log("step"),
      info: log("info"),
      success: log("success"),
      warn: log("warn"),
      error: log("error"),
    },
  };
  return {
    prompts,
    asked,
    logs,
    rejected,
    unused: () => [...queues].filter(([, q]) => q.length > 0).map(([id]) => id),
  };
}
