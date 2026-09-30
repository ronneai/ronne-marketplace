import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The server action module reads request headers; the form only needs a reference to it.
vi.mock("./actions", () => ({ signInFromForm: vi.fn() }));

const { SignInForm } = await import("./SignInForm");
const { SignInPage } = await import("./SignInPage");

describe("SignInPage", () => {
  it("renders the card, the form and the CLI panel from the mock", () => {
    const html = renderToStaticMarkup(<SignInPage next="/items" />);
    for (const text of [
      "Sign in to Ronne AI Marketplace",
      "Use your email and password",
      ">Email<",
      ">Password<",
      "Remember me (30 days)",
      "Forgot?",
      "Ask a root administrator to reset your password",
      "pnpm run reset-root-password",
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
    const html = renderToStaticMarkup(<SignInForm next="/items?tab=mine" />);
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
      <SignInForm next="/" initial={{ error: "invalid_credentials", email: "a@example.com" }} />,
    );
    expect(html).toContain("ERR:");
    expect(html).toContain("Email or password is wrong");
    expect(html).toContain('value="a@example.com"');
    expect(html).toContain('aria-invalid="true"');
  });

  it("shows the rate-limit message", () => {
    const html = renderToStaticMarkup(<SignInForm next="/" initial={{ error: "rate_limited" }} />);
    expect(html).toContain("Too many attempts, wait a minute");
  });

  it("says where to get rmk, and puts this instance's URL in the login commands", () => {
    const html = renderToStaticMarkup(<SignInPage next="/" registry="https://ronne.example" />);
    expect(html).not.toContain("npm yet");
    expect(html).toContain("npm install --global @ronneai/rmk<");
    expect(html).toContain('href="https://github.com/ronneai/ronne-marketplace#the-rmk-cli"');
    expect(html).toContain("rmk login --registry https://ronne.example<");
    expect(html).toContain("rmk login --registry https://ronne.example --token &lt;token&gt;");
    expect(renderToStaticMarkup(<SignInPage next="/" />)).toContain(
      "rmk login --registry &lt;url&gt;<",
    );
  });
});
