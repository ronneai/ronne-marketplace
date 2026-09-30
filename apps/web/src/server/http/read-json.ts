import { formatBytes } from "@ronneai/core";
import { errorResponse } from "./errors";

export const MIB = 1024 * 1024;

/** The body limit for `/api/v1` requests that send a small JSON object (037). */
export const SMALL_JSON_MAX_BYTES = MIB;

/**
 * The body's bytes, or null once they pass `maxBytes`. A declared `content-length` over the limit
 * is refused without reading; otherwise the bytes are counted as they arrive, so a request without
 * one (chunked) is cut too.
 */
const readBytesWithin = async (request: Request, maxBytes: number): Promise<Uint8Array | null> => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export type JsonObjectRead =
  | { ok: true; body: Record<string, unknown> | null }
  | { ok: false; response: Response };

/**
 * A request's JSON body when it's an object, or null (not JSON, or an array or a value); or a
 * `413 body_too_large` response when the body is over `maxBytes`.
 */
export const readJsonObjectWithin = async (
  request: Request,
  maxBytes: number,
): Promise<JsonObjectRead> => {
  const bytes = await readBytesWithin(request, maxBytes);
  if (!bytes)
    return {
      ok: false,
      response: errorResponse(
        413,
        "body_too_large",
        `The request body is over ${formatBytes(maxBytes)}.`,
        { limit: maxBytes },
      ),
    };
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return {
      ok: true,
      body:
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : null,
    };
  } catch {
    return { ok: true, body: null };
  }
};
