// What leaves for the collector (101), which may be a third party's: nothing personal, no item,
// scope or workspace name, no secret. Every span passes through here before it's exported.
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { redactString } from "../log/redact";

/**
 * Attributes never sent: a path or URL holds an item's name (`/items/@team/x`), a client's address
 * is personal, a user agent fingerprints. Next.js sets some of these on its request spans; the
 * route's pattern (`http.route`, `next.route`) stays.
 */
const DROPPED = new Set([
  "http.target",
  "http.url",
  "http.client_ip",
  "client.address",
  "client.port",
  "net.peer.ip",
  "net.sock.peer.addr",
  "network.peer.address",
  "network.peer.port",
  "http.user_agent",
  "user_agent.original",
  "enduser.id",
]);

/**
 * Keys never sent whatever their value: every `url.*`, request and response headers, and the
 * user's.
 */
const DROPPED_PREFIXES = [
  "url.",
  "http.request.header",
  "http.response.header",
  "user.",
  "enduser.",
];

/** A key that is a name of ours: dotted words, never an email, a path or free text. */
const KEY = /^[A-Za-z_][\w.-]{0,127}$/;

/** An IPv4 or IPv6 address, whole: a client's, or a host's that maps to one. */
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]*:[0-9a-f:.]*:[0-9a-f:.]*)$/i;

/**
 * An address inside a longer value: IPv4 anywhere (with a port, in a list, after `for=`), IPv6 in
 * brackets, with `::`, or in full.
 */
const ADDRESS =
  /(?<![\w.])\d{1,3}(?:\.\d{1,3}){3}(?![\w.])|\[[0-9a-f:.]*:[0-9a-f:.]*\]|(?<![\w:])(?:[0-9a-f]{0,4}:)*[0-9a-f]{0,4}::[0-9a-f:.]*(?![\w:])|(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi;
const hasAddress = (value: string) => IP.test(value.trim()) || value.search(ADDRESS) >= 0;

/**
 * A URL keeps only its origin, whatever its scheme or case (`HTTPS://`, `ws://`, `file://`, or
 * `//host` alone): its path and query can name an item or hold a token.
 */
const originOnly = (value: string) =>
  value.replace(/((?:\b[a-z][a-z0-9+.-]*:)?\/\/[^/\s?#"']*)[^\s"']*/gi, (whole, origin, at) =>
    // `//host` alone only where a value or a word starts, never inside a path.
    origin.startsWith("//") && at > 0 && !/[\s"'(=,]/.test(value[at - 1] ?? "") ? whole : origin,
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

const routeSegment = (segment: string) =>
  ROUTE_SEGMENTS.has(segment) ||
  ROUTE_FILES.has(segment) ||
  // A pattern's (`[name]`, `[...all]`, `[[...slug]]`) or a route group (`(app)`).
  /^\[{1,2}(?:\.\.\.)?[\w-]+\]{1,2}$|^\([\w-]+\)$/.test(segment);

/** Paths cut at their first segment that isn't the app's (`/workspaces/hush/x` → `/workspaces/…`). */
const patternsOnly = (value: string) =>
  value.replace(/(?<![\w/:.])\/[\w@%.~[\]-][^\s"'?#]*/g, (path) => {
    // The path starts with "/": its first piece is empty.
    const segments = path.split("/").slice(1);
    const kept = segments.findIndex((segment) => segment !== "" && !routeSegment(segment));
    return kept === -1 ? path : `/${[...segments.slice(0, kept), "…"].join("/")}`;
  });

/** URLs to their origin, then paths to the app's patterns. */
const cut = (value: string) => patternsOnly(originOnly(value));

type Value = ReadableSpan["attributes"][string];

/**
 * A string that may be sent: not an IP address, and nothing the logger would change (an email, a
 * token, a URL's password, a stored path) once a URL in it is cut to its origin.
 */
const safeString = (value: string) => !hasAddress(value) && redactString(value) === value;

/** A value as it's sent (URLs and paths cut), or undefined when it isn't sent. */
const sendable = (value: Value): Value | undefined => {
  if (typeof value === "string") {
    const sent = cut(value);
    return safeString(sent) ? sent : undefined;
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => (typeof item === "string" ? cut(item) : item));
    return items.every((item) => typeof item !== "string" || safeString(item))
      ? (items as Value)
      : undefined;
  }
  return value;
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
      if (!KEY.test(key) || DROPPED.has(key)) return [];
      if (DROPPED_PREFIXES.some((prefix) => key.startsWith(prefix))) return [];
      if ((key === "next.route" || key === "next.page") && fillsInPath(attributes)) return [];
      const sent = sendable(value);
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
 * The resource as it's sent: the service's name and version, the SDK's own, `deployment.*`, and
 * what the operator sets in OTEL_RESOURCE_ATTRIBUTES. `@vercel/otel` adds Vercel's attributes
 * (`cloud.provider="vercel"`, `vercel.*`, `node.env`) by default, wrong for a self-hosted server.
 */
export const resourceSanitizer = (operatorKeys: readonly string[]) => {
  const kept = (key: string) =>
    key.startsWith("service.") ||
    key.startsWith("telemetry.sdk.") ||
    key.startsWith("deployment.") ||
    operatorKeys.includes(key);
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
