import type { ShellUser } from "@/components/app-shell/nav";

/** /styleguide is open to anyone signed in during development, and root-only in production (feature 032). */
export function canViewStyleguide(nodeEnv: string | undefined, user: ShellUser | null): boolean {
  return nodeEnv !== "production" || user?.role === "root";
}
