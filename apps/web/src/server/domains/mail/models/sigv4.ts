import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 (189's SES transport), on `node:crypto` alone, for one request: what the
 * `Authorization` header and `X-Amz-Date` must say. It signs every header it's given, so pass only
 * the ones sent. Checked against AWS's published examples (`sigv4.test.ts`).
 */
export type SigV4Request = {
  method: string;
  /** The full URL, query included. */
  url: string;
  headers: Record<string, string>;
  body: string | Uint8Array;
};

export type SigV4Credentials = { accessKeyId: string; secretAccessKey: string };

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data).digest();

// RFC 3986's unreserved characters stay; every other byte is %XX, upper case, as SigV4 asks.
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** `YYYYMMDDTHHMMSSZ`, the form SigV4 dates take. */
export const amzDate = (at: Date): string =>
  at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

const canonicalQuery = (url: URL): string =>
  [...url.searchParams.entries()]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

// Each path segment encoded once (S3 is the only service that differs, and isn't used).
const canonicalPath = (url: URL): string =>
  url.pathname === ""
    ? "/"
    : url.pathname
        .split("/")
        .map((segment) => encode(decodeURIComponent(segment)))
        .join("/");

/**
 * The headers to send with `request`, signed: its own, `X-Amz-Date`, and `Authorization`. The
 * `host` header is added from the URL when the request doesn't name it.
 */
export const signV4 = (
  request: SigV4Request,
  credentials: SigV4Credentials,
  scope: { region: string; service: string },
  at: Date,
): Record<string, string> => {
  const url = new URL(request.url);
  const date = amzDate(at);
  const day = date.slice(0, 8);
  const headers: Record<string, string> = { ...request.headers, "x-amz-date": date };
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "host")) headers.host = url.host;
  const canonical = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = canonical.map(([k]) => k).join(";");
  const canonicalRequest = [
    request.method.toUpperCase(),
    canonicalPath(url),
    canonicalQuery(url),
    ...canonical.map(([k, v]) => `${k}:${v}`),
    "",
    signedHeaders,
    sha256(request.body),
  ].join("\n");
  const credentialScope = `${day}/${scope.region}/${scope.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", date, credentialScope, sha256(canonicalRequest)].join("\n");
  const key = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), scope.region), scope.service),
    "aws4_request",
  );
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
};
