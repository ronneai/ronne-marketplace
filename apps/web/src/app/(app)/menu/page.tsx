import { getTranslations } from "next-intl/server";
import { MenuList } from "@/components/app-shell/MenuList";
import { canPropose, navFor } from "@/components/app-shell/nav";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { signOutFromMenu } from "@/features/account/actions";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { holdPage } from "../hold";
import { loadShell } from "../shell";

export { generateMetadata } from "./metadata";

/**
 * The Menu as a page (066): where the header's Menu button goes without JavaScript, so every link
 * and Sign out still work. With JavaScript the button opens the same list in a side sheet.
 */
const MenuPage = async () => {
  await holdPage();
  const { user, theme, navCounts, workspaces, current } = await loadShell();
  const t = await getTranslations("shell.menu");
  return (
    <>
      <PageHeader title={t("title")} />
      <Panel padding="sm">
        <MenuList
          user={user}
          items={navFor(user, navCounts)}
          counts={navCounts}
          workspaces={workspaces}
          current={current}
          propose={canPropose(user)}
          appearance={<ThemeToggle theme={theme} />}
          signOutAction={signOutFromMenu}
        />
      </Panel>
    </>
  );
};

export default MenuPage;
