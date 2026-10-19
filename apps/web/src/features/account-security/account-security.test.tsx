import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qrSvg } from "@/server/domains/identity/models/qr";

const twoFactor = vi.hoisted(() => ({
  startTwoFactor: vi.fn(),
  confirmTwoFactor: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  turnOffTwoFactor: vi.fn(),
  twoFactorStatus: vi.fn(),
}));
vi.mock("@/server/domains/identity/actions/two-factor", () => twoFactor);
const userData = vi.hoisted(() => ({
  myLastExport: vi.fn(async (): Promise<Date | null> => null),
}));
vi.mock("@/server/domains/identity/actions/user-data", () => userData);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const actions = await import("./actions");
const { SecurityPage } = await import("./SecurityPage");
const { SetupFlow } = await import("./SetupFlow");
const { BackupCodes, backupCodesFile } = await import("./BackupCodes");
const { secretGroups, TWO_FACTOR_ERRORS } = await import("./types");
const { default: AccountSecurityPage } = await import("@/app/(app)/account/security/page");
const { default: ChangePasswordPage } = await import("@/app/(app)/account/password/page");

const URI =
  "otpauth://totp/Ronne%20AI%20Marketplace:someone%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Ronne%20AI%20Marketplace";
const CODES = Array.from({ length: 10 }, (_, i) => `AAAA${i}-BBBB${i}`);
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const off = { enabled: false, backupCodesLeft: 0, hasPassword: true };
const on = { enabled: true, backupCodesLeft: 7, hasPassword: true };

beforeEach(() => vi.clearAllMocks());

describe("the actions", () => {
  it("start: passes the password and Start over, and returns the setup with the key in groups", async () => {
    twoFactor.startTwoFactor.mockResolvedValueOnce({
      ok: true,
      uri: URI,
      qrSvg: "<svg/>",
      backupCodes: CODES,
    });
    expect(await actions.startFromForm({}, form({ password: "pw", startOver: "on" }))).toEqual({
      setup: {
        uri: URI,
        qrSvg: "<svg/>",
        secret: "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP",
        backupCodes: CODES,
      },
    });
    expect(twoFactor.startTwoFactor).toHaveBeenCalledWith(expect.any(Headers), {
      password: "pw",
      startOver: true,
    });
    twoFactor.startTwoFactor.mockResolvedValueOnce({ ok: false, error: "wrong_password" });
    expect(await actions.startFromForm({}, form({ password: "x" }))).toEqual({
      error: "wrong_password",
    });
    expect(twoFactor.startTwoFactor).toHaveBeenLastCalledWith(expect.any(Headers), {
      password: "x",
      startOver: false,
    });
  });

  it("confirm, regenerate and turn off pass their fields on and keep only what the page shows", async () => {
    twoFactor.confirmTwoFactor.mockResolvedValueOnce({ ok: true, headers: new Headers() });
    expect(await actions.confirmFromForm({}, form({ code: "123456", uri: URI }))).toEqual({
      done: true,
    });
    expect(twoFactor.confirmTwoFactor).toHaveBeenCalledWith(expect.any(Headers), {
      code: "123456",
      uri: URI,
    });
    twoFactor.regenerateBackupCodes.mockResolvedValueOnce({ ok: true, backupCodes: CODES });
    expect(await actions.regenerateFromForm({}, form({ password: "pw" }))).toEqual({
      backupCodes: CODES,
    });
    twoFactor.turnOffTwoFactor.mockResolvedValueOnce({ ok: false, error: "wrong_code" });
    expect(await actions.turnOffFromForm({}, form({ password: "pw", code: "1" }))).toEqual({
      error: "wrong_code",
    });
    expect(twoFactor.turnOffTwoFactor).toHaveBeenCalledWith(expect.any(Headers), {
      password: "pw",
      code: "1",
    });
  });
});

