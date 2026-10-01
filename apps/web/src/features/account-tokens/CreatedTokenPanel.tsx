import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import type { CreatedToken } from "./types";

/** The new token, shown once, with a ready-to-use `rmk login --token` line (spec 009). */
export const CreatedTokenPanel = ({ value }: { value: CreatedToken }) => (
  <div className="grid gap-3">
    <Notice kind="warn" title="Copy it now">
      It won&apos;t be shown again. Anyone with it can act as you until it expires or you revoke it.
    </Notice>
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold text-muted">Token: {value.name}</p>
      <CopyableCommand command={value.token} prompt={false} />
    </div>
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold text-muted">Sign in rmk with it</p>
      <CopyableCommand command={`rmk login --token ${value.token}`} />
    </div>
    <p className="text-xs text-muted">
      {value.expiresAt ? (
        <>
          Expires <LocalTime value={value.expiresAt} precision="day" />.
        </>
      ) : (
        "It never expires."
      )}
    </p>
  </div>
);
