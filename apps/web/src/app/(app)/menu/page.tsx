import { MenuList } from "@/components/app-shell/MenuList";
import { navFor } from "@/components/app-shell/nav";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { signOutFromMenu } from "@/features/account/actions";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { loadShell } from "../shell";

export const metadata = { title: "Menu · Ronne AI Marketplace" };

/**
 * The Menu as a page (066): where the header's Menu button goes without JavaScript, so every link
 * and Sign out still work. With JavaScript the button opens the same list in a side sheet.
 */
const MenuPage = async () => {
  const { user, theme, navCounts } = await loadShell();
  return (
    <>
      <PageHeader title="Menu" />
      <Panel padding="sm">
        <MenuList
          user={user}
          items={navFor(user, navCounts)}
          counts={navCounts}
          appearance={<ThemeToggle theme={theme} />}
          signOutAction={signOutFromMenu}
        />
      </Panel>
    </>
  );
};

export default MenuPage;
