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
        "next.span_name": `rmk_${"a".repeat(43)}`,
        "next.segment": ["fine", "bob@example.org"],
        "db.connection": "postgres://ronne:pw@db/ronne",
        "resource.name": "plain text",
      },
    }),
  );
  expect(sent.attributes).toEqual({ "resource.name": "plain text" });
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

it("cuts URLs of any scheme or case, and private paths, in values, arrays and names", () => {
  const sent = sanitizeSpan(
    span({
      name: "GET /workspaces/hushvault/items/hushscope/secret",
      attributes: {
        "next.span_name": "HTTPS://registry.example/items/@team/secret-skill",
        "next.segment": "ws://host.example/workspaces/hushvault/items/x",
        "resource.name": "file:///tmp/x/@hushvault/hushscope/secret/1.0.0.tgz",
        "error.type": ["HTTP://h.example/items/@t/s"],
        "next.fetch.cache_reason": "//registry.example/items/@team/secret",
        "next.route": "/workspaces/hushvault/items/x",
        "http.route": "/api/v1/items/[scope]/[name]/versions/[version]/tarball",
        "db.query.text": 'select "name" from "items" where "id" = ?',
        "operation.name": "handler /sign-in/email",
        "next.page": "/(app)/workspaces/[name]/items/[scope]/[item]/page",
        "next.fetch.cache_status": "GET /catalogue?q=hushvault",
        "better_auth.context": "/reviews#hushvault",
        "better_auth.hook.type": "/reviews?ref=ana%40example.com",
      },
      events: [{ name: "released /items/@hushvault/secret", time: [0, 0], attributes: {} }],
    }),
  );
  expect(sent.name).toBe("GET /workspaces/…");
  expect(sent.attributes).toEqual({
    "next.span_name": "HTTPS://registry.example",
    "next.segment": "ws://host.example",
    "resource.name": "file://",
    "error.type": ["HTTP://h.example"],
    "next.fetch.cache_reason": "//registry.example",
    "next.route": "/workspaces/…",
    "http.route": "/api/v1/items/[scope]/[name]/versions/[version]/tarball",
    "db.query.text": 'select "name" from "items" where "id" = ?',
    "operation.name": "handler /sign-in/email",
    "next.page": "/(app)/workspaces/[name]/items/[scope]/[item]/page",
    "next.fetch.cache_status": "GET /catalogue",
    "better_auth.context": "/reviews",
    "better_auth.hook.type": "/reviews",
  });
  expect(sent.events[0]?.name).toBe("released /items/…");
});

it("drops addresses inside a value, and every key that isn't listed", () => {
  const sent = sanitizeSpan(
    span({
      name: "connect 198.51.100.23:5432",
      attributes: {
        "next.span_name": "198.51.100.23:5432",
        "next.segment": "[2001:db8::1]:443",
        "resource.name": "198.51.100.23, 10.0.0.1",
        "error.type": "for=198.51.100.23",
        "next.fetch.cache_reason": ["fine", "198.51.100.23:80"],
        "next.fetch.cache_status": "fe80::1%en0",
        "zelda@example.org": 1,
        "/workspaces/hushvault/items/x": 2,
        hushvault: 3,
        user_id: "u1",
        "http.request.headers": "cookie: a=b",
        "url.domain": "registry.example",
        "url.scheme": "https",
        "better_auth.context": "1.2.3",
        "better_auth.hook.type": "plain",
      },
    }),
  );
  expect(sent.name).toBe("connect [address]:5432");
  expect(sent.attributes).toEqual({
    "better_auth.context": "1.2.3",
    "better_auth.hook.type": "plain",
  });
});

it("cuts a path after a colon or a dot, or starting with any letter; drops a bare query", () => {
  const sent = sanitizeSpan(
    span({
      name: "route:/workspaces/hushvault?q=hushquery",
      attributes: {
        "next.span_name": "GET:/items/@hushscope/x#hushfragment",
        "next.segment": "file./workspaces/hushdot",
        "resource.name": "/éhushstart/x",
        "error.type": "/workspaces/[hushbracket]/x",
        "operation.name": "search ?a&q=hushbare&page=2 done ?hushword",
      },
      events: [{ name: "at ./workspaces/hushevent", time: [0, 0], attributes: {} }],
    }),
  );
  expect(sent.name).toBe("route:/workspaces/…");
  expect(sent.attributes).toEqual({
    "next.span_name": "GET:/items/…",
    "next.segment": "file./workspaces/…",
    "resource.name": "/…",
    "error.type": "/workspaces/…",
    "operation.name": "search  done ",
  });
  expect(sent.events[0]?.name).toBe("at ./workspaces/…");
});

