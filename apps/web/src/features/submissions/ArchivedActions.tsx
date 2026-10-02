"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DeleteArchivedDialog, RestoreButton } from "../draft-editor/SubmitDialogs";

/** An archived row's actions on My submissions (057): Restore, and Delete when allowed. */
export const ArchivedActions = ({
  id,
  name,
  canDelete,
}: {
  id: string;
  name: string;
  canDelete: boolean;
}) => {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RestoreButton draftId={id} />
      {canDelete ? (
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          Delete
        </Button>
      ) : null}
      {deleting ? (
        <DeleteArchivedDialog
          draftId={id}
          itemName={name}
          fromList
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </div>
  );
};
