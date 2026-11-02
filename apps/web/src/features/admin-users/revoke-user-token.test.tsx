// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ revokeUserTokenFromForm: vi.fn() }));
vi.mock("./actions", () => actions);
const { RevokeUserTokenButton } = await import("./RevokeUserTokenButton");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Revoke on a person's token (162)", () => {
  it("asks first, naming the token, and sends the person and the token", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<RevokeUserTokenButton userId="U1" id="T1" name="laptop" />));
    const dialog = host.querySelector("dialog");
    expect(dialog?.open).toBe(false);

    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Revoke laptop"]');
    await act(async () => button?.click());
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain("Revoke laptop? Anything using it");
    const fields = Object.fromEntries(
      [...(dialog?.querySelectorAll<HTMLInputElement>("input[type=hidden]") ?? [])].map((input) => [
        input.name,
        input.value,
      ]),
    );
    expect(fields).toEqual({ userId: "U1", tokenId: "T1" });
    // Nothing is revoked until Revoke token is pressed.
    expect(actions.revokeUserTokenFromForm).not.toHaveBeenCalled();

    // Cancel closes it.
    const cancel = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Cancel",
    );
    await act(async () => cancel?.click());
    expect(dialog?.open).toBe(false);
    await act(async () => root.unmount());
    host.remove();
  });
});
