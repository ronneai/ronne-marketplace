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
  "url.full",
  "url.path",
  "url.query",
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

/** Keys never sent whatever their value: request and response headers, and the user's. */
const DROPPED_PREFIXES = ["http.request.header.", "http.response.header.", "user.", "enduser."];

/** An IPv4 or IPv6 address, whole: a client's, or a host's that maps to one. */
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]*:[0-9a-f:.]*:[0-9a-f:.]*)$/i;

/** A URL in a value keeps only its origin: its path and query can name an item or hold a token. */
const originOnly = (value: string) => value.replace(/\b(https?:\/\/[^/\s?#]+)[^\s"']*/g, "$1");

type Value = ReadableSpan["attributes"][string];

/**
 * A string that may be sent: not an IP address, and nothing the logger would change (an email, a
 * token, a URL's password, a stored path) once a URL in it is cut to its origin.
 */
const safeString = (value: string) => !IP.test(value.trim()) && redactString(value) === value;

/** A value as it's sent (URLs cut to their origin), or undefined when it isn't sent. */
const sendable = (value: Value): Value | undefined => {
  if (typeof value === "string") {
    const cut = originOnly(value);
    return safeString(cut) ? cut : undefined;
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => (typeof item === "string" ? originOnly(item) : item));
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
      if (DROPPED.has(key) || DROPPED_PREFIXES.some((prefix) => key.startsWith(prefix))) return [];
      if ((key === "next.route" || key === "next.page") && fillsInPath(attributes)) return [];
      const sent = sendable(value);
      return sent === undefined ? [] : [[key, sent]];
    }),
  );

/** A URL in a span's or an event's name keeps only its origin; anything personal is hidden. */
const sanitizeName = (name: string) => redactString(originOnly(name));

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
