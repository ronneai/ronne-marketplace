// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvalidMailSetupError,
  MailHostInternalError,
  MailTestLimitError,
} from "@/server/domains/mail/exceptions/errors";
import type { MailSetupShown } from "@/server/domains/mail/services/mail-setup";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mail = vi.hoisted(() => ({
  adminSaveMailSetup: vi.fn(),
  adminSendTestEmail: vi.fn(),
  adminStopSending: vi.fn(),
  adminMailSetup: vi.fn(),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/domains/mail/actions/mail", () => mail);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { saveEmail, sendTestEmail, stopSending } = await import("./actions");
const { inLocale } = await import("@/test/intl");
const { englishLeaks } = await import("@/test/english-leak");
const { EmailForm } = await import("./EmailForm");
const { EmailActions } = await import("./EmailActions");
const { EmailStatus } = await import("./EmailStatus");

const SETUP: MailSetupShown = {
  transport: "",
  fromAddress: "",
  fromName: "",
  replyTo: "",
  contact: "",
  smtpHost: "",
  smtpPort: "",
  smtpTls: "",
  smtpUser: "",
  region: "",
  domain: "",
  sesAccessKeyId: "",
  secretSaved: false,
  secretProblem: null,
  status: "not_set_up",
  relayHosts: [],
};
const html = (element: ReactElement) => renderToStaticMarkup(element);

let root: Root | null = null;
let host: HTMLElement;
const mount = async (element: ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(element));
};
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});
const $ = <E extends Element = HTMLInputElement>(selector: string) =>
  host.querySelector(selector) as E | null;
