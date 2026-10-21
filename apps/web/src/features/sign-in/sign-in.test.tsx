import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The server action module reads request headers; the form only needs a reference to it.
vi.mock("./actions", () => ({ signInFromForm: vi.fn(), ssoFromForm: vi.fn() }));

const { SignInForm } = await import("./SignInForm");
const { hostCommand } = await import("@/server/runtime");

const CLONE = hostCommand("reset-root-password", {});
const { SignInPage } = await import("./SignInPage");

describe("SignInPage", () => {
  it("renders the card, the form and the CLI panel from the mock", () => {
    const html = renderToStaticMarkup(<SignInPage resetCommand={CLONE} next="/items" />);
    for (const text of [
      "Sign in to Ronne AI Marketplace",
      "Use your email and password",
      ">Email<",
      ">Password<",
      "Remember me (30 days)",
      "Forgot?",
      "Ask a root to reset your password in Users",
      "pnpm run reset-root-password",
      // 105: a lost phone goes the same way.
      "A lost authenticator, and its backup codes, is reset the same way",
      "Use rmk from the terminal",
      "rmk login",
      "--token &lt;token&gt;",
      "rmk whoami",
      'href="/account/tokens"',
    ]) {
      expect(html, text).toContain(text);
    }
    // Emails only: there are no usernames.
    expect(html).not.toContain("Username");
  });

  it("posts the next path, with the right autocomplete hints", () => {
    const html = renderToStaticMarkup(<SignInForm resetCommand={CLONE} next="/items?tab=mine" />);
    expect(html).toContain('name="next" value="/items?tab=mine"');
    // HTML attribute names aren't case-sensitive; React writes autoComplete as is.
    expect(html).toMatch(/autocomplete="username"/i);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain('name="remember"');
    expect(html).not.toContain("ERR:");
  });
});

describe("SignInForm errors", () => {
  it("shows the generic error and keeps the email, never the password", () => {
    const html = renderToStaticMarkup(
      <SignInForm
        resetCommand={CLONE}
        next="/"
        initial={{ error: "invalid_credentials", email: "a@example.com" }}
      />,
    );
    expect(html).toContain("ERR:");
    expect(html).toContain("Email or password is wrong");
    expect(html).toContain('value="a@example.com"');
    expect(html).toContain('aria-invalid="true"');
  });

  it("shows the rate-limit message", () => {
    const html = renderToStaticMarkup(
      <SignInForm resetCommand={CLONE} next="/" initial={{ error: "rate_limited" }} />,
    );
    expect(html).toContain("Too many attempts, wait a minute");
  });

  it("fills in the email and says the instance is set up, after the web setup", () => {
    const html = renderToStaticMarkup(
      <SignInPage resetCommand={CLONE} next="/" email="root@example.com" setupDone />,
    );
    expect(html).toContain('value="root@example.com"');
    expect(html).toContain("Ronne AI Marketplace is set up");
    expect(renderToStaticMarkup(<SignInPage resetCommand={CLONE} next="/" />)).not.toContain(
      "is set up",
    );
  });

  it("says where to get rmk, and puts this instance's URL in the login commands", () => {
    const html = renderToStaticMarkup(
      <SignInPage resetCommand={CLONE} next="/" registry="https://ronne.example" />,
    );
    expect(html).not.toContain("npm yet");
    expect(html).toContain("npm install --global @ronneai/rmk<");
    expect(html).toContain('href="https://github.com/ronneai/ronne-marketplace#the-rmk-cli"');
    expect(html).toContain("rmk login --registry https://ronne.example<");
    expect(html).toContain("rmk login --registry https://ronne.example --token &lt;token&gt;");
    // 107: the fourth line, for company sign-in and two-factor.
    expect(html).toContain("rmk login --registry https://ronne.example --web<");
    expect(html).toContain("Signed up with your company, or using two-factor sign-in?");
    expect(renderToStaticMarkup(<SignInPage resetCommand={CLONE} next="/" />)).toContain(
      "rmk login --registry &lt;url&gt;<",
    );
  });
});

