"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DecisionDialog } from "./DecisionBar";

/**
 * Root's Override on the security scan's card (137): opens the scan override's decision, which
 * approves the submission past the gate with a reason, recorded in the thread and the audit log.
 */
export const ScanOverride = ({
  id,
  name,
  revision,
}: {
  id: string;
  name: string;
  /** The revision the page shows: the approval goes only if it's still the latest (AUTHZ-2). */
  revision: number | null;
}) => {
  const t = useTranslations("author.scan.card");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("override")}
      </Button>
      {open ? (
        <DecisionDialog
          id={id}
          name={name}
          decision="scan_override"
          revision={revision}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
};
