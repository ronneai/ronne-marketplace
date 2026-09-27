import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupRequired } from "./SetupRequired";

describe("SetupRequired", () => {
  it("says the instance isn't set up and shows both setup commands", () => {
    const html = renderToStaticMarkup(<SetupRequired />);
    expect(html).toContain("isn&#x27;t set up yet");
    expect(html).toContain("pnpm run setup");
    expect(html).toContain("docker compose exec web pnpm run setup");
  });
});
