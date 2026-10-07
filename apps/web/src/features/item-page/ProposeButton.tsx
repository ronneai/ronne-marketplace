"use client";

import { GitPullRequest } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { proposeChangeAction } from "./actions";

/**
 * Propose a change (feature 017): a draft of the item's next version, starting from the version the
 * page shows, opened in the editor. Members of the item's workspace may propose (091); anyone else
 * gets the server's "not a member" message under the button.
 */
export const ProposeButton = ({ item, version }: { item: string; version: string }) => {
  const router = useRouter();
  const [error, setError] = useState<{ text: string; notMember: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await proposeChangeAction(item, version);
            if (!result.ok)
              return setError({ text: result.error, notMember: result.notMember ?? false });
            router.push(`/submissions/${result.id}`);
          })
        }
      >
        <GitPullRequest size={16} aria-hidden="true" />
        Propose a change
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-error-text">
          {error.text}
        </p>
      ) : null}
      {error?.notMember ? <Help id="join" className="max-w-xs" /> : null}
      <Help id="propose" className="max-w-xs" />
    </div>
  );
};
