import type { ShellUser } from "@/components/app-shell/nav";

/**
 * /styleguide is open in development, and root-only in production (feature 032). Until sign-in
 * exists (006), there's no user in production, so it answers 404 there.
 */
export function canViewStyleguide(nodeEnv: string | undefined, user: ShellUser | null): boolean {
  return nodeEnv !== "production" || user?.role === "root";
}
