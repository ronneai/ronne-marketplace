// What leaves for the collector (101), which may be a third party's: nothing personal, no item,
// scope or workspace name, no secret. Every span passes through here before it's exported.
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { redactString } from "../log/redact";

/**
 * The only attribute keys sent: Ronne's own, and those Next.js 16, Better Auth 1.7 and
 * `@vercel/otel` set that hold no path, address or name of their own (never `http.target`,
 * `http.url`, `url.*`, a client's address or user agent, a header, `user.*`). Any other key is
 * dropped, so a library that starts sending a new one can't leak through it; a key worth having
 * is added here. The values sent still pass the rules below.
 */
export const SENT_KEYS = new Set([
  // Ronne's (telemetry/real-hooks.ts, spans.ts).
  "ronne.request_id",
  "ronne.items",
  "ronne.tool",
  "ronne.feed.cached",
  "ronne.feed.plugins",
  "ronne.storage.bytes",
  "db.system.name",
  "db.operation.name",
  "db.query.text",
  // Next.js's.
  "next.span_type",
  "next.span_name",
  "next.span_category",
  "next.route",
  "next.page",
  "next.segment",
  "next.rsc",
  "next.bubble",
  "next.clientComponentLoadCount",
  "next.fetch.idx",
  "next.fetch.cache_status",
  "next.fetch.cache_reason",
  "http.route",
  "http.method",
  "http.status_code",
  "error.type",
  "net.peer.port",
  // Better Auth's.
  "better_auth.context",
  "better_auth.hook.type",
  "better_auth.operation_id",
  "db.collection.name",
  "http.response.status_code",
  // `@vercel/otel`'s.
  "operation.name",
  "resource.name",
  "http.request.method",
]);

/** An IPv4 or IPv6 address, whole: a client's, or a host's that maps to one. */
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]*:[0-9a-f:.]*:[0-9a-f:.]*)$/i;

/**
 * An address inside a longer value: IPv4 anywhere (with a port, in a list, after `for=`), IPv6 in
 * brackets, with `::`, or in full.
 */
