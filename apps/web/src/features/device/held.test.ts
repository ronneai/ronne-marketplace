import { describe, expect, it, vi } from "vitest";

// Someone root requires to use two-factor, who hasn't set it up yet (105).
vi.mock("@/server/http/two-factor-hold", () => ({
  SECURITY_PATH: "/account/security",
  twoFactorHold: vi.fn(async () => "everyone"),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
const device = vi.hoisted(() => ({ describeMyDeviceCode: vi.fn(), decideMyDeviceCode: vi.fn() }));
vi.mock("@/server/domains/identity/actions/device-grants", () => device);

const { deviceCodeFromForm } = await import("./actions");

describe("a person held on two-factor enrolment (105)", () => {
  it("can't look a code up or approve it through the action: it sends them to enrol", async () => {
    for (const intent of ["look-up", "approve", "deny"]) {
      const form = new FormData();
      form.set("intent", intent);
      form.set("code", "WDJB-MJHT");
      await expect(deviceCodeFromForm({ step: "enter", typed: "" }, form)).rejects.toThrow(
        "REDIRECT /account/security",
      );
    }
    expect(device.describeMyDeviceCode).not.toHaveBeenCalled();
    expect(device.decideMyDeviceCode).not.toHaveBeenCalled();
  });
});
