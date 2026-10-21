import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import {
  type Notice as InstanceNotice,
  noticeParts,
} from "@/server/domains/settings/models/notice-policy";

/**
 * The instance notice (feature 124) as people read it: root's words, always output as text (React
 * escapes them; a `<b>` shows as typed), with the links written inline as `[words](address)` drawn
 * as links. Information is light blue, Warning amber. Only the saved notice, read from the database,
 * comes here: the Notice tab's preview draws what is typed with `NoticePreview`, whose links are not
 * links (docs/knowledge/codeql-dom-text.md). `action` is a control inside the box, at its top right: the dismiss icon.
 */
export const NoticeBanner = ({
  notice,
  action,
}: {
  notice: Pick<InstanceNotice, "message" | "tone">;
  action?: ReactNode;
}) => (
  <Notice
    kind={notice.tone === "warning" ? "warn" : "info"}
    action={action}
    title={
      <span className="[overflow-wrap:anywhere]">
        {noticeParts(notice.message).map((part, index) =>
          "text" in part ? (
            // The parts never reorder, so their place in the message is their key.
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list in the message's order
            <span key={index}>{part.text}</span>
          ) : part.href.startsWith("/") ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list in the message's order
            <Link key={index} href={part.href} className="underline">
              {part.label}
            </Link>
          ) : (
            <a
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list in the message's order
              key={index}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {part.label}
            </a>
          ),
        )}
      </span>
    }
  />
);
