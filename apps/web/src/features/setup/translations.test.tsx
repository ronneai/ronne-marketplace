import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

// The form's server actions aren't rendered here; the form only needs their references.
vi.mock("./actions", () => ({
  installAll: async () => ({}),
  installSettings: vi.fn(),
  installMigrations: vi.fn(),
  installRoot: vi.fn(),
  testDatabase: vi.fn(),
}));

const { DatabaseUnavailable } = await import("./DatabaseUnavailable");
const { SetupPage } = await import("./SetupPage");
const { StepList } = await import("./StepList");
const { AlreadySetUp, Notices } = await import("./SetupForm");
const { SectionError } = await import("./fields");
const { useSay } = await import("./say");
const { DEFAULT_VALUES, PENDING_STEPS } = await import("./types");

import type { Say } from "./types";

const { readDatabaseAnswers } = await import("./form");

type L = "en" | "pt" | "fr";
const NS = ["admin", "common"];
const render = (node: ReactElement, locale: L) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const page = (extra = {}) => ({
  state: "not_configured" as const,
  runtime: "node" as const,
  envFile: "/srv/ronne/apps/web/.env",
  publicUrlFromEnvironment: false,
  initial: DEFAULT_VALUES,
  ...extra,
});
const setup = (locale: L, extra = {}) => render(<SetupPage page={page(extra)} />, locale);

/** Every message the install and the form can answer with, as the server writes them. */
const SAYS: Say[] = [
  { key: "errors.already_set_up" },
  { key: "errors.database_unavailable" },
  { key: "errors.not_configured" },
  { key: "errors.public_url_rule" },
  { key: "errors.path_required" },
  { key: "errors.host_required" },
  { key: "errors.port_invalid" },
  { key: "errors.database_required" },
  { key: "errors.user_required" },
  { key: "errors.passwords_mismatch" },
  { key: "errors.weak_secret" },
  { key: "errors.restart_needed" },
  {
    key: "errors.settings_unwritable",
    values: { path: "/x/.env", reason: "EACCES", docker: true },
  },
  {
    key: "errors.settings_unwritable",
    values: { path: "/x/.env", reason: "EACCES", docker: false },
  },
  { key: "errors.migration_failed", values: { database: "postgres://u:***@h/db", reason: "boom" } },
  { key: "detail.settings", values: { path: "/x/.env" } },
  { key: "detail.upToDate" },
  { key: "detail.migrations", values: { count: 1 } },
  { key: "detail.migrations", values: { count: 36 } },
  { key: "detail.root", values: { email: "a@b.c" } },
];
const Says = () => {
  const say = useSay();
  return (
    <ul>
      {SAYS.map((entry, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
        <li key={i}>{say(entry, "ENGLISH")}</li>
      ))}
    </ul>
  );
};

const everything = (locale: L) =>
  [
    setup(locale),
    setup(locale, { state: "incomplete", currentDatabase: "postgres://ronne:***@db:5432/ronne" }),
    setup(locale, { runtime: "docker", publicUrlFromEnvironment: true }),
    setup(locale, { runtime: "npm", localUrl: "http://localhost:7650" }),
    render(<DatabaseUnavailable database="postgres://ronne:***@db/ronne" />, locale),
    render(
      <StepList
        steps={{
          ...PENDING_STEPS,
          settings: { status: "done", detail: "x", say: { key: "detail.upToDate" } },
          migrations: { status: "running" },
          root: { status: "failed", detail: "boom" },
        }}
      />,
      locale,
    ),
    render(<Says />, locale),
    render(
      <AlreadySetUp
        error={{
          code: "already_set_up",
          section: "root",
          message: "Someone",
          say: { key: "errors.already_set_up" },
        }}
      />,
      locale,
    ),
    render(
      <Notices
        notices={[{ text: "x", say: { key: "errors.weak_secret" } }, { text: "from the check" }]}
      />,
      locale,
    ),
    render(
      <SectionError
        section="database"
        error={{
          code: "database",
          section: "database",
          message: "Couldn't reach it",
          detail: "ECONNREFUSED",
        }}
      />,
      locale,
    ),
  ].join("\n");

