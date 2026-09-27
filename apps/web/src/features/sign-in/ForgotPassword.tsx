/**
 * "Forgot?" opens a note on who can reset a password. The MVP sends no email (spec 006). A native
 * <details>, so it works without JavaScript.
 */
export const ForgotPassword = () => {
  return (
    <details className="group text-right">
      <summary className="cursor-pointer list-none text-sm text-link underline-offset-2 hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        Forgot?
      </summary>
      <p className="mt-2 max-w-72 text-left text-xs text-muted">
        Ask a root administrator to reset your password. If you&apos;re root, run{" "}
        <code className="font-mono text-fg">pnpm run reset-root-password</code> where Ronne is
        installed.
      </p>
    </details>
  );
};
