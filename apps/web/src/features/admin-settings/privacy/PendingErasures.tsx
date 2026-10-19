"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { retryErasures } from "../actions";
import type { SettingsActionState } from "../types";

export type PendingErasureView = { userId: string; startedAt: Date };

/**
 * Erasures whose audit log rewrite wasn't completed (103, on MySQL and MariaDB: the server
 * stopped between the account's erasure and the end of the rewrite). The address is still in
 * some events until Retry, or the retention purge's next run, finishes it. Nothing is shown when
 * there's none.
 */
export const PendingErasures = ({ erasures }: { erasures: readonly PendingErasureView[] }) => {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(retryErasures, {});
  if (erasures.length === 0) return state.done ? <Notice kind="info" title={state.done} /> : null;
  const count = erasures.length;
  return (
    <form action={action} aria-label="Erasures not completed" className="grid gap-2">
      <Notice
        kind="warn"
        title={
          count === 1 ? "An erasure wasn't completed." : `${count} erasures weren't completed.`
        }
      >
        <p>
          The server stopped before the audit log was rewritten, so the erased address is still in
          some events. Retry finishes the rewrite and records the erasure; the retention purge also
          finishes it on its next run.
        </p>
        <ul className="mt-1 list-disc pl-5">
          {erasures.map((erasure) => (
            <li key={erasure.userId}>
              Started <LocalTime value={erasure.startedAt} />
            </li>
          ))}
        </ul>
      </Notice>
      <FieldError id="erasures-error">{state.error}</FieldError>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Retry
        </Button>
      </div>
    </form>
  );
};
