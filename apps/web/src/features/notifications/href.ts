import { itemPath } from "@/components/catalogue/ItemCard";
import { workspacePath } from "@/features/admin-workspaces/list";
import type { NotificationLink } from "@/server/domains/notifications/models/visibility";

/**
 * Where a notification's link goes (139). The domain says what it leads to; the address is the
 * web app's.
 */
export const notificationHref = (link: NotificationLink): string => {
  switch (link.to) {
    case "submission":
      return `/submissions/${encodeURIComponent(link.id)}`;
    case "workspace":
      return workspacePath(link.name);
    case "workspaces":
      return "/workspaces";
    case "requests":
      return "/workspaces/requests";
    case "item":
      return itemPath({ workspace: link.workspace, scope: link.scope, name: link.name });
    case "feedback":
      return "/admin/feedback";
    case "updates":
      return "/admin/settings?tab=updates";
  }
};
