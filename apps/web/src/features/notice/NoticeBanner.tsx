import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import type { Notice as InstanceNotice } from "@/server/domains/settings/models/notice-policy";

/**
 * The instance notice (feature 124) as people read it: root's words, always output as text (React
 * escapes them; a `<b>` shows as typed), and an optional link. Information is the quiet frame,
 * Warning the amber one. `action` is a place for the dismiss button.
 */
export const NoticeBanner = ({
  notice,
  action,
}: {
  notice: Pick<InstanceNotice, "message" | "link" | "tone">;
  action?: ReactNode;
}) => {
  const link = notice.link;
  return (
    <div className="flex items-start gap-3">
      <Notice
        kind={notice.tone === "warning" ? "warn" : "info"}
        className="min-w-0 flex-1"
        title={<span className="[overflow-wrap:anywhere]">{notice.message}</span>}
      >
        {link ? (
          <p>
            {link.href.startsWith("/") ? (
              <Link href={link.href} className="underline [overflow-wrap:anywhere]">
                {link.label}
              </Link>
            ) : (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline [overflow-wrap:anywhere]"
              >
                {link.label}
              </a>
            )}
          </p>
        ) : null}
      </Notice>
      {action}
    </div>
  );
};
