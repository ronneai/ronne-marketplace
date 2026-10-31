"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/toast";

const FILLER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const DialogDemo = () => {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create user">
        <p className="text-sm text-muted">
          A flat panel on the native dialog: focus is trapped, the page behind is inert, and Esc
          closes it.
        </p>
        {/* Long enough to scroll on a phone, so the buttons stick to the bottom of the screen. */}
        {FILLER.map((line) => (
          <p key={line} className="mt-3 text-sm text-muted">
            Line {line} of the body, so the buttons below have something to stay under.
          </p>
        ))}
        <DialogActions>
          <Button variant="secondary" onClick={() => toast.ok("Said over the dialog")}>
            Toast from here
          </Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
