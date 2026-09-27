import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Notice } from "@/components/ui/Notice";
import type { OneTimePassword as OneTime } from "./types";

/** The email and password, shown once after creating a user or resetting a password (spec 008). */
export const OneTimePassword = ({ value }: { value: OneTime }) => (
  <div className="grid gap-3">
    <Notice kind="warn" title="Shown once">
      Give this to the user through a trusted channel. It won&apos;t be shown again.
    </Notice>
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold text-muted">Email</p>
      <CopyableCommand command={value.email} prompt={false} />
    </div>
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold text-muted">Password</p>
      <CopyableCommand command={value.password} prompt={false} />
    </div>
  </div>
);