it("hides an address followed or led by a sentence's dot", () => {
  const sent = sanitizeSpan(
    span({
      name: "from 198.51.100.23. done",
      attributes: {
        "next.span_name": "client 198.51.100.23. done",
        "next.segment": "peer=198.51.100.23.:80",
        "resource.name": "v1.2.3.4",
        "error.type": "release 1.2.3",
      },
    }),
  );
  expect(sent.name).toBe("from [address]. done");
  // A word that leads it isn't an address: a version.
  expect(sent.attributes).toEqual({ "resource.name": "v1.2.3.4", "error.type": "release 1.2.3" });
});

it("keeps a URL's origin without its user name or password; cuts a path starting with a symbol", () => {
  const sent = sanitizeSpan(
    span({
      name: "GET https://hushuser:hushpw@localhost:3000/x",
      attributes: {
        "next.span_name": "https://hushuser@localhost:3000/x",
        "next.segment": "/!hushbang/x",
        "resource.name": "/(hushparen)/x",
        "error.type": "/😀hushemoji",
      },
    }),
  );
  expect(sent.name).toBe("GET https://localhost:3000");
  expect(sent.attributes).toEqual({
    "next.span_name": "https://localhost:3000",
    "next.segment": "/…",
    "resource.name": "/…",
    "error.type": "/…",
  });
});

it("keeps a database span's placeholders; cuts an item's reference; handles quotes", () => {
  const sql = 'insert into "x" ("a", "b") values (?, ?) where "c" = ?;';
  const sent = sanitizeSpan(
    span({
      attributes: {
        "db.query.text": sql,
        "next.span_name": "see \"@hushscope/hushitem\" and '/workspaces/hush/x'",
        "next.segment": "/'hushquote",
        "resource.name": 'GET https://hushu"ser@host/a"b/hush',
      },
    }),
  );
  expect(sent.attributes).toEqual({
    "db.query.text": sql,
    "next.span_name": "see \"@…\" and '/workspaces/…'",
    "next.segment": "/…",
    "resource.name": "GET https://host",
  });
});

it("takes linear time on long inputs: values are capped, and no rule backtracks", () => {
  const started = performance.now();
  for (const text of ["a-".repeat(60_000), `${"a:".repeat(60_000)}x`, `[${"f:".repeat(60_000)}`])
    sanitizeSpan(span({ name: text, attributes: { "next.span_name": text } }));
  expect(performance.now() - started).toBeLessThan(500);
});

it("removes a user name and password to the last @; cuts what follows brackets and a doubled @", () => {
  const sent = sanitizeSpan(
    span({
      name: "GET https://hushuser:hushp@ss@host/x",
      attributes: {
        "next.span_name": "https://hushuser:hushpw@a@b@host/x",
        "next.segment": "https://hush@x.y@host/",
        "resource.name": "[///hushneedle/x",
        "error.type": "@@hushneedle/x",
      },
    }),
  );
  expect(sent.name).toBe("GET https://host");
  expect(sent.attributes).toEqual({
    "next.span_name": "https://host",
    "next.segment": "https://host",
    "resource.name": "[///…",
    "error.type": "@@…",
  });
});

it("keeps the first 100 items of an array value, and takes linear time on a long one", () => {
  const started = performance.now();
  const sent = sanitizeSpan(
    span({
      attributes: { "next.bubble": Array.from({ length: 5000 }, (_, i) => `n${i} `.repeat(100)) },
    }),
  );
  expect((sent.attributes["next.bubble"] as string[]).length).toBe(100);
  expect(performance.now() - started).toBeLessThan(500);
});

it("drops a value that isn't a string, number, boolean or array", () => {
  const sent = sanitizeSpan(
    span({
      attributes: {
        "next.route": { a: "hush@example.com" } as never,
        "next.fetch.idx": 3,
        "next.rsc": true,
        "next.bubble": ["a", { x: "hush@example.com" }, 3] as never,
      },
    }),
  );
  expect(sent.attributes).toEqual({ "next.fetch.idx": 3, "next.rsc": true });
});
