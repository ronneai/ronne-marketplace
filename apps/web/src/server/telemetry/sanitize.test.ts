import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { expect, it } from "vitest";
import { sanitizeSpan } from "./sanitize";

const span = (overrides: Partial<ReadableSpan>): ReadableSpan =>
  ({
    name: "GET /items/[scope]/[name]",
    attributes: {},
    events: [],
    links: [],
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

it("cuts a URL in any value to its origin, and drops IPs, headers and the user's keys", () => {
  const sent = sanitizeSpan(
    span({
      attributes: {
        "next.span_name": "fetch GET https://registry.example/items/@team/secret-skill?token=abc",
        "resource.name": "https://registry.example/items/@team/secret-skill",
        "server.address": "10.0.0.5",
        peer: "2001:db8::7",
        "http.request.header.x-forwarded-for": ["203.0.113.5"],
        "user.id": "01J9USERID",
        "user.name": "Ana Privacy",
        "http.route": "/items/[scope]/[name]",
      },
    }),
  );
  expect(sent.attributes).toEqual({
    "next.span_name": "fetch GET https://registry.example",
    "resource.name": "https://registry.example",
    "http.route": "/items/[scope]/[name]",
  });
});

it("drops next.route from Next.js's page-render span, which fills in the path", () => {
  const sent = sanitizeSpan(
    span({
      attributes: {
        "next.span_type": "BaseServer.renderToResponse",
        "next.route": "/workspaces/e2e-vault/items/e2e-vault-tools/vault-deploy",
        "next.page": "/workspaces/e2e-vault/items/e2e-vault-tools/vault-deploy",
      },
    }),
  );
  expect(sent.attributes).toEqual({ "next.span_type": "BaseServer.renderToResponse" });
});

it("keeps no trace state, no link attributes, a class-name exception type, a clean event name", () => {
  const context = {
    traceId: "t",
    spanId: "s",
    traceFlags: 1,
    traceState: { serialize: () => "ronne=ana@example.com" },
  };
  const sent = sanitizeSpan(
    span({
      spanContext: () => context as never,
      links: [{ context: context as never, attributes: { who: "ana" } }],
      events: [
        { name: "user ana@example.com did x", time: [0, 0], attributes: {} },
        { name: "exception", time: [0, 0], attributes: { "exception.type": "ana@example.com" } },
      ],
    }),
  );
  expect(sent.spanContext()).toEqual({ traceId: "t", spanId: "s", traceFlags: 1 });
  expect(sent.links).toEqual([{ context: { traceId: "t", spanId: "s", traceFlags: 1 } }]);
  expect(sent.events.map((event) => [event.name, event.attributes])).toEqual([
    ["user [email] did x", {}],
    ["exception", {}],
  ]);
});
