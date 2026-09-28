import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { type SubmissionStatus, statusLabel } from "@/server/domains/submissions/models/status";

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

/** A submission's status (features 012–014), the same on every page. */
export const StatusBadge = ({ status }: { status: SubmissionStatus }) => (
  <Badge tone={TONE[status]}>{statusLabel(status)}</Badge>
);
