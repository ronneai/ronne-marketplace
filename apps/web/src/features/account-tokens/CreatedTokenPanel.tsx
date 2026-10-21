import { useTranslations } from "next-intl";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import type { CreatedToken } from "./types";

/** The new token, shown once, with a ready-to-use `rmk login --token` line (spec 009). */
export const CreatedTokenPanel = ({ value }: { value: CreatedToken }) => {
  const t = useTranslations("account.tokens.created_panel");
  return (
    <div className="grid gap-3">
      <Notice kind="warn" title={t("copyNow")}>
        {t("copyBody")}
      </Notice>
      <div className="grid gap-1.5">
        <p className="text-xs font-semibold text-muted">{t("token", { name: value.name })}</p>
        <CopyableCommand command={value.token} prompt={false} />
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs font-semibold text-muted">{t("signIn")}</p>
        <CopyableCommand command={`rmk login --token ${value.token}`} />
      </div>
      <p className="text-xs text-muted">
        {value.expiresAt ? (
          <>
            {t("expires")} <LocalTime value={value.expiresAt} precision="day" />.
          </>
        ) : (
          t("never")
        )}
      </p>
    </div>
  );
};
