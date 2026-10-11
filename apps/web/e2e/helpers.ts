import type { Page } from "@playwright/test";

/** The sidebar (119), where the navigation and the signed-in person are from `lg`. */
export const sidebar = (page: Page) => page.getByRole("complementary", { name: "Sidebar" });

/**
 * The signed-in user's name on the person's menu button, at the sidebar's foot (119). It shows the
 * name, not the email; the open menu shows both.
 */
export const headerName = (page: Page, name: string) =>
  sidebar(page).locator("summary").getByText(name, { exact: true });
