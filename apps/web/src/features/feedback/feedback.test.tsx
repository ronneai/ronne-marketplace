import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { inLocale } from "@/test/intl";
import { feedbackHref } from "./href";
import type { FeedbackFormState } from "./types";

vi.mock("./actions", () => ({ sendFeedbackFromForm: vi.fn() }));
const { FeedbackForm } = await import("./FeedbackForm");
const { FeedbackDialog } = await import("./FeedbackDialog");

const view = (node: ReactElement) => inLocale("en", () => renderToStaticMarkup(node));
const form = (page: string | null = "/catalogue", initial: FeedbackFormState = {}, done = false) =>
  view(<FeedbackForm page={page} initial={initial} onDone={done ? () => undefined : undefined} />);

describe("the Send feedback form (127)", () => {
  it("asks for a kind, a message and the page, which is included unless unticked", () => {
    const html = form();
    for (const kind of ["Problem", "Idea", "Question", "Praise"]) expect(html).toContain(kind);
    expect(html).toContain('name="kind"');
    expect(html).toContain("<textarea");
    expect(html).toContain("0/4,000 characters");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*name="includePage"[^>]*checked/);
    expect(html).toContain("Include the page I’m on");
    expect(html).toContain('<input type="hidden" name="page" value="/catalogue"/>');
    expect(html).toContain(">Send feedback<");
  });

  it("offers no page option when there is no page to name", () => {
    const html = form(null);
    expect(html).not.toContain("includePage");
    expect(html).not.toContain('name="page"');
  });

  it("puts back what was typed, with the page option as it was left", () => {
    const html = form("/catalogue", {
      error: "message_required",
      kind: "idea",
      message: "Dark <b>mode</b>",
      includePage: false,
    });
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="idea"/);
    expect(html).toContain("Dark &lt;b&gt;mode&lt;/b&gt;");
    expect(html).not.toMatch(/name="includePage"[^>]*checked/);
    expect(html).toContain("16/4,000 characters");
  });

  it("says what is wrong beside the field", () => {
    const kind = form("/", { error: "kind_required", message: "x" });
    expect(kind).toContain("Choose what kind of feedback this is.");
    expect(kind).toContain('id="feedback-kind-error"');
    const empty = form("/", { error: "message_required", kind: "idea" });
    expect(empty).toContain("Write a message.");
    expect(empty).toContain('aria-invalid="true"');
    const long = form("/", { error: "message_too_long", kind: "idea", message: "a" });
    expect(long).toContain("That message is longer than 4,000 characters. Shorten it.");
  });

  it("says when too many were sent in the hour, and keeps the message", () => {
    const html = form("/", { error: "rate_limited", kind: "idea", message: "again" });
    expect(html).toContain("You can send 10 messages an hour. Try again later.");
    expect(html).toContain("again");
  });

  it("thanks the sender: Done closes the dialog, the page links back to Home", () => {
    const thanks = "Thanks, your feedback was sent to this instance’s administrators.";
    const dialog = form("/", { done: true }, true);
    expect(dialog).toContain(thanks);
    expect(dialog).toContain(">Done<");
    expect(dialog).not.toContain("<textarea");
    const page = form("/", { done: true });
    expect(page).toContain(thanks);
    expect(page).toContain('href="/"');
  });

  it("has Cancel in the dialog and not on the page", () => {
    expect(form("/", {}, true)).toContain(">Cancel<");
    expect(form("/")).not.toContain(">Cancel<");
  });

  it("is a plain form post, which works without JavaScript", () => {
    expect(form()).toMatch(/<form[^>]*action=/);
  });
});

describe("the dialog", () => {
  it("is titled, and holds no form until it is opened", () => {
    const closed = view(<FeedbackDialog open={false} onClose={() => undefined} page="/" />);
    expect(closed).toContain("Send feedback");
    expect(closed).not.toContain("<textarea");
    const open = view(<FeedbackDialog open onClose={() => undefined} page="/" />);
    expect(open).toContain("<textarea");
    expect(open).toContain("They read it in Admin");
  });
});

describe("the dialog on a small screen", () => {
  it("is the shared dialog, which fills the screen below sm", () => {
    const open = view(<FeedbackDialog open onClose={() => undefined} page="/" />);
    for (const rule of ["max-sm:h-dvh", "max-sm:w-screen", "max-sm:rounded-none"])
      expect(open).toContain(rule);
  });
});

describe("feedbackHref", () => {
  it("carries the path and never the query", () => {
    expect(feedbackHref("/catalogue")).toBe("/feedback?from=%2Fcatalogue");
    expect(feedbackHref("/catalogue?q=secret#x")).toBe("/feedback?from=%2Fcatalogue");
    expect(feedbackHref("/feedback")).toBe("/feedback");
  });
});
