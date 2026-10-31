import { expect, type Page } from "@playwright/test";

/** The visual viewport: what the person sees, with the keyboard and the browser bars out of it. */
export const viewportOf = (page: Page) =>
  page.evaluate(() => ({
    width: window.visualViewport?.width ?? innerWidth,
    height: window.visualViewport?.height ?? innerHeight,
  }));

/** The box of the toast of a kind, once it is shown. */
export const toastBox = async (page: Page, kind: string) => {
  const toast = page.locator(`[data-toast-kind=${kind}]`);
  await expect(toast).toBeVisible();
  // Let Sonner's enter animation settle: the same place twice, 150ms apart.
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const y = (await toast.boundingBox())?.y ?? Number.NaN;
        const settled = y === last;
        last = y;
        return settled;
      },
      { message: "the toast has stopped moving", intervals: [150] },
    )
    .toBe(true);
  const box = await toast.boundingBox();
  expect(box, "has a box").not.toBeNull();
  return box as { x: number; y: number; width: number; height: number };
};

/** Whether what is on top at the toast's centre is the toast itself (not a backdrop over it). */
export const toastIsOnTop = (page: Page, kind: string) =>
  page.evaluate((k) => {
    const toast = document.querySelector(`[data-toast-kind=${k}]`);
    if (!toast) return false;
    const { x, y, width, height } = toast.getBoundingClientRect();
    const top = document.elementFromPoint(x + width / 2, y + height / 2);
    return top !== null && toast.contains(top);
  }, kind);

/** Where a toast belongs on a screen with no bar: bottom right, or across the bottom on a phone. */
export const expectInTheCorner = (
  box: { x: number; y: number; width: number; height: number },
  screen: { width: number; height: number },
) => {
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(screen.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(screen.height + 1);
  if (screen.width < 640) {
    // A phone: across the bottom with the 16px gutter.
    expect(Math.abs(box.x - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.x + box.width - (screen.width - 16))).toBeLessThanOrEqual(2);
  } else {
    // From `sm`: 16px from the right edge, at most 24rem wide.
    expect(Math.abs(box.x + box.width - (screen.width - 16))).toBeLessThanOrEqual(2);
    expect(box.width).toBeLessThanOrEqual(384 + 1);
  }
};
