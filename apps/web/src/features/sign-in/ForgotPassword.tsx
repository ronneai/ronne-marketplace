"use client";

import { useEffect, useState } from "react";
import { docsHref } from "@/components/help/topics";
import { cn } from "@/components/ui/cn";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { Popover } from "@/components/ui/Popover";

const LINK = "text-sm text-link underline-offset-2 hover:underline";

/**
 * "Forgot?" opens a note on who can reset a password. The MVP sends no email (spec 006).
 * `resetCommand` is reset-root-password as typed for how this instance was installed (#147),
 * worked out on the server. It opens in a popover (owner, 2026-10-09); until JavaScript runs, a
 * native <details> that opens in place, so it works without it.
 */
export const ForgotPassword = ({ resetCommand }: { resetCommand: string }) => {
  // The popover exists only once JavaScript runs; the first client render matches the server's.
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);

  if (!enhanced)
    return (
      <details className="group text-right">
        <summary
          className={cn(
            LINK,
            "cursor-pointer list-none outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden",
          )}
        >
          Forgot?
        </summary>
        <Note resetCommand={resetCommand} className="mt-2 max-w-72 text-muted" />
      </details>
    );
  return (
    <Popover
      label="Forgot your password?"
      button="Forgot?"
      buttonClassName={LINK}
      placement="bottom-end"
      maxWidth={288}
    >
      <Note resetCommand={resetCommand} />
    </Popover>
  );
};

const Note = ({ resetCommand, className }: { resetCommand: string; className?: string }) => (
  <p className={cn("text-left text-xs", className)}>
    Ask a root to reset your password in Users. If you&apos;re the only root, run{" "}
    <code className="font-mono break-words text-fg">{resetCommand}</code> where Ronne AI Marketplace
    is installed.{" "}
    <NewTabLink
      href={docsHref("install", "root")}
      className="text-link underline-offset-2 hover:underline"
    >
      Root accounts
    </NewTabLink>
  </p>
);
