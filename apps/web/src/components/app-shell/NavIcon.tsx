import {
  BookOpen,
  Boxes,
  House,
  LayoutGrid,
  type LucideIcon,
  MessageSquareCheck,
  Plus,
  ScrollText,
  Send,
  Settings,
  SquareTerminal,
  UserPlus,
  Users,
} from "lucide-react";
import type { NavIcon as Name } from "./nav";

const ICONS: Record<Name, LucideIcon> = {
  home: House,
  catalogue: LayoutGrid,
  workspaces: Boxes,
  requests: UserPlus,
  reviews: MessageSquareCheck,
  submissions: Send,
  users: Users,
  audit: ScrollText,
  settings: Settings,
  docs: BookOpen,
  tokens: SquareTerminal,
  propose: Plus,
};

/** A nav item's icon (119), by the name `nav.ts` gives it. Decorative: the link has its name. */
export const NavIcon = ({ name, size = 18 }: { name: Name; size?: number }) => {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden className="shrink-0" />;
};
