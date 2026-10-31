// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Flash } from "@/i18n/flash";

// The real ICU formatter over one message with a placeholder: no message of ours has one yet.
vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const translate = actual.createTranslator({
    locale: "en",
    messages: {
      common: {
        flash: { draftDeleted: "Deleted {name}" },
        toast: { prefix: { ok: "OK:" }, close: "Close" },
      },
    },
  });
  return {
    ...actual,
    useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) =>
      (translate as unknown as (k: string, v?: unknown) => string)(`${namespace}.${key}`, values),
  };
});

const { FlashToastClient } = await import("./FlashToastClient");
const { Toaster } = await import("./Toaster");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("a flash parameter is text, never markup (138)", () => {
  it("puts <img onerror> and <b> on the screen as the characters they are", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const markup = "<img src=x onerror=alert(1)><b>bold</b>";
    const flash: Flash = { id: "m", kind: "ok", key: "draftDeleted", params: { name: markup } };
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <>
          <Toaster />
          <FlashToastClient flash={flash} />
        </>,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const card = document.querySelector("[data-toast-kind]");
    expect(card?.textContent).toContain(`Deleted ${markup}`);
    expect(card?.querySelector("img, b, script")).toBeNull();
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });
});
