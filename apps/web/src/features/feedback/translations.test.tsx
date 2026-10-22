import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import type { FeedbackFormState } from "./types";

vi.mock("./actions", () => ({ sendFeedbackFromForm: vi.fn() }));
const { FeedbackForm } = await import("./FeedbackForm");

/** The Send feedback form in Portuguese and French (feature 127). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));
const form = (locale: Locale, initial: FeedbackFormState = {}) =>
  view(locale, <FeedbackForm page="/catalogue" initial={initial} onDone={() => undefined} />);

describe("Send feedback in Portuguese and French", () => {
  it("says the kinds, the fields and the buttons in each language", () => {
    const pt = form("pt");
    for (const text of [
      ">Problema<",
      ">Ideia<",
      ">Dúvida<",
      ">Elogio<",
      "Que tipo de feedback é este?",
      ">Mensagem<",
      "0/4.000 caracteres",
      "Incluir a página em que estou",
      ">Enviar feedback<",
      ">Cancelar<",
    ])
      expect(pt, text).toContain(text);
    const fr = form("fr");
    expect(fr).toMatch(/0\/4\W000 caractères/);
    for (const text of [
      ">Problème<",
      ">Idée<",
      ">Question<",
      ">Félicitations<",
      "De quel type de commentaire s’agit-il?",
      "Inclure la page où je me trouve",
      ">Envoyer les commentaires<",
      ">Annuler<",
    ])
      expect(fr, text).toContain(text);
  });

  it("says the refusals and the thanks in each language", () => {
    expect(form("pt", { error: "message_required" })).toContain("Escreva uma mensagem.");
    expect(form("pt", { error: "kind_required" })).toContain("Escolha o tipo de feedback.");
    expect(form("pt", { error: "message_too_long" })).toContain("mais de 4.000 caracteres");
    expect(form("pt", { error: "rate_limited" })).toContain("10 mensagens por hora");
    expect(form("pt", { done: true })).toContain(
      "Obrigado, seu feedback foi enviado aos administradores desta instância.",
    );
    expect(form("fr", { error: "message_required" })).toContain("Écrivez un message.");
    expect(form("fr", { error: "rate_limited" })).toContain("10 messages par heure");
    expect(form("fr", { done: true })).toContain(
      "Merci, vos commentaires ont été envoyés aux administrateurs de cette instance.",
    );
  });
});

describe("no English left behind (127)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: none of the English texts appears`, async () => {
      const html = [
        form(locale),
        form(locale, { error: "message_required", kind: "idea" }),
        form(locale, { done: true }),
      ].join("\n");
      expect(await englishLeaks(["feedback"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["feedback"], locale, html)).toBeGreaterThan(5);
    });
  }
});
