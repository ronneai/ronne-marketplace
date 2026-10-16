"use client";

import { Check, Copy, Download } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { copyText, selectText } from "@/components/ui/copy";
import { Notice } from "@/components/ui/Notice";

/** The codes as a text file: one a line, with what they are for. */
export const backupCodesFile = (codes: readonly string[]): string =>
  [
    "Ronne AI Marketplace: two-factor backup codes",
    "Each code works once, in place of a code from your authenticator app.",
    "",
    ...codes,
    "",
  ].join("\n");

/**
 * Ten backup codes, shown once (feature 105): Copy all, Download (.txt), and what happens next in
 * `children` ("I've saved them"). Without JavaScript the codes are still there to select.
 */
export const BackupCodes = ({ codes, children }: { codes: string[]; children?: ReactNode }) => {
  const [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  const list = useRef<HTMLOListElement>(null);
  const copy = async () => {
    const result = await copyText(codes.join("\n"));
    if (result === "manual") selectText(list.current);
    setCopied(result);
    setTimeout(() => setCopied("idle"), result === "copied" ? 2000 : 6000);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([backupCodesFile(codes)], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ronne-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section aria-labelledby="backup-codes-title" className="grid gap-3">
      <h3 id="backup-codes-title" className="text-sm font-semibold text-fg">
        Backup codes
      </h3>
      <Notice kind="warn" title="Save them now">
        They won&apos;t be shown again. Each one signs you in once if you lose your phone.
      </Notice>
      <ol
        ref={list}
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-control border border-hairline bg-canvas p-3 font-mono text-[13px] text-fg"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied === "copied" ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
          {copied === "copied"
            ? "Copied"
            : copied === "manual"
              ? "Selected: copy them"
              : "Copy all"}
        </Button>
        <Button variant="secondary" onClick={download}>
          <Download aria-hidden size={14} />
          Download (.txt)
        </Button>
        {children}
      </div>
    </section>
  );
};
