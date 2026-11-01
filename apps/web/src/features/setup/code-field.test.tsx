// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeField } from "./fields";
import { DEFAULT_VALUES, type SetupError, type SetupPageProps } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page: SetupPageProps = {
  state: "not_configured",
  runtime: "node",
  envFile: "/srv/ronne/apps/web/.env",
  publicUrlFromEnvironment: false,
  setupCodeCommand: "pnpm run setup-code",
  initial: DEFAULT_VALUES,
};

const show = async (error?: SetupError) => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<CodeField page={page} error={error} />));
  return { host, root };
};

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/setup");
});

describe("CodeField (161)", () => {
  it("is filled from the link the install script opens, then the code leaves the address bar", async () => {
    window.history.replaceState(
      { kept: true },
      "",
      "/setup?lang=fr#code=7KQ2M-ABCDE-FGHJK-MNPQR-STVWX-Y",
    );
    const replace = vi.spyOn(window.history, "replaceState");
    const { host } = await show();
    const input = host.querySelector<HTMLInputElement>('input[name="setup.code"]');
    expect(input?.value).toBe("7KQ2M-ABCDE-FGHJK-MNPQR-STVWX-Y");
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?lang=fr");
    expect(replace).toHaveBeenCalledWith({ kept: true }, "", "/setup?lang=fr");
    replace.mockRestore();
  });

  it("is filled from the link pasted into the page already open", async () => {
    window.history.replaceState(null, "", "/setup");
    const { host } = await show();
    const input = host.querySelector<HTMLInputElement>('input[name="setup.code"]');
    expect(input?.value).toBe("");
    await act(async () => {
      window.location.hash = "#code=1KQ2MABCDEFGHJKMNPQRSTVWX0";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(input?.value).toBe("1KQ2MABCDEFGHJKMNPQRSTVWX0");
    expect(window.location.hash).toBe("");
  });

  it("stays empty, and the address as it is, without the fragment", async () => {
    window.history.replaceState(null, "", "/setup#other=1");
    const { host } = await show();
    expect(host.querySelector<HTMLInputElement>('input[name="setup.code"]')?.value).toBe("");
    expect(window.location.hash).toBe("#other=1");
  });

  it.each([
    [
      "setup_code_wrong",
      "That isn’t this server’s setup code. It’s in the server’s log, or run `pnpm run setup-code`.",
    ],
    [
      "setup_code_rate_limited",
      "Too many wrong setup codes. Try again in 10 minutes, or set this instance up from the terminal: `pnpm run setup`.",
    ],
    [
      "setup_code_missing",
      "No setup code on this server: restart it, or run `pnpm run setup-code`. Or set it up from the terminal: `pnpm run setup`.",
    ],
  ] as const)("shows %s at the field, in the person's words", async (code, words) => {
    const { host } = await show({
      code,
      section: "code",
      field: "setup.code",
      message: "ENGLISH FROM THE SERVER",
      say: {
        key: `errors.${code}`,
        values: { command: "pnpm run setup-code", setup: "pnpm run setup", minutes: 10 },
      },
    });
    const input = host.querySelector<HTMLInputElement>('input[name="setup.code"]');
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain(words);
  });
});