describe("the setup wizard in three languages (132)", () => {
  it("the page, the questions and the install button read in each language", () => {
    const cases: Record<L, string[]> = {
      en: [
        "Set up Ronne AI Marketplace",
        "Which database?",
        "Root account",
        "Password again",
        ">Install<",
      ],
      pt: [
        "Configurar o Ronne AI Marketplace",
        "Qual banco de dados?",
        "Conta root",
        "Senha de novo",
        ">Instalar<",
      ],
      fr: [
        "Configurer Ronne AI Marketplace",
        "Quelle base de données?",
        "Compte root",
        "Mot de passe de nouveau",
        ">Installer<",
      ],
    };
    for (const [locale, texts] of Object.entries(cases) as [L, string[]][]) {
      const html = setup(locale);
      for (const text of texts) expect(html, `${locale}: ${text}`).toContain(text);
    }
  });

  it("says whether the setup is new or was interrupted, and where the path and the address come from", () => {
    expect(setup("pt")).toContain("ainda não foi configurada");
    expect(setup("pt", { state: "incomplete" })).toContain("não terminou");
    expect(setup("fr", { state: "incomplete" })).toContain("n’a pas abouti");
    expect(setup("pt", { runtime: "docker" })).toContain("dentro do volume ronne-data");
    expect(setup("fr", { runtime: "npm" })).toContain("dossier de données de rmk-server");
    expect(setup("pt", { runtime: "docker", publicUrlFromEnvironment: true })).toContain(
      "Definido por RONNE_DOMAIN",
    );
    expect(setup("fr", { localUrl: "http://localhost:7650" })).toContain("http://localhost:7650");
  });

  it("the unavailable-database panel and the install steps read in each language", () => {
    const panel = (locale: L) =>
      render(<DatabaseUnavailable database="postgres://r:***@db/r" />, locale);
    expect(panel("pt")).toContain("O banco de dados não está respondendo");
    expect(panel("fr")).toContain("La base de données ne répond pas");
    expect(panel("pt")).toContain("postgres://r:***@db/r");
    const steps = (locale: L) =>
      render(
        <StepList
          steps={{
            ...PENDING_STEPS,
            settings: { status: "done" },
            migrations: { status: "running" },
          }}
        />,
        locale,
      );
    expect(steps("en")).toContain("Settings written");
    expect(steps("pt")).toContain("Configurações gravadas");
    expect(steps("pt")).toContain("(concluída)");
    expect(steps("fr")).toContain("Migrations appliquées");
    expect(steps("fr")).toContain("(en cours)");
  });

  it("every message the server can answer with has words in each language", () => {
    for (const locale of ["en", "pt", "fr"] as const) {
      const html = render(<Says />, locale);
      expect(html, locale).not.toContain("ENGLISH");
    }
    expect(render(<Says />, "pt")).toContain("Migrações aplicadas (36)");
    expect(render(<Says />, "fr")).toContain("Migrations appliquées (36)");
    expect(render(<Says />, "pt")).toContain("No Docker, o volume de dados pertence ao root");
    expect(render(<Says />, "fr")).toContain("Dans Docker, le volume de données appartient à root");
  });

  it("a message with no words, or no key, is shown as the server wrote it", () => {
    const Probe = ({ say }: { say?: { key: string } }) => <p>{useSay()(say, "As written")}</p>;
    for (const locale of ["pt", "fr"] as const) {
      expect(render(<Probe />, locale)).toContain("As written");
      expect(render(<Probe say={{ key: "errors.nope" }} />, locale)).toContain("As written");
      expect(render(<Probe say={{ key: "errors.__proto__" }} />, locale)).toContain("As written");
      // A group of messages, and a message missing its values, are not a sentence either.
      for (const key of ["errors", "detail", "page", "errors.settings_unwritable"])
        expect(render(<Probe say={{ key }} />, locale), key).toContain("As written");
    }
  });

  it("the form's own checks answer with a key of the messages", () => {
    const form = (fields: Record<string, string>) => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      return data;
    };
    const keyOf = (fields: Record<string, string>) => {
      const answers = readDatabaseAnswers(form(fields));
      return answers.ok ? null : answers.error.say?.key;
    };
    expect(keyOf({ "database.kind": "sqlite", "database.path": "" })).toBe("errors.path_required");
    expect(keyOf({ "database.kind": "postgres", "database.host": "" })).toBe(
      "errors.host_required",
    );
    expect(keyOf({ "database.kind": "postgres", "database.host": "h", "database.port": "x" })).toBe(
      "errors.port_invalid",
    );
    expect(
      keyOf({
        "database.kind": "postgres",
        "database.host": "h",
        "database.port": "1",
        "database.name": "",
      }),
    ).toBe("errors.database_required");
    expect(
      keyOf({
        "database.kind": "postgres",
        "database.host": "h",
        "database.port": "1",
        "database.name": "n",
        "database.user": "",
      }),
    ).toBe("errors.user_required");
  });

  it("the plural count of applied migrations follows each language", () => {
    const Count = ({ n }: { n: number }) => (
      <p>{useTranslations("admin.setup.detail")("migrations", { count: n })}</p>
    );
    expect(render(<Count n={1000} />, "en")).toContain("(1,000)");
    expect(render(<Count n={1000} />, "pt")).toContain("(1.000)");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: every state leaves no English behind`, async () => {
      // The tips beside the questions are messages of the wizard, so they are scanned too; a
      // database check's own explanation stays as the server wrote it.
      const html = everything(locale);
      expect(await englishLeaks(NS, locale, html)).toEqual([]);
      expect(await ownTextsShown(["admin"], locale, html)).toBeGreaterThan(30);
    });
  }
});
