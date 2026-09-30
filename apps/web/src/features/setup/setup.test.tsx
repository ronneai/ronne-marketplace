import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DatabaseUnavailable } from "./DatabaseUnavailable";
import { SetupPage } from "./SetupPage";

describe("SetupPage", () => {
  it("says the instance isn't set up and shows both terminal commands", () => {
    const html = renderToStaticMarkup(<SetupPage />);
    expect(html).toContain("Set up Ronne AI Marketplace");
    expect(html).toContain("isn&#x27;t set up yet");
    expect(html).toContain("pnpm run setup");
    expect(html).toContain("docker compose exec web pnpm run setup");
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
