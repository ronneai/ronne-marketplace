"use client";

import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/toast";

/** Each kind of toast (feature 138), for looking at in both themes and at every size. */
export const ToastDemo = () => {
  const toast = useToast();
  return (
    <Panel padding="lg" className="grid gap-3">
      <h2 className="text-xs font-semibold text-muted">toasts (feature 138)</h2>
      <p className="text-sm text-muted">
        The result of an action, at the bottom right (across the bottom on a phone, above the action
        bar). OK and info go after 5 seconds; a warning or an error stays until it is closed.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => toast.ok("Draft saved")}>
          Show OK
        </Button>
        <Button variant="secondary" onClick={() => toast.info("Search is rebuilding")}>
          Show info
        </Button>
        <Button variant="secondary" onClick={() => toast.warning("The scan isn't set up")}>
          Show warning
        </Button>
        <Button variant="secondary" onClick={() => toast.error("Couldn't revoke the token")}>
          Show error
        </Button>
      </div>
    </Panel>
  );
};
