import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import {
  type Notice as InstanceNotice,
  noticeParts,
} from "@/server/domains/settings/models/notice-policy";

/**
 * The two shapes of address a notice link can have (`isNoticeHref` allows nothing else): a path on
 * this site and an `https://` address. Each is written out with its fixed start and the rest of
 * the address after it, which does not change the value but shows a reader (and CodeQL's
 * "DOM text reinterpreted as HTML" check, which cannot follow the validation) that the link can
 * never start with `javascript:` or another scheme. See docs/knowledge/codeql-dom-text.md.
 */
const HTTPS = "https://";
const onSite = (href: string) => `/${href.slice(1)}`;
const secure = (href: string) => `${HTTPS}${href.slice(HTTPS.length)}`;

/**
 * The instance notice (feature 124) as people read it: root's words, always output as text (React
 * escapes them; a `<b>` shows as typed), with the links written inline as `[words](address)` drawn
 * as links. Information is light blue, Warning amber. `action` is a control inside the box, at its top right: the dismiss icon.
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
            <Link key={index} href={onSite(part.href)} className="underline">
              {part.label}
            </Link>
          ) : (
            <a
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list in the message's order
              key={index}
              href={secure(part.href)}
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
