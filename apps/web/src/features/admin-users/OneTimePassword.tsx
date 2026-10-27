import { useTranslations } from "next-intl";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Notice } from "@/components/ui/Notice";
import type { OneTimePassword as OneTime } from "./types";

/** The email and password, shown once after creating a user or resetting a password (spec 008). */
export const OneTimePassword = ({ value }: { value: OneTime }) => {
  const t = useTranslations("admin.users.oneTime");
  return (
    <div className="grid gap-3">
      <Notice kind="warn" title={t("title")}>
        {t("body")}
      </Notice>
      <div className="grid gap-1.5">
        <p className="text-xs font-semibold text-muted">{t("email")}</p>
        <CopyableCommand command={value.email} prompt={false} />
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs font-semibold text-muted">{t("password")}</p>
        <CopyableCommand command={value.password} prompt={false} />
      </div>
    </div>
  );
};
