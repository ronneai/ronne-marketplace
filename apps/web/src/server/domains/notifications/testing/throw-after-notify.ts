/**
 * For the rollback tests of 139 (task 3): a test file mocks the `notify` service with this wrapper
 * (`vi.mock("…/notifications/services/notify", async (original) => throwAfterNotify(await original()))`),
 * and arms it to make a change fail right AFTER its notification was written. Everything the change
 * wrote, the notification included, must then be gone: the transaction owns them all.
 */
/** `fired` counts the failures it caused, so a test that tolerates how the failure is reported can still show it happened. */
export const rollbackProbe = { armed: false, fired: 0 };

type NotifyModule = { notify: (...args: never[]) => Promise<number> };

export const throwAfterNotify = <T extends NotifyModule>(actual: T): T => ({
  ...actual,
  notify: async (...args: Parameters<T["notify"]>) => {
    const written = await (actual.notify as (...a: unknown[]) => Promise<number>)(...args);
    if (rollbackProbe.armed) {
      rollbackProbe.fired += 1;
      throw new Error("failed after notify");
    }
    return written;
  },
});
