import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeNextPath, signInUrl } from "@/server/domains/identity/models/route-guard";

const device = vi.hoisted(() => ({ describeMyDeviceCode: vi.fn(), decideMyDeviceCode: vi.fn() }));
vi.mock("@/server/domains/identity/actions/device-grants", () => device);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { deviceCodeFromForm } = await import("./actions");
const { DeviceFlow } = await import("./DeviceFlow");
const { DevicePage } = await import("./DevicePage");
const { default: DeviceRoute } = await import("@/app/(app)/device/page");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const REQUEST = {
  userCode: "WDJB-MJHT",
  name: "rmk on laptop",
  clientId: "rmk",
  requestedAt: "2026-10-17T12:00:00.000Z",
  requesterIp: "203.0.113.7",
};

beforeEach(() => vi.clearAllMocks());

describe("the page", () => {
  it("asks for the code, or shows the one in the address to check", () => {
    const empty = renderToStaticMarkup(<DevicePage typed="" />);
    expect(empty).toContain('name="code"');
    expect(empty).toContain("The 8 characters rmk login --web printed.");
    const prefilled = renderToStaticMarkup(<DevicePage typed="WDJB-MJHT" />);
    expect(prefilled).toContain('value="WDJB-MJHT"');
    expect(prefilled).toContain("Check that it&#x27;s the code your terminal shows.");
  });

  it("is only forms: no link changes anything", () => {
    for (const state of [
      { step: "enter" as const, typed: "WDJB-MJHT" },
      { step: "confirm" as const, request: REQUEST },
    ]) {
      const html = renderToStaticMarkup(<DeviceFlow initial={state} />);
      expect(html).toContain("<form");
      expect(html).not.toMatch(/<a\s/);
    }
  });

  it("shows what asked, the warning, and Approve and Deny as buttons of one form", () => {
    const html = renderToStaticMarkup(
      <DeviceFlow initial={{ step: "confirm", request: REQUEST }} />,
    );
    expect(html).toContain("rmk on laptop");
    expect(html).toContain("203.0.113.7");
    expect(html).toContain("Only approve if you just ran rmk login --web yourself");
    expect(html).toMatch(/<button type="submit"[^>]*value="approve" name="intent">Approve</);
    expect(html).toMatch(/<button type="submit"[^>]*value="deny" name="intent">Deny</);
    expect(html).toContain('type="hidden" name="code" value="WDJB-MJHT"');
    // Isolated: no character in a name can reorder the text around it.
    expect(html).toContain("<bdi>rmk on laptop</bdi>");
  });

  it("leaves the address out when it isn't known", () => {
    const html = renderToStaticMarkup(
      <DeviceFlow initial={{ step: "confirm", request: { ...REQUEST, requesterIp: null } }} />,
    );
    expect(html).not.toContain("From the address");
  });

  it("says the same for every wrong code, and how long to wait when limited", () => {
    const wrong = renderToStaticMarkup(
      <DeviceFlow initial={{ step: "enter", typed: "X", error: "invalid_code" }} />,
    );
    expect(wrong).toContain(
      "That code isn&#x27;t valid or has expired. Run rmk login --web again.",
    );
    const limited = renderToStaticMarkup(
      <DeviceFlow
        initial={{ step: "enter", typed: "", error: "rate_limited", retryAfterSeconds: 1700 }}
      />,
    );
    expect(limited).toContain("Too many codes tried. Try again in 29 minutes.");
  });

  it("says what happened after Approve or Deny", () => {
    expect(
      renderToStaticMarkup(
        <DeviceFlow initial={{ step: "done", decision: "approved", name: "rmk on laptop" }} />,
      ),
    ).toContain("is signed in as you");
    expect(
      renderToStaticMarkup(
        <DeviceFlow initial={{ step: "done", decision: "denied", name: "rmk on laptop" }} />,
      ),
    ).toContain("gets no token");
    expect(
      renderToStaticMarkup(
        <DeviceFlow initial={{ step: "done", decision: "approved", name: "rmk on laptop" }} />,
      ),
    ).toMatch(/<bdi[^>]*>rmk on laptop<\/bdi>/);
  });

  it("comes back with the code after signing in", () => {
    expect(safeNextPath("/device?user_code=WDJB-MJHT")).toBe("/device?user_code=WDJB-MJHT");
    expect(signInUrl("/device?user_code=WDJB-MJHT")).toBe(
      "/sign-in?next=%2Fdevice%3Fuser_code%3DWDJB-MJHT",
    );
  });
});