const choose = async (selector: string, value: string) => {
  const select = $<HTMLSelectElement>(selector) as HTMLSelectElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const type = async (selector: string, value: string) => {
  const input = $(selector) as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as
    | HTMLButtonElement
    | undefined;

describe("the Email tab's status (189)", () => {
  it("says each status: not set up, untested, working and failing with the reason and when", () => {
    expect(html(<EmailStatus status="not_set_up" />)).toContain("Not set up: Ronne sends no email");
    expect(html(<EmailStatus status="untested" />)).toContain("Set up, not tested yet");
    const working = html(
      <EmailStatus status={{ status: "working", at: "2026-11-21T12:00:00.000Z" }} />,
    );
    expect(working).toContain("Working: the last test or delivery succeeded");
    expect(working).toContain('dateTime="2026-11-21T12:00:00.000Z"');
    const failing = html(
      <EmailStatus
        status={{ status: "failing", at: "2026-11-21T12:00:00.000Z", reason: "auth" }}
      />,
    );
    expect(failing).toContain(
      "Failing: the last delivery didn&#x27;t go (the credentials were refused)",
    );
    expect(failing).toContain('role="alert"');
    expect(
      html(
        <EmailStatus status={{ status: "failing", at: "2026-11-21T12:00:00.000Z", reason: "?" }} />,
      ),
    ).toContain("(another reason)");
  });
});

describe("the Email tab's setup form (189)", () => {
  it("shows each transport's own fields, and its steps", async () => {
    await mount(<EmailForm setup={SETUP} />);
    expect($("#mail-smtpHost")).toBeNull();
    const fields: Record<string, string[]> = {
      smtp: ["#mail-smtpHost", "#mail-smtpTls", "#mail-smtpPort", "#mail-smtpUser", "#mail-secret"],
      ses: ["#mail-region", "#mail-sesAccessKeyId", "#mail-secret"],
      mailgun: ["#mail-region", "#mail-domain", "#mail-secret"],
      postmark: ["#mail-secret"],
      resend: ["#mail-secret"],
    };
    const absent = ["#mail-smtpHost", "#mail-sesAccessKeyId", "#mail-domain", "#mail-smtpUser"];
    for (const [transport, ids] of Object.entries(fields)) {
      await choose("#mail-transport", transport);
      for (const id of ids) expect($(id), `${transport} ${id}`).not.toBeNull();
      for (const id of absent.filter((one) => !ids.includes(one)))
        expect($(id), `${transport} ${id}`).toBeNull();
      expect(host.querySelectorAll("aside li")).toHaveLength(3);
    }
    await choose("#mail-transport", "postmark");
    expect(host.textContent).toContain("Server API token");
    expect(host.textContent).toContain("Copy the server's API token from its API Tokens tab.");
  });

  it("never holds a saved secret: it says Saved, and asks for it on Replace", async () => {
    await mount(
      <EmailForm
        setup={{
          ...SETUP,
          transport: "resend",
          fromAddress: "m@acme.example",
          replyTo: "r@acme.example",
          secretSaved: true,
          status: "untested",
        }}
      />,
    );
    expect($("#mail-secret")).toBeNull();
    expect(host.textContent).toContain("Saved");
    expect(host.querySelector('input[type="password"]')).toBeNull();
    await act(async () => button("Replace")?.click());
    const secret = $("#mail-secret") as HTMLInputElement;
    expect(secret.type).toBe("password");
    expect(secret.value).toBe("");
  });

  it("asks for the secret again when the transport or its target changes", async () => {
    await mount(
      <EmailForm
        setup={{
          ...SETUP,
          transport: "smtp",
          smtpHost: "smtp.acme.example",
          smtpTls: "starttls",
          smtpUser: "u",
          secretSaved: true,
          status: "untested",
        }}
      />,
    );
    expect($("#mail-secret")).toBeNull();
    await type("#mail-smtpHost", "smtp.other.example");
    expect($("#mail-secret")).not.toBeNull();
    await type("#mail-smtpHost", "SMTP.acme.example");
    expect($("#mail-secret")).toBeNull();
    await choose("#mail-transport", "resend");
    expect($("#mail-secret")).not.toBeNull();
  });

  it("says when the saved secret can't be read", () => {
    expect(
      html(
        <EmailForm
          setup={{
            ...SETUP,
            transport: "postmark",
            secretProblem: "unreadable",
            status: "untested",
          }}
        />,
      ),
    ).toContain("The saved credential can&#x27;t be read");
  });

  it("names the operator's relays, and points at the host a save refused", async () => {
    await mount(
      <EmailForm
        setup={{
          ...SETUP,
          transport: "smtp",
          relayHosts: ["relay.corp.internal"],
          status: "untested",
        }}
        initial={{ error: "That host is on a private network.", field: "smtpHost" }}
      />,
    );
    expect(host.textContent).toContain(
      "Relays the operator allows on this server: relay.corp.internal.",
    );
    expect($("#mail-smtpHost")?.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("private network");
  });

  it("fills Reply-To from the instance contact while that's an address, and not from a page", async () => {
    await mount(<EmailForm setup={SETUP} />);
    await type("#mail-contact", "it-help@acme.example");
    expect(($("#mail-replyTo") as HTMLInputElement).value).toBe("it-help@acme.example");
    await type("#mail-contact", "https://help.acme.example");
    expect(($("#mail-replyTo") as HTMLInputElement).value).toBe("");
    await type("#mail-replyTo", "desk@acme.example");
    await type("#mail-contact", "other@acme.example");
    expect(($("#mail-replyTo") as HTMLInputElement).value).toBe("desk@acme.example");
  });
});

describe("saveEmail (189)", () => {
  beforeEach(() => vi.clearAllMocks());
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  };

  it("passes every field, the secret only as typed", async () => {
    mail.adminSaveMailSetup.mockResolvedValue({ changed: true });
    expect(
      await saveEmail(
        {},
        form({ transport: "resend", fromAddress: "m@acme.example", secret: "re_x" }),
      ),
    ).toEqual({ done: "saved" });
    expect(mail.adminSaveMailSetup.mock.calls[0]?.[1]).toMatchObject({
      transport: "resend",
      fromAddress: "m@acme.example",
      secret: "re_x",
      smtpHost: "",
    });
    mail.adminSaveMailSetup.mockResolvedValue({ changed: false });
    expect(await saveEmail({}, form({}))).toEqual({ done: "unchanged" });
  });

  it("turns the instance contact's errors into words, pointing at the field", async () => {
    for (const contact of ["http://help.acme.example", "https://u:p@help.acme.example", "nope"]) {
      mail.adminSaveMailSetup.mockRejectedValueOnce(new InvalidMailSetupError("contact"));
      expect(await saveEmail({}, form({ contact }))).toEqual({
        error:
          "The instance contact is an email address or an https:// address without a user name, 500 characters at most.",
        field: "contact",
      });
    }
    // Empty is fine: the contact is needed only before 190 or 194 turn on.
    mail.adminSaveMailSetup.mockResolvedValueOnce({ changed: true });
    expect(await saveEmail({}, form({ contact: "" }))).toEqual({ done: "saved" });
  });

  it("points a refused relay at the host field", async () => {
    mail.adminSaveMailSetup.mockRejectedValueOnce(new MailHostInternalError());
    expect(await saveEmail({}, form({ transport: "smtp", smtpHost: "10.0.0.5" }))).toMatchObject({
      field: "smtpHost",
      error: expect.stringContaining("RONNE_MAIL_HOSTS"),
    });
  });
});

describe("Send test email and Stop sending (189)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says where the test goes, and shows its success", async () => {
    session.getCurrentUser.mockResolvedValue({ email: "root@acme.example" });
    mail.adminSendTestEmail.mockResolvedValue({ result: "sent" });
    const state = await sendTestEmail({}, new FormData());
    expect(state).toEqual({ result: { result: "sent" }, to: "root@acme.example" });
    const page = html(<EmailActions to="root@acme.example" initialTest={state} />);
    expect(page).toContain("to your own address, root@acme.example");
    expect(page).toContain("Sent to root@acme.example: check that inbox");
  });

  it("shows a failure with the reason and the server's answer", () => {
    const page = html(
      <EmailActions
        to="root@acme.example"
        initialTest={{
          result: { result: "failed", reason: "auth", detail: "535 5.7.8 auth failed" },
        }}
      />,
    );
    expect(page).toContain("It didn&#x27;t go: the credentials were refused.");
    expect(page).toContain("535 5.7.8 auth failed");
  });

  it("shows the limit as an error", async () => {
    mail.adminSendTestEmail.mockRejectedValueOnce(new MailTestLimitError(5));
    const state = await sendTestEmail({}, new FormData());
    expect(state).toEqual({
      error: "At most 5 test emails in 10 minutes: wait a few minutes, then try again.",
    });
    expect(html(<EmailActions to="r@acme.example" initialTest={state} />)).toContain(
      "At most 5 test emails",
    );
  });

  it("asks once more on the page before it stops sending", async () => {
    await mount(<EmailActions to="root@acme.example" />);
    expect(host.querySelector('form[aria-label="Stop sending"] button[type="submit"]')).toBeNull();
    await act(async () => button("Stop sending")?.click());
    expect(host.textContent).toContain("Stop sending email? Messages still waiting are dropped");
    expect(
      host.querySelector('form[aria-label="Stop sending"] button[type="submit"]'),
    ).not.toBeNull();
    await act(async () => button("Cancel")?.click());
    expect(host.querySelector('form[aria-label="Stop sending"] button[type="submit"]')).toBeNull();
    mail.adminStopSending.mockResolvedValue({ stopped: true, dropped: 2 });
    expect(await stopSending({}, new FormData())).toEqual({ done: "stopped", dropped: 2 });
  });
});

