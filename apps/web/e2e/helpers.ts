import { type Download, expect, type Page, type Response } from "@playwright/test";

/** The sidebar (119), where the navigation and the signed-in person are from `lg`. */
export const sidebar = (page: Page) => page.getByRole("complementary", { name: "Sidebar" });

/**
 * The signed-in user's name on the person's menu button, at the sidebar's foot (119). It shows the
 * name, not the email; the open menu shows both.
 */
export const headerName = (page: Page, name: string) =>
  sidebar(page).locator("summary").getByText(name, { exact: true });

/**
 * The file a click downloads (104): waits for the browser's download, and when none starts says
 * what the data routes answered instead (status, type, disposition) and where the page is, so a
 * failure on another machine explains itself.
 */
export const downloadAfter = async (page: Page, click: () => Promise<void>): Promise<Download> => {
  const seen: string[] = [];
  const note = async (response: Response) => {
    if (!/\/data(\?|$)/.test(response.url())) return;
    const headers = response.headers();
    const body = headers["content-type"]?.includes("json")
      ? (await response.text().catch(() => "")).slice(0, 200)
      : "";
    seen.push(
      `${response.status()} ${headers["content-type"] ?? ""} ${headers["content-disposition"] ?? ""} ${body}`,
    );
  };
  page.on("response", note);
  try {
    const [file] = await Promise.all([page.waitForEvent("download", { timeout: 15_000 }), click()]);
    return file;
  } catch (error) {
    throw new Error(
      `No download started. The page is at ${page.url()}; the data routes answered: ${JSON.stringify(seen)}. ${String(error)}`,
    );
  } finally {
    page.off("response", note);
  }
};

/**
 * A user's page (123): searches the Users list for the email and follows the row's Open link,
 * since the actions are on that page, not on the list's rows. Root only; the Open link on a wide
 * screen, the email on a phone.
 */
export const openUser = async (page: Page, email: string) => {
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  const open = page.getByRole("link", { name: `Open ${email}`, exact: true });
  // On a phone the Open column is hidden and the email is the link, covering its row.
  if (await open.isVisible()) await open.click();
  else await page.getByRole("link", { name: email, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
};

/** A user's row in the Users list, by its Open link (the email's cell holds a copy button too). */
export const userRow = (page: Page, email: string) =>
  page.getByRole("row").filter({
    has: page.getByRole("link", { name: `Open ${email}`, exact: true }),
  });
