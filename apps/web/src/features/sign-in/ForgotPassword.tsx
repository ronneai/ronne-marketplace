import { docsHref } from "@/components/help/topics";
import { NewTabLink } from "@/components/ui/NewTabLink";

/**
 * "Forgot?" opens a note on who can reset a password. The MVP sends no email (spec 006). A native
 * <details>, so it works without JavaScript. `resetCommand` is reset-root-password as typed for how
 * this instance was installed (#147), worked out on the server.
 */
export const ForgotPassword = ({ resetCommand }: { resetCommand: string }) => {
  return (
    <details className="group text-right">
      <summary className="cursor-pointer list-none text-sm text-link underline-offset-2 hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        Forgot?
      </summary>
      <p className="mt-2 max-w-72 text-left text-xs text-muted">
        Ask a root to reset your password in Users. If you&apos;re the only root, run{" "}
        <code className="font-mono break-words text-fg">{resetCommand}</code> where Ronne AI
        Marketplace is installed.{" "}
        <NewTabLink
          href={docsHref("install", "root")}
          className="text-link underline-offset-2 hover:underline"
        >
          Root accounts
        </NewTabLink>
      </p>
    </details>
  );
};
