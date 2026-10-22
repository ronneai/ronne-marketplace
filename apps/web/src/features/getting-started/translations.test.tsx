import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import {
  type GettingStarted,
  gettingStartedOf,
} from "@/server/domains/onboarding/models/getting-started";
import { NO_ONBOARDING } from "@/server/domains/onboarding/models/onboarding";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({
  confirmInstallFromForm: vi.fn(),
  hideGettingStartedFromForm: vi.fn(),
  showGettingStartedFromForm: vi.fn(),
}));
const { GettingStartedPanel } = await import("./GettingStartedPanel");
const { ShowAgainSection } = await import("./ShowAgainSection");

/** Home's checklist and Account's button in Portuguese and French (feature 126). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));
const AT = new Date("2026-10-21T10:00:00Z");
const state = (hasToken: boolean, installed: boolean): GettingStarted =>
  gettingStartedOf(
    { hasToken, connected: hasToken, hasSubmission: false },
    { ...NO_ONBOARDING, ...(installed ? { installConfirmedAt: AT } : {}) },
  );

describe("the checklist in Portuguese and French", () => {
  it("says the steps, the progress and the buttons in each language", () => {
    const pt = view("pt", <GettingStartedPanel state={state(true, false)} noScope />);
    for (const text of [
      ">Primeiros passos<",
      "2 de 4 concluídos",
      'aria-label="Ocultar Primeiros passos"',
      ">Já instalei um<",
      ">Opcional<",
      "Próximo: Instale o seu primeiro item",
      ">Ver todos os passos<",
      ">2/4<",
      ">Concluído<",
      "Este registro ainda não tem escopo.",
    ])
      expect(pt, text).toContain(text);
    const fr = view("fr", <GettingStartedPanel state={state(true, false)} noScope />);
    for (const text of [
      ">Pour commencer<",
      "2 sur 4 terminées",
      'aria-label="Masquer Pour commencer"',
      ">J’en ai installé un<",
      ">Facultative<",
      "Ensuite : Installez votre premier élément",
      ">Voir toutes les étapes<",
      ">Terminée<",
      "Ce registre n’a pas encore de portée.",
    ])
      expect(fr, text).toContain(text);
  });

  it("says 'You’re set up' in each language", () => {
    expect(view("pt", <GettingStartedPanel state={state(true, true)} />)).toContain(
      ">Tudo pronto<",
    );
    expect(view("fr", <GettingStartedPanel state={state(true, true)} />)).toContain(
      ">Tout est prêt<",
    );
  });
});

describe("no English left behind (126)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: none of the English texts appears`, async () => {
      const html = [
        view(locale, <GettingStartedPanel state={state(false, false)} noScope />),
        view(locale, <GettingStartedPanel state={state(true, true)} />),
        view(locale, <ShowAgainSection />),
      ].join("\n");
      expect(await englishLeaks(["home", "account"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["home", "account"], locale, html)).toBeGreaterThan(10);
    });
  }
});

describe("the banner's other next steps, in each language", () => {
  it("says Show the commands while the next step is connecting rmk", () => {
    const connect = gettingStartedOf(
      { hasToken: true, connected: false, hasSubmission: false },
      NO_ONBOARDING,
    );
    expect(view("pt", <GettingStartedPanel state={connect} />)).toContain(">Mostrar os comandos<");
    expect(view("fr", <GettingStartedPanel state={connect} />)).toContain(
      ">Afficher les commandes<",
    );
  });
});
