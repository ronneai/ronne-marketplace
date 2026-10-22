import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FeedbackLimitError,
  InvalidFeedbackError,
} from "@/server/domains/feedback/exceptions/errors";

const domain = vi.hoisted(() => ({ sendFeedback: vi.fn() }));
vi.mock("@/server/domains/feedback/actions/feedback", () => domain);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/server/http/server-action", () => ({ serverAction: <T>(action: T) => action }));

const { sendFeedbackFromForm } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("sendFeedbackFromForm (127)", () => {
  beforeEach(() => {
    domain.sendFeedback.mockReset();
  });

  it("sends the kind, the message and, when ticked, the page", async () => {
    domain.sendFeedback.mockResolvedValue(undefined);
    expect(
      await sendFeedbackFromForm(
        {},
        form({ kind: "idea", message: "Hi", includePage: "on", page: "/catalogue" }),
      ),
    ).toEqual({ done: true });
    expect(domain.sendFeedback).toHaveBeenCalledWith(expect.any(Headers), {
      kind: "idea",
      message: "Hi",
      page: "/catalogue",
    });
  });

  it("sends no page when the box is not ticked", async () => {
    domain.sendFeedback.mockResolvedValue(undefined);
    await sendFeedbackFromForm({}, form({ kind: "idea", message: "Hi", page: "/catalogue" }));
    expect(domain.sendFeedback.mock.calls[0]?.[1]).toMatchObject({ page: null });
  });

  it("answers a refusal with the reason and what was typed", async () => {
    domain.sendFeedback.mockImplementation(() =>
      Promise.reject(new InvalidFeedbackError("message_required")),
    );
    expect(
      await sendFeedbackFromForm({}, form({ kind: "idea", message: " ", includePage: "on" })),
    ).toEqual({ error: "message_required", kind: "idea", message: " ", includePage: true });
    domain.sendFeedback.mockImplementation(() => Promise.reject(new FeedbackLimitError(10)));
    expect(await sendFeedbackFromForm({}, form({ kind: "idea", message: "x" }))).toMatchObject({
      error: "rate_limited",
      includePage: false,
    });
  });

  it("lets anything else through", async () => {
    domain.sendFeedback.mockImplementation(() => Promise.reject(new Error("database is down")));
    await expect(sendFeedbackFromForm({}, form({}))).rejects.toThrow("database is down");
  });
});
