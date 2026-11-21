import { afterEach, describe, expect, it, vi } from "vitest";
import { postDraft, submitDrafts } from "./drafts-api";
import { postUsage } from "./usage-api";

afterEach(() => vi.unstubAllEnvs());

const request = (path: string, body: string) =>
  new Request(`https://ronne.example/api/v1${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });

describe("the limited API routes before setup (109)", () => {
  it("answer 503 before any limit is built: there's no database to count in yet", async () => {
    vi.stubEnv("RONNE_ENV_FILE", "/nonexistent/ronne-test.env");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    const guard = {
      ready: async () => false,
      authenticate: async () => {
        throw new Error("never asked");
      },
    };
    expect((await submitDrafts(request("/drafts/submit", '{"ids":["x"]}'), { guard })).status).toBe(
      503,
    );
    expect((await postDraft(request("/drafts", "{}"), { guard })).status).toBe(503);
    expect((await postUsage(request("/usage", '{"events":[]}'), { guard })).status).toBe(503);
  });
});
