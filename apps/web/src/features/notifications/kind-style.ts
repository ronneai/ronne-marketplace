import {
  ArrowRightLeft,
  CircleArrowUp,
  CircleCheck,
  CircleX,
  Inbox,
  Link2Off,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Package,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import type { NotificationKind } from "@/server/domains/notifications/models/notification";

/** The icon of each kind's tile in the list. */
const ICONS: Record<NotificationKind, LucideIcon> = {
  "submission.approved": CircleCheck,
  "submission.approved_override": ShieldCheck,
  "submission.changes_requested": Pencil,
  "submission.rejected": CircleX,
  "submission.comment": MessageSquare,
  "submission.released": Package,
  "submission.dependency_rejected": Link2Off,
  "submission.resubmitted": RefreshCw,
  "join_request.approved": UserPlus,
  "join_request.declined": UserX,
  "scope_move.moved": ArrowRightLeft,
  "scope_move.declined": ArrowRightLeft,
  "item_move.moved": ArrowRightLeft,
  "item_move.declined": ArrowRightLeft,
  "membership.added": Users,
  "membership.removed": UserMinus,
  "membership.role_changed": UserCog,
  "request.join_waiting": Inbox,
  "request.scope_move_waiting": Inbox,
  "request.item_move_waiting": Inbox,
  "feedback.new": Megaphone,
  "instance.update_available": CircleArrowUp,
};

/** Kinds that say something went against the person's work: the only ones drawn in red. */
const NEEDS_ATTENTION: ReadonlySet<NotificationKind> = new Set([
  "submission.rejected",
  "submission.changes_requested",
  "submission.dependency_rejected",
]);

export const iconOf = (kind: NotificationKind): LucideIcon => ICONS[kind];

/** The tile's classes: tokens only; red for what needs attention, neutral for the rest. */
export const tileClass = (kind: NotificationKind): string =>
  NEEDS_ATTENTION.has(kind) ? "bg-error-subtle text-error-text" : "bg-tint text-fg";
