import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, type AuditEvent } from "@/server/domains/audit/models/audit-event";
import enAdmin from "../../../messages/en/admin.json";
import frAdmin from "../../../messages/fr/admin.json";
import ptAdmin from "../../../messages/pt/admin.json";
import { RICH } from "./sentences.fixtures";
import { type Say, summarize, summaryText } from "./summary";

// The audit sentences in three languages (feature 132, task 6).
type L = "en" | "pt" | "fr";
const FILES = { en: enAdmin, pt: ptAdmin, fr: frAdmin };
const say = (locale: L) =>
  createTranslator({
    locale,
    messages: { admin: FILES[locale] },
    namespace: "admin.audit.sentences",
  } as never) as unknown as Say;

const event = (action: string, metadata: AuditEvent["metadata"] = {}, extra = {}): AuditEvent => ({
  id: "01K6BZ3W1D8J9Q2R4T6V8X0Y31",
  actorId: null,
  actorEmail: null,
  action,
  targetType: "user",
  targetId: "01K6BZ3W1D8J9Q2R4T6V8X0Y30",
  targetEmail: "sam@example.com",
  metadata,
  ipAddress: null,
  createdAt: new Date("2026-10-02T12:00:00Z"),
  ...extra,
});
const line = (locale: L, action: string, metadata: AuditEvent["metadata"] = {}, extra = {}) =>
  summaryText(summarize(event(action, metadata, extra), say(locale)));

describe("every audit action has a sentence in each language (132)", () => {
  for (const locale of ["en", "pt", "fr"] as const) {
    it(`${locale}: each action reads as a sentence, from nothing recorded and from everything`, () => {
      for (const action of AUDIT_ACTIONS) {
        for (const metadata of [{}, RICH]) {
          const text = line(locale, action, metadata);
          expect(text, `${action}`).not.toContain(`${action} (`);
          expect(text, `${action}`).not.toMatch(/[{}<>]|undefined/);
          expect(text.length, action).toBeGreaterThan(3);
        }
      }
    });
  }

  it("pt and fr never fall back to the English sentence", () => {
    for (const locale of ["pt", "fr"] as const)
      for (const action of AUDIT_ACTIONS)
        expect(line(locale, action, RICH), `${locale} ${action}`).not.toBe(
          line("en", action, RICH),
        );
  });
});

describe("audit sentences in Portuguese and French (132)", () => {
  it("reads a few events in the language", () => {
    expect(line("pt", "auth.signed_in", { remember: true })).toBe(
      "Entrou (sessão lembrada por 30 dias)",
    );
    expect(line("fr", "auth.signed_in", { remember: true })).toBe(
      "Connexion (mémorisée pendant 30 jours)",
    );
    expect(line("pt", "user.disabled", { sessionsEnded: 2, tokensRevoked: 1 })).toBe(
      "Desativou sam@example.com (2 sessões encerradas, 1 token revogado)",
    );
    expect(line("fr", "user.disabled", { sessionsEnded: 2, tokensRevoked: 1 })).toBe(
      "A désactivé sam@example.com (2 sessions terminées, 1 jeton révoqué)",
    );
    expect(line("pt", "auth.sign_in_failed", { email: "a@b.c", reason: "invalid" })).toBe(
      "Falha de login de a@b.c: e-mail ou senha incorretos",
    );
    expect(line("fr", "auth.sign_in_failed", { email: "a@b.c", reason: "invalid" })).toBe(
      "Échec de connexion pour a@b.c : courriel ou mot de passe incorrect",
    );
    expect(line("pt", "user.role_changed", { from: "user", to: "moderator" })).toBe(
      "Alterou sam@example.com de usuário para moderador",
    );
  });

  it("marks names and codes for the page to style, in every language", () => {
    for (const locale of ["en", "pt", "fr"] as const) {
      const parts = summarize(
        event("version.published", { name: "@t/x", version: "1.0.0", tag: "latest" }),
        say(locale),
      );
      expect(parts, locale).toContainEqual({ name: "@t/x@1.0.0" });
      expect(parts, locale).toContainEqual({ code: "latest" });
    }
  });

  it("counts 0, 1 and 2 by each language's plural rule", () => {
    const sessions = (locale: L, n: number) =>
      line(locale, "instance.access_revoked", { scope: "everyone", sessionsEnded: n });
    expect(sessions("en", 1)).toContain("(1 session ended)");
    expect(sessions("en", 2)).toContain("(2 sessions ended)");
    expect(sessions("pt", 1)).toContain("(1 sessão encerrada)");
    expect(sessions("pt", 2)).toContain("(2 sessões encerradas)");
    expect(sessions("fr", 1)).toContain("(1 session terminée)");
    expect(sessions("fr", 2)).toContain("(2 sessions terminées)");
    // With nothing ended, each says there was nothing left.
    expect(sessions("en", 0)).toContain("(nothing left)");
    expect(sessions("pt", 0)).toContain("(nada restava)");
    expect(sessions("fr", 0)).toContain("(plus rien)");
    const conflicts = (locale: L, n: number) =>
      line(locale, "submission.rebased", { conflicts: n });
    expect(conflicts("pt", 0)).not.toContain("conflito");
    expect(conflicts("pt", 1)).toContain("(1 conflito)");
    expect(conflicts("pt", 2)).toContain("(2 conflitos)");
    expect(conflicts("fr", 2)).toContain("(2 conflits)");
  });

  it("shows recorded names and codes as typed, even when they look like placeholders", () => {
    for (const locale of ["en", "pt", "fr"] as const) {
      const text = line(locale, "submission.approved", { name: "{count} <b>x</b>" });
      expect(text, locale).toContain("{count} <b>x</b>");
    }
  });

  it("tells an accepted risk from a false positive (137)", () => {
    const mark = { name: "@team/tools", rule: "P2" };
    expect(line("en", "scan.finding_dismissed", { ...mark, kind: "accepted" })).toBe(
      "Accepted the risk of the finding P2 of @team/tools",
    );
    // Marks made before 0040 have no kind: they were false positives.
    expect(line("en", "scan.finding_dismissed", mark)).toBe(
      "Marked the finding P2 of @team/tools a false positive",
    );
    expect(line("pt", "scan.finding_dismissed", { ...mark, kind: "accepted" })).toContain(
      "Aceitou o risco",
    );
  });

  it("keeps an unknown reason or code as recorded, and an unknown action as its name", () => {
    for (const locale of ["pt", "fr"] as const) {
      expect(
        line(locale, "auth.sign_in_failed", { email: "a@b.c", reason: "__proto__" }),
      ).toContain("__proto__");
      expect(line(locale, "user.archived")).toBe("user.archived (user)");
    }
  });
});

describe("the English sentences are what they always were (132)", () => {
  // `english-sentences.fixture.json` is the output of the code before the sentences became
  // messages (feature 060's summary.ts), for every action, from an empty event and from `RICH`.
  // Two differences are deliberate: typographic apostrophes, and numbers grouped by the language.
  it("reads every action as it did, from nothing recorded and from everything", async () => {
    const fixture = (await import("./english-sentences.fixture.json")).default as Record<
      string,
      { empty: string; rich: string }
    >;
    expect(Object.keys(fixture).sort()).toEqual([...AUDIT_ACTIONS].sort());
    for (const action of AUDIT_ACTIONS) {
      expect(line("en", action, {}), `${action} from nothing`).toBe(fixture[action]?.empty);
      expect(line("en", action, RICH), `${action} from everything`).toBe(fixture[action]?.rich);
    }
  });
});
