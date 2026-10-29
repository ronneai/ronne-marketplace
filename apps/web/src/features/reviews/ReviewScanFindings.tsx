"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { ScanFindings } from "@/components/scan/ScanFindings";
import { DecisionDialog } from "./DecisionBar";

/**
 * The review page's Security scan tab (137): the findings, and, for a reviewer who may request
 * changes, "Ask the author to fix it", which opens Request changes with the findings quoted.
 */
export const ReviewScanFindings = ({
  canAskFix,
  name,
  revision,
  ...props
}: Omit<ComponentProps<typeof ScanFindings>, "onAskFix"> & {
  canAskFix: boolean;
  name: string;
}) => {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <ScanFindings
        {...props}
        revision={revision}
        onAskFix={canAskFix ? (text) => setMessage(text) : undefined}
      />
      {message !== null ? (
        <DecisionDialog
          id={props.submissionId}
          name={name}
          decision="request_changes"
          revision={revision}
          initialText={message}
          onClose={() => setMessage(null)}
        />
      ) : null}
    </>
  );
};
