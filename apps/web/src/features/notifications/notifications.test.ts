import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/server/domains/identity/models/locale";
import { NOTIFICATION_KINDS } from "@/server/domains/notifications/models/notification";
import type { NotificationView } from "@/server/domains/notifications/services/read";
import { notificationHref } from "./href";
import { renderSentence, sentenceValues } from "./sentence";

const messagesOf = async (locale: string) =>
  (await import(`../../../messages/${locale}/notifications.json`)).default;

// What each kind carries, as the write sites give it (139, task 3).
const PARAMS: Record<string, Record<string, string | number>> = {
  "submission.approved": { name: "@team/style", revision: 2 },
  "submission.approved_override": { name: "@team/style", revision: 2 },
  "submission.changes_requested": { name: "@team/style", revision: 2 },
  "submission.rejected": { name: "@team/style", revision: 2 },
  "submission.comment": { name: "@team/style", revision: 2 },
  "submission.released": { name: "@team/style", version: "1.2.0", tag: "latest" },
  "submission.dependency_rejected": { name: "@team/kit", revision: 1, dependency: "@team/style" },
  "join_request.approved": { workspace: "acme", role: "user" },
  "join_request.declined": { workspace: "acme" },
  "scope_move.moved": { scope: "tools", newName: "tools", from: "global", to: "acme" },
  "scope_move.declined": { scope: "tools", newName: "tools", from: "global", to: "acme" },
  "item_move.moved": { item: "lint", newName: "lint", from: "tools", to: "more" },
  "item_move.declined": { item: "lint", newName: "lint", from: "tools", to: "more" },
  "membership.added": { workspace: "acme", role: "moderator" },
  "membership.removed": { workspace: "acme" },
  "membership.role_changed": { workspace: "acme", from: "user", to: "admin" },
  "request.join_waiting": { workspace: "acme" },
  "request.scope_move_waiting": { scope: "tools", newName: "tools", from: "global", to: "acme" },
  "request.item_move_waiting": { item: "lint", newName: "lint", from: "tools", to: "more" },
  "feedback.new": { sender: "Uma", feedbackKind: "idea" },
};

const view = (
  kind: (typeof NOTIFICATION_KINDS)[number],
  actor: string | null,
): NotificationView => ({
  id: "n1",
  kind,
  params: PARAMS[kind] ?? {},
  actor: actor ? { id: "u1", name: actor } : null,
  subject: { type: "submission", id: "s1" },
  link: null,
  createdAt: new Date(),
  readAt: null,
});

describe("notification sentences (139)", () => {
  it("has a test case for every kind", () => {
    expect(Object.keys(PARAMS).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it.each(LOCALES)(
    "%s: every kind has a sentence that names who did it and what it is about",
    async (locale) => {
      const messages = await messagesOf(locale);
      const t = createTranslator({
        locale,
        messages,
        namespace: undefined as never,
      }) as unknown as (key: string, values: Record<string, string | number>) => string;
      for (const kind of NOTIFICATION_KINDS) {
        for (const actor of ["Bruno", null]) {
          const v = view(kind, actor);
          const text = t(kind, sentenceValues(v, t("system", {})));
          expect(text, `${locale} ${kind}`).not.toMatch(/[{}]/);
          expect(text.length).toBeGreaterThan(10);
          if (kind !== "feedback.new") expect(text).toContain(actor ?? t("system", {}));
          else expect(text).toContain("Uma");
        }
      }
    },
  );
});

describe("a sentence that can't be worded (139)", () => {
  it.each(LOCALES)("%s: shows the fallback, never a message path", async (locale) => {
    const messages = await messagesOf(locale);
    const t = createTranslator({ locale, messages, onError: () => undefined }) as unknown as (
      key: string,
      values: Record<string, string | number>,
    ) => string;
    // A parameter the message needs is missing from the row (an older or newer version wrote it).
    const broken = { ...view("membership.added", "Bruno"), params: { workspace: "acme" } };
    const text = renderSentence(t, broken, t("system", {}), t("fallback", {}));
    expect(text).toBe(t("fallback", {}));
    // A kind this version has no message for.
    const unknown = { ...view("feedback.new", null), kind: "from.the.future" as never };
    expect(renderSentence(t, unknown, "x", "FALLBACK")).toBe("FALLBACK");
  });
});

describe("notification links (139)", () => {
  it("builds each address from what the domain says", () => {
    expect(notificationHref({ to: "submission", id: "s 1" })).toBe("/submissions/s%201");
    expect(notificationHref({ to: "workspace", name: "acme" })).toBe("/workspaces/acme");
    expect(notificationHref({ to: "workspaces" })).toBe("/workspaces");
    expect(notificationHref({ to: "requests" })).toBe("/workspaces/requests");
    expect(notificationHref({ to: "feedback" })).toBe("/admin/feedback");
    expect(
      notificationHref({ to: "item", workspace: "global", scope: "tools", name: "lint" }),
    ).toBe("/items/tools/lint");
    expect(notificationHref({ to: "item", workspace: "acme", scope: "tools", name: "lint" })).toBe(
      "/workspaces/acme/items/tools/lint",
    );
  });
});
