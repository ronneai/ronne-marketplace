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

type Value = ReadableSpan["attributes"][string];

/** A value the logger would change (an email, a token, a URL's password, a stored path) isn't sent. */
const safe = (value: Value): boolean =>
  typeof value === "string"
    ? redactString(value) === value
    : Array.isArray(value)
      ? value.every((item) => typeof item !== "string" || redactString(item) === item)
      : true;

export const sanitizeAttributes = (attributes: ReadableSpan["attributes"]) =>
  Object.fromEntries(
    Object.entries(attributes).filter(([key, value]) => !DROPPED.has(key) && safe(value)),
  );

/** A URL in a span's name (`fetch GET https://…/items/x`) keeps only its origin. */
const sanitizeName = (name: string) =>
  name.replace(/\b(https?:\/\/[^/\s?#]+)[^\s]*/g, "$1").replace(/\S+@\S+/g, "[email]");

/**
 * The span as it's sent: its attributes filtered; its events (an exception's) keeping their name
 * and the exception's type only, never its message or stack; its status without a message.
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
      value: span.events.map((event) => ({
        ...event,
        attributes:
          event.attributes?.["exception.type"] !== undefined
            ? { "exception.type": event.attributes["exception.type"] }
            : {},
      })),
    },
    status: { value: { code: span.status.code } },
  });

type Resource = ReadableSpan["resource"];

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