describe("the Email tab's markup (189)", () => {
  it("never puts a block inside a paragraph, so the page hydrates as the server drew it", () => {
    const page = html(<EmailForm setup={{ ...SETUP, transport: "smtp", status: "untested" }} />);
    const doc = new DOMParser().parseFromString(page, "text/html");
    expect([...doc.querySelectorAll("p div, p p, p ul, p ol")].map((el) => el.outerHTML)).toEqual(
      [],
    );
    // The From address's hint holds its helper.
    expect(doc.querySelector("#mail-fromAddress-hint button")).not.toBeNull();
  });
});

describe("the Email tab in Portuguese and French (189)", () => {
  it("shows no English, whatever the transport", async () => {
    for (const locale of ["pt", "fr"] as const)
      for (const transport of ["smtp", "ses", "mailgun", "postmark", "resend"] as const) {
        const page = inLocale(locale, () =>
          html(
            <>
              <EmailStatus
                status={{ status: "failing", at: "2026-11-21T12:00:00.000Z", reason: "tls" }}
              />
              <EmailForm
                setup={{
                  ...SETUP,
                  transport,
                  secretSaved: true,
                  relayHosts: ["relay.corp.internal"],
                  status: "untested",
                }}
              />
              <EmailActions
                to="root@acme.example"
                initialTest={{ result: { result: "failed", reason: "timeout" } }}
              />
            </>,
          ),
        );
        expect(
          await englishLeaks(["admin", "common"], locale, page),
          `${locale} ${transport}`,
        ).toEqual([]);
      }
  });
});