describe("ForgotPassword (#147)", () => {
  it.each([
    ["npm", "rmk-server reset-root-password"],
    ["docker", "docker compose exec web pnpm run reset-root-password"],
    [undefined, "pnpm run reset-root-password"],
  ])("names the command for the %s install, and links to Root accounts", (runtime, command) => {
    const html = renderToStaticMarkup(
      <SignInPage
        next="/"
        resetCommand={hostCommand("reset-root-password", { RONNE_RUNTIME: runtime })}
      />,
    );
    expect(html).toContain(`<code class="font-mono break-words text-fg">${command}</code>`);
    // One command, never another install's.
    expect(html.match(/reset-root-password/g)).toHaveLength(1);
    expect(html).toContain('href="https://www.ronne.ai/en/marketplace/docs/install#root"');
    expect(html).toContain("Root accounts");
  });

  it("is a native <details>, so it opens without JavaScript", () => {
    const html = renderToStaticMarkup(<SignInForm resetCommand={CLONE} next="/" />);
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Forgot\?<\/summary>/);
  });
});

describe("signing in with an identity provider (106)", () => {
  const providers = [
    { id: "acme", name: "Acme SSO" },
    { id: "okta", name: "Okta" },
  ];

  it("shows a Continue with button for each provider that's on, under the password form, carrying next", () => {
    const html = renderToStaticMarkup(
      <SignInPage resetCommand={CLONE} next="/items" providers={providers} />,
    );
    expect(html).toContain("Continue with Acme SSO");
    expect(html).toContain("Continue with Okta");
    expect(html).toContain('name="provider" value="acme"');
    expect(html).toContain('name="next" value="/items"');
    expect(html.indexOf(">Password<")).toBeLessThan(html.indexOf("Continue with Acme SSO"));
    expect(html).not.toContain("Use your password (root)");
    // 44px tall on a touch screen.
    expect(html).toMatch(/pointer-coarse:h-11[^"]*w-full"[^>]*>Continue with Acme SSO/);
  });

  it("with Root only, puts the buttons first and the password form behind Use your password (root)", () => {
    const html = renderToStaticMarkup(
      <SignInPage resetCommand={CLONE} next="/" providers={providers} rootOnly />,
    );
    expect(html.indexOf("Continue with Acme SSO")).toBeLessThan(
      html.indexOf("Use your password (root)"),
    );
    expect(html).toMatch(
      /<details[^>]*>\s*<summary[^>]*>Use your password \(root\)<\/summary>[\s\S]*>Password</,
    );
    expect(html).toContain("Use your company&#x27;s sign-in");
  });

  it("shows the password form to everyone when no provider is on, whatever the policy", () => {
    const html = renderToStaticMarkup(
      <SignInPage resetCommand={CLONE} next="/" providers={[]} rootOnly />,
    );
    expect(html).not.toContain("Use your password (root)");
    expect(html).toContain(">Password<");
    expect(html).toContain("Use your email and password");
  });

  it("says why a provider sign-in came back, in plain words, and one answer for disabled and unknown", () => {
    const say = (error: string) =>
      renderToStaticMarkup(
        <SignInPage resetCommand={CLONE} next="/" providers={providers} ssoError={error} />,
      );
    expect(say("provider_error")).toContain(
      "That provider didn&#x27;t answer. Try again, or use your password.",
    );
    expect(say("unverified_email")).toContain("didn&#x27;t say your email is verified");
    expect(say("expired")).toContain("took too long");
    const disabled = say("disabled").match(/ERR:<\/span>([^<]*)/)?.[1];
    const unknown = say("not_allowed").match(/ERR:<\/span>([^<]*)/)?.[1];
    expect(disabled).toBeTruthy();
    expect(disabled).toBe(unknown);
    // Only known codes: nothing from Object's prototype either.
    for (const odd of ["<script>", "constructor", "__proto__", "toString", "DISABLED"])
      expect(say(odd), odd).not.toContain("ERR:");
  });
});
