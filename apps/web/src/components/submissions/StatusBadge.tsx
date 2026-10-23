import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { SubmissionStatus } from "@/server/domains/submissions/models/status";

/** How each status looks: under way in teal, needing the author's attention in amber, refused in red. */
const TONE: Record<SubmissionStatus, BadgeTone> = {
  draft: "muted",
  submitted: "accent",
  changes_requested: "warning",
  approved: "accent",
  rejected: "error",
  withdrawn: "muted",
  published: "accent",
};

/**
 * A submission's status (features 012–014), the same on every page, in the person's language
 * (131): `withdrawn` reads "archived" (057).
 */
export const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  const t = useTranslations("author.status");
  return <Badge tone={TONE[status]}>{t(status)}</Badge>;
};
