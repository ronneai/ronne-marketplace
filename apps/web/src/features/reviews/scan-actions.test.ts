import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);
const scans = vi.hoisted(() => ({ requestScan: vi.fn(async () => true) }));
vi.mock("@/server/domains/scans/actions/scans", () => scans);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/server/http/server-action", () => ({
  serverAction: <A extends unknown[], R>(action: (...args: A) => Promise<R>) => action,
}));

const { askForScan } = await import("./scan-actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("Scan again (135, 137)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes the review page and the author's, which share the screen", async () => {
    expect(await askForScan({}, form({ revisionId: "r1", submissionId: "s1" }))).toEqual({
      queued: true,
    });
    expect(cache.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/reviews/s1",
      "/submissions/s1",
    ]);
  });

  it("refuses a request without its ids, and asks for nothing", async () => {
    expect(await askForScan({}, form({ revisionId: "r1" }))).toEqual({ refused: true });
    expect(scans.requestScan).not.toHaveBeenCalled();
  });
});
