// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flash } from "@/i18n/flash";
import { inLocaleAsync } from "@/test/intl";
import { FlashToastClient } from "./FlashToastClient";
import { Toaster } from "./Toaster";
import { dismissToasts } from "./toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const flash: Flash = { id: "one", kind: "ok", key: "draftDeleted", params: {} };
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-toast-kind]")];

const tick = async (ms: number) => {
  for (let left = ms; left > 0; left -= 250)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(250, left));
    });
};
const render = async (element: React.ReactNode) =>
  act(async () =>
    root.render(
      <>
        <Toaster />
        {element}
      </>,
    ),
  );

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => dismissToasts());
  await tick(1000);
  await act(async () => root.unmount());
  host.remove();
  // biome-ignore lint/suspicious/noDocumentCookie: a test clears the cookie it set
  document.cookie = "ronne-toast=; Max-Age=0; Path=/";
  vi.useRealTimers();
});

describe("FlashToastClient (138)", () => {
  it("shows the message once, as a toast, and removes the cookie", async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: a test sets the cookie the server would
    document.cookie = "ronne-toast=x; Path=/";
    await render(<FlashToastClient flash={flash} />);
    await tick(50);
    expect(cards().map((card) => card.textContent)).toEqual(["OK:Draft deleted"]);
    expect(document.cookie).not.toContain("ronne-toast");
    // The same flash again (a re-render of the layout) does not make a second toast.
    await render(<FlashToastClient flash={{ ...flash }} />);
    await tick(50);
    expect(cards()).toHaveLength(1);
  });

  it("says it in the person's language", async () => {
    await inLocaleAsync("pt", async () => {
      await render(<FlashToastClient flash={flash} />);
      await tick(50);
    });
    await tick(50);
    expect(cards()[0]?.textContent).toBe("OK:Rascunho excluído");
  });

  it("shows another flash with another id", async () => {
    await render(<FlashToastClient flash={flash} />);
    await tick(50);
    await tick(6000);
    expect(cards()).toHaveLength(0);
    await render(<FlashToastClient flash={{ ...flash, id: "two" }} />);
    await tick(50);
    expect(cards()).toHaveLength(1);
  });

  it("uses the kind the flash carries", async () => {
    await render(<FlashToastClient flash={{ ...flash, kind: "error" }} />);
    await tick(50);
    expect(cards()[0]?.dataset.toastKind).toBe("error");
  });
});
