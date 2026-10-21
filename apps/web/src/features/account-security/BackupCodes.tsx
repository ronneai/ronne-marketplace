"use client";

import { Check, Copy, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { copyText, selectText } from "@/components/ui/copy";
import { Notice } from "@/components/ui/Notice";

/** The codes as a text file: one a line, under two lines that say what they are for. */
export const backupCodesFile = (
  codes: readonly string[],
  intro: readonly [string, string],
): string => [...intro, "", ...codes, ""].join("\n");

/**
 * Ten backup codes, shown once (feature 105): Copy all, Download (.txt), and what happens next in
 * `children` ("I've saved them"). Without JavaScript the codes are still there to select.
 */
export const BackupCodes = ({ codes, children }: { codes: string[]; children?: ReactNode }) => {
  const t = useTranslations("account.security.backup");
  const [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  const list = useRef<HTMLOListElement>(null);
  const copy = async () => {
    const result = await copyText(codes.join("\n"));
    if (result === "manual") selectText(list.current);
    setCopied(result);
    setTimeout(() => setCopied("idle"), result === "copied" ? 2000 : 6000);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([backupCodesFile(codes, [t("fileTitle"), t("fileAbout")])], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "ronne-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section aria-labelledby="backup-codes-title" className="grid gap-3">
      <div className="flex items-center gap-2">
        <h3 id="backup-codes-title" className="text-sm font-semibold text-fg">
          {t("title")}
        </h3>
        <Help id="backup-codes-once" />
      </div>
      <Notice kind="warn" title={t("saveTitle")}>
        {t("save")}
      </Notice>
      <ol
        ref={list}
        aria-label={t("title")}
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-control border border-hairline bg-canvas p-3 font-mono text-[13px] text-fg"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied === "copied" ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
          {copied === "copied" ? t("copied") : copied === "manual" ? t("manual") : t("copyAll")}
        </Button>
        <Button variant="secondary" onClick={download}>
          <Download aria-hidden size={14} />
          {t("download")}
        </Button>
        {children}
      </div>
    </section>
  );
};