describe("/account/security", () => {
  it("off: explains and asks for the password to set it up; no codes, no turn-off", () => {
    const html = renderToStaticMarkup(<SecurityPage status={off} />);
    expect(html).toContain(">Two-factor sign-in</h2>");
    expect(html).toMatch(/>Off<\/span>/);
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Set up two-factor");
    expect(html).not.toContain("Turn off two-factor");
    expect(html).not.toContain("Make new backup codes");
  });

  it("on: the codes left, new backup codes and turning off; no setup", () => {
    const html = renderToStaticMarkup(<SecurityPage status={on} />);
    expect(html).toMatch(/>On<\/span>/);
    expect(html).toContain("7 backup codes left.");
    expect(html).toContain("Make new backup codes");
    expect(html).toContain("Turn off two-factor");
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).not.toContain("Set up two-factor");
    expect(renderToStaticMarkup(<SecurityPage status={{ ...on, backupCodesLeft: 1 }} />)).toContain(
      "1 backup code left.",
    );
  });

  it("says why someone was sent here when root requires it of them (105)", () => {
    const held = renderToStaticMarkup(<SecurityPage status={off} required="reviewers" />);
    expect(held).toContain("Set up two-factor sign-in to continue");
    expect(held).toContain("root and the moderators and admins of shared workspaces");
    expect(renderToStaticMarkup(<SecurityPage status={off} />)).not.toContain(
      "Set up two-factor sign-in to continue",
    );
  });

  it("offers the way back to /device once two-factor is on, and not before (107)", () => {
    const on = { enabled: true, backupCodesLeft: 10, hasPassword: true };
    const back = renderToStaticMarkup(
      <SecurityPage status={on} required="everyone" continueTo="/device?user_code=WDJB-MJHT" />,
    );
    expect(back).toContain('href="/device?user_code=WDJB-MJHT"');
    expect(back).toContain(">Continue</a>");
    const before = renderToStaticMarkup(
      <SecurityPage status={off} required="everyone" continueTo="/device" />,
    );
    expect(before).not.toContain(">Continue</a>");
  });

  it("keeps only a path on this site as the way back", async () => {
    twoFactor.twoFactorStatus.mockResolvedValueOnce({
      enabled: true,
      backupCodesLeft: 10,
      hasPassword: true,
    });
    const page = renderToStaticMarkup(
      await AccountSecurityPage({ searchParams: Promise.resolve({ next: "https://evil.test/x" }) }),
    );
    expect(page).not.toContain("evil.test");
  });

  it("company sign-in only: nothing to set up", () => {
    const html = renderToStaticMarkup(<SecurityPage status={{ ...off, hasPassword: false }} />);
    expect(html).toContain("Your company&#x27;s sign-in protects your account");
    expect(html).not.toContain("Set up two-factor");
  });

  it("is a tab of Account, next to Password, each with its own address", async () => {
    twoFactor.twoFactorStatus.mockResolvedValueOnce(off);
    const security = renderToStaticMarkup(
      await AccountSecurityPage({ searchParams: Promise.resolve({}) }),
    );
    expect(security).toContain('aria-label="Account"');
    expect(security).toMatch(/aria-current="page"[^>]*>Two-factor sign-in</);
    expect(security).toContain('href="/account/password"');
    const password = renderToStaticMarkup(await ChangePasswordPage());
    expect(password).toMatch(/aria-current="page"[^>]*>Password</);
    expect(password).toContain('href="/account/security"');
    expect(password).toContain(">Change password</h2>");
    // Your data (104) sits under it: a plain link to the file, and no date before a first download.
    expect(password).toContain(">Your data</h2>");
    expect(password).toContain('href="/account/data"');
    expect(password).not.toContain("Last downloaded");
  });

  it("shows when the data was last downloaded (104)", async () => {
    userData.myLastExport.mockResolvedValueOnce(new Date("2026-10-18T14:03:00Z"));
    const password = renderToStaticMarkup(await ChangePasswordPage());
    expect(password).toContain("Last downloaded");
    expect(password).toContain('dateTime="2026-10-18T14:03:00.000Z"');
  });

  it("sends someone whose session ended to sign in", async () => {
    twoFactor.twoFactorStatus.mockResolvedValueOnce(null);
    await expect(AccountSecurityPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/sign-in",
    );
  });
});

describe("the setup", () => {
  const setup = {
    uri: URI,
    qrSvg: qrSvg(URI),
    secret: secretGroups(URI),
    backupCodes: CODES,
  };

  it("shows the QR code as an image, the key in groups, and asks for the first code with the setup it showed", () => {
    const html = renderToStaticMarkup(<SetupFlow initial={{ setup }} />);
    expect(html).toMatch(/<img src="data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(html).toContain('alt="QR code for your authenticator app"');
    expect(html).toContain("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toMatch(/<input type="hidden" name="uri" value="otpauth:/);
    expect(html).toContain("Start over with a new key");
    expect(html).toContain('name="startOver" value="on"');
  });

  it("doesn't show the backup codes before the first code is right", () => {
    const html = renderToStaticMarkup(<SetupFlow initial={{ setup }} />);
    for (const code of CODES) expect(html).not.toContain(code);
  });

  it("says why a start was refused", () => {
    const html = renderToStaticMarkup(<SetupFlow initial={{ error: "replaced" }} />);
    expect(html).toContain(TWO_FACTOR_ERRORS.replaced);
    expect(html).toContain("Set up two-factor");
  });
});

describe("BackupCodes", () => {
  it("lists every code once, with Copy all and Download, and says they won't be shown again", () => {
    const html = renderToStaticMarkup(<BackupCodes codes={CODES} />);
    for (const code of CODES) expect(html.split(code)).toHaveLength(2);
    expect(html).toContain("Copy all");
    expect(html).toContain("Download (.txt)");
    expect(html).toContain("won&#x27;t be shown again");
  });

  it("writes a text file with a line per code", () => {
    const file = backupCodesFile(CODES);
    expect(file.split("\n").filter((line) => CODES.includes(line))).toEqual(CODES);
    expect(file).toMatch(/^Ronne AI Marketplace: two-factor backup codes/);
  });
});

describe("secretGroups", () => {
  it("is empty for a URI that isn't one", () => {
    expect(secretGroups("nope")).toBe("");
    expect(secretGroups("otpauth://totp/x")).toBe("");
  });
});
