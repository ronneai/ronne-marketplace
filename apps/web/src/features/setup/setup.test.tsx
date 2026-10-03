import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DatabaseUnavailable } from "./DatabaseUnavailable";
import { SetupPage } from "./SetupPage";
import { DEFAULT_VALUES, type SetupPageProps } from "./types";

// The form's server actions aren't rendered here; the form only needs their references.
vi.mock("./actions", () => ({ installAll: async () => ({}) }));

const page = (overrides: Partial<SetupPageProps> = {}): SetupPageProps => ({
  state: "not_configured",
  runtime: "node",
  envFile: "/srv/ronne/apps/web/.env",
  publicUrlFromEnvironment: false,
  initial: DEFAULT_VALUES,
  ...overrides,
});

const FIELDS = [
  "database.kind",
  "database.path",
  "database.host",
  "database.port",
  "database.name",
  "database.user",
  "database.password",
  "public_url",
  "root.email",
  "root.name",
  "root.password",
  "root.password_again",
];

describe("SetupPage", () => {
  it("shows every question, the Install button and the warning, and nothing about the terminal", () => {
    const html = renderToStaticMarkup(<SetupPage page={page()} />);
    expect(html).toContain("Set up Ronne AI Marketplace");
    expect(html).toContain("isn&#x27;t set up yet");
    for (const name of FIELDS) expect(html, name).toContain(`name="${name}"`);
    expect(html).toContain(">Install<");
    expect(html).not.toContain("pnpm run setup");
    expect(html).not.toContain("terminal");
    expect(html).toContain("Anyone who can open this page can set the instance up");
    expect(html).not.toContain("database.keep");
    expect(html).not.toContain("docker compose --profile");
    expect(html).not.toContain("readonly");
  });

  it("gives Docker hints only in Docker", () => {
    const html = renderToStaticMarkup(<SetupPage page={page({ runtime: "docker" })} />);
    expect(html).toContain("docker compose --profile postgres up -d");
    expect(html).toContain("inside the ronne-data volume");
  });

  it("shows a public URL from the environment read-only", () => {
    const html = renderToStaticMarkup(
      <SetupPage
        page={page({
          publicUrlFromEnvironment: true,
          initial: { ...DEFAULT_VALUES, publicUrl: "https://ronne.example" },
        })}
      />,
    );
    expect(html.match(/<input[^>]*name="public_url"[^>]*>/)?.[0]).toMatch(/readonly=""/i);
    expect(html).toContain('value="https://ronne.example"');
    expect(html).toContain("wins over the settings");
    expect(html).toContain("Set by RONNE_DOMAIN or PUBLIC_URL");
  });

  it("offers to keep the database when a setup didn't finish", () => {
    const html = renderToStaticMarkup(
      <SetupPage
        page={page({
          state: "incomplete",
          currentDatabase: "postgres://ronne:***@db:5432/ronne",
          initial: { ...DEFAULT_VALUES, keep: true },
        })}
      />,
    );
    expect(html).toContain("didn&#x27;t finish");
    expect(html).toMatch(/name="database.keep"[^>]*checked/);
    expect(html).toContain("postgres://ronne:***@db:5432/ronne");
  });
});

describe("DatabaseUnavailable", () => {
  it("names the database without offering the setup", () => {
    const html = renderToStaticMarkup(
      <DatabaseUnavailable database="postgres://ronne:***@db/ronne" />,
    );
    expect(html).toContain("isn&#x27;t answering");
    expect(html).toContain("postgres://ronne:***@db/ronne");
    expect(html).not.toContain("Set up Ronne");
  });
});
