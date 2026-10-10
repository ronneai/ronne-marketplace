"use client";

import { GitPullRequest } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { AskToJoinLink } from "@/components/workspaces/AskToJoinLink";
import { type ProposeResult, proposeChangeAction } from "./actions";

/** A refused proposal, as the action returned it: the message, and the workspace to ask to join. */
export type ProposeRefused = Exclude<ProposeResult, { ok: true }>;

/**
 * Why Propose a change was refused, under the button; for someone not in the item's workspace
 * (091), Ask to join it and "How do I join?" (094).
 */
export const ProposeRefusal = ({ refused }: { refused: ProposeRefused }) => (
  <>
    <p role="alert" className="text-xs text-error-text">
      {refused.error}
    </p>
    {refused.joinWorkspace ? (
      <div className="flex items-center gap-2 text-xs">
        <AskToJoinLink workspace={refused.joinWorkspace} />
        <Help id="join" className="max-w-xs" />
      </div>
    ) : null}
  </>
);

/**
 * Propose a change (feature 017): a draft of the item's next version, starting from the version the
 * page shows, opened in the editor. Members of the item's workspace may propose (091); anyone else
 * gets the server's "not a member" message under the button, with Ask to join (094).
 */
export const ProposeButton = ({ item, version }: { item: string; version: string }) => {
  const router = useRouter();
  const [refused, setRefused] = useState<ProposeRefused | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            setRefused(null);
            const result = await proposeChangeAction(item, version);
            if (!result.ok)
              // Kept as the action returned it, so the workspace to join can't be dropped on the way.
              return setRefused(result);
            router.push(`/submissions/${result.id}`);
          })
        }
      >
        <GitPullRequest size={16} aria-hidden="true" />
        Propose a change
      </Button>
      {refused ? <ProposeRefusal refused={refused} /> : null}
      <Help id="propose" className="max-w-xs" />
    </div>
  );
};
