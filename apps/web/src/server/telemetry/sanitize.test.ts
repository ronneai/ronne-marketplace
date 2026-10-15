import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { expect, it } from "vitest";
import { sanitizeSpan } from "./sanitize";

const span = (overrides: Partial<ReadableSpan>): ReadableSpan =>
  ({
    name: "GET /items/[scope]/[name]",
    attributes: {},
    events: [],
    status: { code: 0 },
    spanContext: () => ({ traceId: "t", spanId: "s", traceFlags: 1 }),
    ...overrides,
  }) as unknown as ReadableSpan;

it("drops paths, URLs, client addresses and user agents; keeps the route's pattern", () => {
  const sent = sanitizeSpan(
    span({
      attributes: {
        "http.route": "/items/[scope]/[name]",
        "next.route": "/items/[scope]/[name]",
        "http.method": "GET",
        "http.status_code": 200,
        "http.target": "/items/@team/secret-skill?tab=files",
        "http.url": "http://localhost/items/@team/secret-skill",
        "url.full": "http://localhost/items/@team/secret-skill",
        "client.address": "203.0.113.7",
        "http.user_agent": "Mozilla/5.0",
      },
    }),
  );
  expect(sent.attributes).toEqual({
    "http.route": "/items/[scope]/[name]",
    "next.route": "/items/[scope]/[name]",
    "http.method": "GET",
    "http.status_code": 200,
  });
});

it("drops a value the logger would change: an email, a token, a URL's password", () => {
  const sent = sanitizeSpan(
    span({
      attributes: {
        "enduser.email": "ana@example.com",
        note: `rmk_${"a".repeat(43)}`,
        list: ["fine", "bob@example.org"],
        "db.connection": "postgres://ronne:pw@db/ronne",
        kept: "plain text",
      },
    }),
  );
  expect(sent.attributes).toEqual({ kept: "plain text" });
});

it("keeps an exception's type only, a status without its message, a name without its URL's path", () => {
  const sent = sanitizeSpan(
    span({
      name: "fetch GET https://registry.example/items/@team/secret-skill?x=1",
      events: [
        {
          name: "exception",
          time: [0, 0],
          attributes: {
            "exception.type": "ProposalArtifactError",
            "exception.message": "The files of @team/secret-skill 1.0.0 couldn't be read.",
            "exception.stacktrace": "at …",
          },
        },
      ],
      status: { code: 2, message: "The files of @team/secret-skill couldn't be read." },
    }),
  );
  expect(sent.name).toBe("fetch GET https://registry.example");
  expect(sent.events[0]?.attributes).toEqual({ "exception.type": "ProposalArtifactError" });
  expect(sent.status).toEqual({ code: 2 });
  expect(JSON.stringify({ ...sent, spanContext: undefined })).not.toContain("secret-skill");
  expect(sent.spanContext().traceId).toBe("t");
});
