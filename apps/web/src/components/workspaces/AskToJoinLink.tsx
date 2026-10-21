import Link from "next/link";
import { useTranslations } from "next-intl";
import { joinPath } from "./join";

/**
 * "Ask to join <workspace>" (094), where a "not a member" refusal shows (091): on the item page's
 * Propose a change, the read-only draft, and Submit selected's results. It opens the join page.
 */
export const AskToJoinLink = ({ workspace }: { workspace: string }) => {
  const t = useTranslations("workspaces");
  return (
    <Link
      href={joinPath(workspace)}
      className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {t("askToJoin", { workspace })}
    </Link>
  );
};
