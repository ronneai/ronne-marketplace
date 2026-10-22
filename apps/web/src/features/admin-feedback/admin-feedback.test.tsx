import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import type { FeedbackEntry } from "@/server/domains/feedback/models/feedback";
import { inLocale } from "@/test/intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ markHandledAction: vi.fn(), deleteFeedbackAction: vi.fn() }));
const { FeedbackInbox } = await import("./FeedbackInbox");
const { checkedFeedbackState, FEEDBACK_LIST, feedbackQueryOf } = await import("./list");

const entry = (id: string, extra: Partial<FeedbackEntry> = {}): FeedbackEntry => ({
  id,
  kind: "idea",
  message: "Dark mode, please",
  page: "/catalogue",
  version: "1.2.3",
  status: "new",
  createdAt: new Date("2026-10-22T10:00:00Z"),
  handledAt: null,
  handledBy: null,
  sender: { id: "u1", name: "Uma", email: "uma@example.com" },
  ...extra,
});

const state = (params: Record<string, string> = {}) =>
  checkedFeedbackState(parseListQuery(FEEDBACK_LIST, params));
const view = (
  entries: FeedbackEntry[],
  params: Record<string, string> = {},
  locale: "en" | "pt" | "fr" = "en",
  node?: (el: ReactElement) => ReactElement,
) => {
  const el = (
    <FeedbackInbox
      state={state(params)}
      entries={entries}
      page={{ next: null, previous: null }}
      total={{ count: entries.length, capped: false }}
    />
  );
  return inLocale(locale, () => renderToStaticMarkup(node ? node(el) : el));
};

describe("the feedback list's state (127)", () => {
  it("sorts newest first, and reads a kind, a status and a search from the address", () => {
    const s = state({ kind: "idea", status: "handled", q: "dark" });
    expect(s.sort).toBe("created");
    expect(s.dir).toBe("desc");
    expect(feedbackQueryOf(s)).toMatchObject({
      sort: "created",
      dir: "desc",
      search: "dark",
      kind: "idea",
      status: "handled",
    });
  });

  it("drops a kind or status it doesn't know", () => {
    const s = state({ kind: "bug", status: "closed" });
    expect(s.filters).toMatchObject({ kind: "", status: "" });
    expect(feedbackQueryOf(s)).toMatchObject({ kind: undefined, status: undefined });
    expect(parseListQuery(FEEDBACK_LIST, { sort: "message" }).sort).toBe("created");
  });
});

describe("Admin › Feedback (127)", () => {
  it("lists the sender, kind, message, page, version, status and time", () => {
    const html = view([
      entry("A1"),
      entry("A2", { kind: "praise", page: null, status: "handled" }),
    ]);
    for (const text of [
      "Feedback",
      "Uma",
      "uma@example.com",
      "Idea",
      "Praise",
      "Dark mode, please",
      "/catalogue",
      "1.2.3",
      "New",
      "Handled",
      "2 messages",
    ])
      expect(html, text).toContain(text);
    expect(html).toMatch(/aria-label="Select the message from Uma"/);
    expect(html).toMatch(/aria-label="Open the message from Uma"/);
  });

  it("shows a message as text, never as HTML", () => {
    const html = view([entry("A1", { message: '<img src=x onerror="alert(1)"><b>hi</b>' })]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>hi");
    expect(html).toContain("&lt;img src=x");
  });

  it("has the bulk bar with nothing selected, and the filters", () => {
    const html = view([entry("A1")]);
    expect(html).toContain("None selected");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark handled</);
    expect(html).toContain("Select all on this page");
    expect(html).toContain("Any kind");
    expect(html).toContain("Any status");
    expect(html).toContain("Message, name or email");
  });

  it("says when nobody has sent anything, and when the filters match nothing", () => {
    expect(view([])).toContain("Nobody has sent feedback yet.");
    expect(view([], { kind: "idea" })).toContain("No feedback matches these filters.");
  });

  it("shows the chosen filters as chips, and keeps them in the form", () => {
    const html = view([entry("A1")], { kind: "idea", status: "new", q: "dark" });
    expect(html).toMatch(/<option value="idea" selected/);
    expect(html).toMatch(/<option value="new" selected/);
    expect(html).toContain('value="dark"');
    expect(html).toContain('aria-label="Active filters"');
  });

  it("sorts by kind or by time from the headers", () => {
    const html = view([entry("A1")]);
    expect(html).toContain("sort=kind");
    expect(html).toContain("/admin/feedback");
  });
});

describe("Admin › Feedback in Portuguese and French", () => {
  it("says it in each language", () => {
    const pt = view([entry("A1")], {}, "pt");
    for (const text of [
      ">Feedback<",
      "De",
      "Ideia",
      "Nova",
      "Marcar como tratada",
      "Nenhuma selecionada",
      "Selecionar tudo nesta página",
      "1 mensagem",
    ])
      expect(pt, text).toContain(text);
    const fr = view([entry("A1")], {}, "fr");
    for (const text of [
      "Commentaires",
      "Idée",
      "Nouveau",
      "Marquer comme traité",
      "Aucun sélectionné",
      "Tout sélectionner sur cette page",
      "1 message",
    ])
      expect(fr, text).toContain(text);
  });
});
