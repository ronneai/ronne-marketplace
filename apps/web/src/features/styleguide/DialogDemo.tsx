"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export const DialogDemo = () => {
  const [open, setOpen] = useState(false);
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
      </Dialog>
    </>
  );
};