const ADDRESS =
  /(?<!\w|\d\.)\d{1,3}(?:\.\d{1,3}){3}(?!\w|\.\d)|\[[0-9a-f:.]*:[0-9a-f:.]*\]|(?<![\w:])(?:[0-9a-f]{0,4}:){0,7}[0-9a-f]{0,4}::[0-9a-f:.]{0,45}(?![\w:])|(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi;
const hasAddress = (value: string) => IP.test(value.trim()) || value.search(ADDRESS) >= 0;

/**
 * A URL keeps only its origin, whatever its scheme or case (`HTTPS://`, `ws://`, `file://`, or
 * `//host` alone), and not a user name or password: its path and query can name an item or hold a
 * token. A closing quote, bracket or comma after it stays.
 */
const originOnly = (value: string) =>
  value
    .replace(/((?:\b[a-z][a-z0-9+.-]{0,31}:)?\/\/)[^/\s?#]*@/gi, "$1")
    .replace(
      /((?:\b[a-z][a-z0-9+.-]{0,31}:)?\/\/[^/\s?#"']*)([^\s]*)/gi,
      (whole, origin, rest, at) =>
        // `//host` alone only where a value or a word starts, never inside a path.
        origin.startsWith("//") && at > 0 && !/[\s"'(=,]/.test(value[at - 1] ?? "")
          ? whole
          : origin + (/["',;]+$/.exec(rest)?.[0] ?? ""),
    );

/**
 * The app's static route segments (checked against `app/` by a test), and Better Auth's
 * endpoints that the identity domain calls (its spans are named `handler /sign-in/email`). A path
 * in a value or a name keeps its segments while they're these or a pattern's (`[name]`); from the
 * first other segment (a workspace's, a scope's, an item's name) it's cut to `…`.
 */
export const ROUTE_SEGMENTS = new Set([
  "account",
  "admin",
  "api",
  "audit",
  "auth",
  "catalogue",
  "check",
  "current-workspace",
  "drafts",
  "feeds",
  "health",
  "items",
  "join",
  "marketplace.json",
  "me",
  "menu",
  "new",
  "password",
  "plugins",
  "requests",
  "resolve",
  "reviews",
  "scopes",
  "settings",
  "setup",
  "sign-in",
  "styleguide",
  "submissions",
  "submit",
  "tarball",
  "token",
  "tokens",
  "usage",
  "users",
  "v1",
  "versions",
  "workspaces",
  // Next.js's own: its assets, the not-found and error pages, the app's icons.
  "_next",
  "_not-found",
  "not-found",
  "_global-error",
  "icon.png",
  "icon.svg",
  // Better Auth's: /change-password, /get-session, /sign-in/email, /sign-out, /sign-up/email.
  "change-password",
  "get-session",
  "email",
  "sign-out",
  "sign-up",
]);

/** Next.js's file names, which its internal spans add to a route (`/(app)/reviews/page`). */
const ROUTE_FILES = new Set(["page", "layout", "route", "default", "error", "loading", "template"]);

/** The app's dynamic segments and route groups (checked against `app/` by the same test). */
export const ROUTE_PATTERNS = new Set([
  "(app)",
  "[...all]",
  "[file]",
  "[id]",
  "[item]",
  "[name]",
  "[scope]",
  "[tool]",
  "[version]",
  "[workspace]",
]);

const routeSegment = (segment: string) =>
  ROUTE_SEGMENTS.has(segment) || ROUTE_FILES.has(segment) || ROUTE_PATTERNS.has(segment);

/**
 * Paths cut at their first segment that isn't the app's (`/workspaces/hush/x` → `/workspaces/…`),
 * and their query and fragment dropped.
 */
const patternsOnly = (value: string) =>
  value.replace(/(?<![\p{L}\p{N}_/])(?:\/{3,}|\/)[^\s/?#][^\s?#]*(?:[?#]\S*)?/gu, (whole) => {
    const path = whole.replace(/[?#].*/, "");
    // A closing quote, bracket or comma isn't the path's.
    const end = /["',;]+$/.exec(path)?.[0] ?? "";
    // The path starts with "/": its first piece is empty.
    const segments = path
      .slice(0, path.length - end.length)
      .split("/")
      .slice(1);
    const kept = segments.findIndex((segment) => segment !== "" && !routeSegment(segment));
    return (
      (kept === -1 ? `/${segments.join("/")}` : `/${[...segments.slice(0, kept), "…"].join("/")}`) +
      end
    );
  });

/** An item's reference without a path (`@scope/name`): its scope and name are dropped. */
const references = (value: string) => value.replace(/(?<!\w)@[\w-]+\/[\w.-]+/g, "@…");

/** An array value keeps its first items only. */
const MAX_ITEMS = 100;

/** Longer values and names are cut to this before the rules run. */
const MAX_LENGTH = 4096;

/** A query on its own, without a path (`?q=hushvault`): dropped to the end of its word. */
const withoutQueries = (value: string) => value.replace(/\?[^\s"']+/g, "");

/** URLs to their origin, then paths to the app's patterns, then any query left dropped. */
const cut = (value: string, query = true) => {
  // A value's length is capped before any rule runs: none is meant for a long input.
  const text = value.length > MAX_LENGTH ? value.slice(0, MAX_LENGTH) : value;
  const cleaned = references(patternsOnly(originOnly(text)));
  return query ? withoutQueries(cleaned) : cleaned;
};

type Value = ReadableSpan["attributes"][string];

/**
 * A string that may be sent: not an IP address, and nothing the logger would change (an email, a
 * token, a URL's password, a stored path) once a URL in it is cut to its origin.
 */
const safeString = (value: string) => !hasAddress(value) && redactString(value) === value;

/** A value as it's sent (URLs and paths cut), or undefined when it isn't sent. */
const sendable = (value: Value, key: string): Value | undefined => {
  // The database spans' SQL has `?` placeholders, which aren't a query string.
  const query = key !== "db.query.text";
  if (typeof value === "string") {
    const sent = cut(value, query);
    return safeString(sent) ? sent : undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ITEMS)
      .map((item) => (typeof item === "string" ? cut(item, query) : item));
    // Strings pass the rules; anything but a string, number or boolean drops the whole array.
    const primitive = (item: unknown) => ["string", "number", "boolean"].includes(typeof item);
    return items.every((item) => primitive(item) && (typeof item !== "string" || safeString(item)))
      ? (items as Value)
      : undefined;
  }
  // Numbers and booleans pass; anything else (an object a library should not set) doesn't.
  return typeof value === "number" || typeof value === "boolean" ? value : undefined;
};

/**
 * Next.js's page-render span names the filled-in path in `next.route` (with NEXT_OTEL_VERBOSE,
 * which start turns off; this is the second guard). Its request spans use the route's pattern.
 */
const fillsInPath = (attributes: ReadableSpan["attributes"]) =>
  attributes["next.span_type"] === "BaseServer.renderToResponse";

export const sanitizeAttributes = (attributes: ReadableSpan["attributes"]) =>
  Object.fromEntries(
    Object.entries(attributes).flatMap(([key, value]) => {
      if (!SENT_KEYS.has(key)) return [];
      if ((key === "next.route" || key === "next.page") && fillsInPath(attributes)) return [];
      const sent = sendable(value, key);
      return sent === undefined ? [] : [[key, sent]];
    }),
  );

/** A span's or an event's name: URLs and paths cut, addresses and anything personal hidden. */
const sanitizeName = (name: string) => redactString(cut(name)).replace(ADDRESS, "[address]");

/** An exception's type, when it's a class name (`ForbiddenError`), never free text. */
const CLASS_NAME = /^[A-Za-z_$][\w$.]{0,99}$/;

/**
 * The span as it's sent: its attributes filtered; its events (an exception's) keeping their name
 * and the exception's type (a class name) only, never its message or stack; its links without
 * attributes; its status without a message; and no trace state, which a client sets in its
 * `tracestate` header and could fill with anything.
 */
export const sanitizeSpan = (
  span: ReadableSpan,
  resource: (resource: Resource) => Resource = (r) => r,
): ReadableSpan =>
  Object.create(span, {
    resource: { value: resource(span.resource) },
    name: { value: sanitizeName(span.name) },
    attributes: { value: sanitizeAttributes(span.attributes) },
    events: {
      value: span.events.map((event) => {
        const type = event.attributes?.["exception.type"];
        return {
          ...event,
          name: sanitizeName(event.name),
          attributes:
            typeof type === "string" && CLASS_NAME.test(type) ? { "exception.type": type } : {},
        };
      }),
    },
    links: { value: span.links.map((link) => ({ context: withoutState(link.context) })) },
    status: { value: { code: span.status.code } },
    spanContext: { value: () => withoutState(span.spanContext()) },
  });

type Resource = ReadableSpan["resource"];
type Context = ReturnType<ReadableSpan["spanContext"]>;

/** A span context without its trace state. */
const withoutState = (context: Context): Context => {
  const { traceState: _dropped, ...rest } = context;
  return rest;
};

/**
 * The resource as it's sent: the service's name and version, `deployment.*`, and what the
 * operator sets in OTEL_RESOURCE_ATTRIBUTES. `@vercel/otel` adds Vercel's attributes
 * (`cloud.provider="vercel"`, `vercel.*`, `node.env`) by default, wrong for a self-hosted server.
 */
export const resourceSanitizer = (operatorKeys: readonly string[]) => {
  const kept = (key: string) =>
    key.startsWith("service.") || key.startsWith("deployment.") || operatorKeys.includes(key);
  return (resource: Resource): Resource => {
    const attributes = Object.fromEntries(
      Object.entries(resource.attributes).filter(([key]) => kept(key)),
    );
    return Object.create(resource, {
      attributes: { value: attributes },
      getRawAttributes: { value: () => Object.entries(attributes) },
    });
  };
};

/** The keys OTEL_RESOURCE_ATTRIBUTES names (`key=value,key2=value2`). */
export const operatorResourceKeys = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((pair) => decodeURIComponent(pair.split("=")[0]?.trim() ?? ""))
    .filter(Boolean);
