import { describe, expect, it } from "vitest";
import { readJsonObjectWithin } from "./read-json";

const request = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/x", {
    method: "POST",
    headers,
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);

/** A body sent in chunks, with no content-length, as a chunked upload arrives. */
const streamed = (chunks: string[]) => {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      const chunk = chunks[pulled];
      pulled += 1;
      if (chunk === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(chunk));
    },
  });
  return { stream, pulled: () => pulled };
};

const code = async (read: Awaited<ReturnType<typeof readJsonObjectWithin>>) =>
  read.ok
    ? null
    : [
        read.response.status,
        ((await read.response.json()) as { error: { code: string } }).error.code,
      ];

describe("readJsonObjectWithin", () => {
  it("reads a JSON object within the limit, and gives null for anything else", async () => {
    expect(await readJsonObjectWithin(request('{"a":1}'), 100)).toEqual({
      ok: true,
      body: { a: 1 },
    });
    for (const body of ["not json", "[1]", "3", "null", ""])
      expect(await readJsonObjectWithin(request(body), 100)).toEqual({ ok: true, body: null });
    expect(await readJsonObjectWithin(request(null), 100)).toEqual({ ok: true, body: null });
    const exact = `{"a":"${"x".repeat(92)}"}`;
    expect(exact).toHaveLength(100);
    expect((await readJsonObjectWithin(request(exact), 100)).ok).toBe(true);
  });

  it("refuses a declared content-length over the limit without reading the body", async () => {
    const body = streamed(['{"a":1}']);
    const read = await readJsonObjectWithin(request(body.stream, { "content-length": "101" }), 100);
    expect(await code(read)).toEqual([413, "body_too_large"]);
    expect(body.pulled()).toBeLessThanOrEqual(1);
  });

  it("counts the bytes of a body without content-length, and stops reading past the limit", async () => {
    const body = streamed(['{"a":"', "x".repeat(60), "x".repeat(60), "never read", '"}']);
    const read = await readJsonObjectWithin(request(body.stream), 100);
    expect(await code(read)).toEqual([413, "body_too_large"]);
    expect(body.pulled()).toBeLessThan(5);
  });

  it("counts bytes, not characters", async () => {
    const read = await readJsonObjectWithin(request(`{"a":"${"é".repeat(50)}"}`), 100);
    expect(await code(read)).toEqual([413, "body_too_large"]);
  });

  it("says the limit in the error's details", async () => {
    const read = await readJsonObjectWithin(request("x".repeat(2048)), 1024);
    if (read.ok) throw new Error("expected a refusal");
    expect(await read.response.json()).toEqual({
      error: {
        code: "body_too_large",
        message: "The request body is over 1 KB.",
        details: { limit: 1024 },
      },
    });
  });
});
