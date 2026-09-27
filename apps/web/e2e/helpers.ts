import type { Page } from "@playwright/test";

/**
 * The signed-in user's name in the header's menu button. The header shows the name, not the email;
 * the open menu shows both.
 */
export const headerName = (page: Page, name: string) =>
  page.getByRole("banner").locator("summary").getByText(name, { exact: true });