describe("opening /device", () => {
  it("looks nothing up and decides nothing, with a code in the address or without", async () => {
    for (const user_code of [undefined, "WDJB-MJHT", "ABCD-EFGH"]) {
      const html = renderToStaticMarkup(
        await DeviceRoute({ searchParams: Promise.resolve({ user_code }) }),
      );
      expect(html).toContain('name="code"');
    }
    expect(device.describeMyDeviceCode).not.toHaveBeenCalled();
    expect(device.decideMyDeviceCode).not.toHaveBeenCalled();
  });
});

describe("deviceCodeFromForm", () => {
  it("looks the code up on Continue and shows what asked", async () => {
    device.describeMyDeviceCode.mockResolvedValue({
      ok: true,
      request: {
        userCode: "WDJBMJHT",
        name: "rmk on laptop",
        clientId: "rmk",
        createdAt: new Date(REQUEST.requestedAt),
        requesterIp: "203.0.113.7",
        expiresAt: new Date(),
      },
    });
    const state = await deviceCodeFromForm(
      { step: "enter", typed: "" },
      form({ intent: "look-up", code: "wdjb-mjht" }),
    );
    expect(device.describeMyDeviceCode).toHaveBeenCalledWith(expect.any(Headers), "wdjb-mjht");
    expect(state).toEqual({ step: "confirm", request: REQUEST });
  });

  it("keeps what was typed after a wrong code, and says to wait when limited", async () => {
    device.describeMyDeviceCode.mockResolvedValueOnce({ ok: false, error: "invalid_code" });
    expect(
      await deviceCodeFromForm({ step: "enter", typed: "" }, form({ code: "ABCD-EFGH" })),
    ).toEqual({ step: "enter", typed: "ABCD-EFGH", error: "invalid_code" });
    device.describeMyDeviceCode.mockResolvedValueOnce({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 30,
    });
    expect(
      await deviceCodeFromForm({ step: "enter", typed: "" }, form({ code: "ABCD-EFGH" })),
    ).toMatchObject({ step: "enter", error: "rate_limited", retryAfterSeconds: 30 });
  });

  it("approves or denies the code on the form", async () => {
    device.decideMyDeviceCode.mockResolvedValue({ ok: true, name: "rmk on laptop" });
    const confirm = { step: "confirm" as const, request: REQUEST };
    expect(
      await deviceCodeFromForm(confirm, form({ intent: "approve", code: "WDJB-MJHT" })),
    ).toEqual({ step: "done", decision: "approved", name: "rmk on laptop" });
    expect(device.decideMyDeviceCode).toHaveBeenLastCalledWith(
      expect.any(Headers),
      "WDJB-MJHT",
      "approve",
    );
    expect(await deviceCodeFromForm(confirm, form({ intent: "deny", code: "WDJB-MJHT" }))).toEqual({
      step: "done",
      decision: "denied",
      name: "rmk on laptop",
    });
  });

  it("names the grant it decided, never what the browser sent back", async () => {
    device.decideMyDeviceCode.mockResolvedValueOnce({ ok: true, name: "rmk on the real box" });
    expect(
      await deviceCodeFromForm(
        { step: "confirm", request: { ...REQUEST, name: "rmk on something else" } },
        form({ intent: "approve", code: "WDJB-MJHT" }),
      ),
    ).toEqual({ step: "done", decision: "approved", name: "rmk on the real box" });
  });

  it("goes back to the code's input when the decision is refused", async () => {
    device.decideMyDeviceCode.mockResolvedValueOnce({ ok: false, error: "invalid_code" });
    expect(
      await deviceCodeFromForm(
        { step: "confirm", request: REQUEST },
        form({ intent: "approve", code: "WDJB-MJHT" }),
      ),
    ).toEqual({ step: "enter", typed: "", error: "invalid_code" });
  });
});
