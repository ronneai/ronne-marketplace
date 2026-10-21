import { Notice } from "@/components/ui/Notice";
import {
  type Notice as InstanceNotice,
  noticeParts,
} from "@/server/domains/settings/models/notice-policy";

/**
 * The notice as the Notice tab's preview draws it while root types (feature 124): the same frame,
 * words and underlined link words as `NoticeBanner`, but a link is not a link, so what is typed
 * never reaches an `href` (CodeQL's "DOM text reinterpreted as HTML", docs/knowledge/codeql-dom-text.md)
 * and a click in the preview doesn't leave the form.
 */
export const NoticePreview = ({ notice }: { notice: Pick<InstanceNotice, "message" | "tone"> }) => (
  <Notice
    kind={notice.tone === "warning" ? "warn" : "info"}
    title={
      <span className="[overflow-wrap:anywhere]">
        {noticeParts(notice.message).map((part, index) =>
          "text" in part ? (
            // The parts never reorder, so their place in the message is their key.
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list in the message's order
            <span key={index}>{part.text}</span>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list in the message's order
            <span key={index} className="underline">
              {part.label}
            </span>
          ),
        )}
      </span>
    }
  />
);
