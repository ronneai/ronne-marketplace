"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputClasses, Label } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { Notice } from "@/components/ui/Notice";
import { Table, Td, Th } from "@/components/ui/Table";
import { useToastWhen } from "@/components/ui/toast";
import type { AccountRules } from "@/server/domains/settings/models/account-rules";
import { saveAccountRules } from "./actions";
import type { WayIn } from "./overview";
import type { AccountRulesFormState } from "./types";

/** The overview's cell for an on or off setting. */
const Flag = ({ on, yes, no }: { on: boolean; yes: string; no: string }) => (
  <Badge tone={on ? "accent" : "muted"}>{on ? yes : no}</Badge>
);

/**
 * Admin › Settings › Authentication › Who may create accounts (191): the instance's block list of
 * email domains, which every way in obeys and which always wins, the throwaway setting for every
 * way in with *Any domain*, and an overview of each way in (email sign-up, then each identity
 * provider), with a link to where its own settings are. The form carries the version it was
 * opened with, so a save over someone else's is refused as stale.
 */
export const AccountRulesPanel = ({
  rules,
  ways,
  initial = {},
}: {
  rules: AccountRules;
  ways: readonly WayIn[];
  initial?: AccountRulesFormState;
}) => {
  const t = useTranslations("admin.settings.accountRules");
  const { state, action, pending, onSubmit } = useKeptActionState(saveAccountRules, initial);
  const fresh = state !== initial;
  useToastWhen(state, fresh && state.done ? t(`done.${state.done}`) : null);
  const [throwaway, setThrowaway] = useState(rules.blockThrowaway);
  const domains = (way: WayIn) =>
    way.domains === "any"
      ? t("anyDomain")
      : way.domains.length === 0
        ? t("noDomains")
        : way.domains.join(", ");
  const name = (way: WayIn) => (way.kind === "sign_up" ? t("signUp") : way.name);
  return (
    <section aria-labelledby="who-may-create-accounts-title" className="grid gap-5">
      <div className="grid gap-1">
        <h2 id="who-may-create-accounts-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      {rules.damaged ? (
        <Notice kind="error" title={t("damaged.title")}>
          {t("damaged.body")}
        </Notice>
      ) : null}

      <form
        action={action}
        onSubmit={onSubmit}
        aria-label={t("formLabel")}
        className="grid gap-4"
        noValidate
      >
        <input type="hidden" name="version" value={String(rules.version)} />
        <div className="grid gap-1">
          <Label htmlFor="blocked-domains">{t("blockedLabel")}</Label>
          <textarea
            id="blocked-domains"
            name="blockedDomains"
            rows={4}
            defaultValue={rules.blockedDomains.join("\n")}
            aria-invalid={(fresh && state.error && !state.stale) || undefined}
            aria-describedby="blocked-domains-hint"
            spellCheck={false}
            className={`${inputClasses} font-mono`}
          />
          <p id="blocked-domains-hint" className="text-xs text-muted">
            {t("blockedHint")}
          </p>
        </div>
        <label htmlFor="block-throwaway" className="flex items-start gap-2 text-sm text-fg">
          <input
            id="block-throwaway"
            name="blockThrowaway"
            type="checkbox"
            checked={throwaway}
            onChange={(event) => setThrowaway(event.target.checked)}
            className="mt-0.5 size-4 accent-(--accent)"
          />
          <span className="grid gap-0.5">
            <span>{t("throwaway")}</span>
            <span className="text-xs text-muted">{t("throwawayHint")}</span>
          </span>
        </label>
        {fresh && state.error ? (
          <Notice kind="error" title={state.error}>
            {state.stale ? t("staleHint") : null}
          </Notice>
        ) : null}
        <div>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-fg">{t("overviewTitle")}</h3>
        <Table>
          <thead>
            <tr>
              <Th>{t("columns.way")}</Th>
              <Th>{t("columns.on")}</Th>
              <Th>{t("columns.creates")}</Th>
              <Th>{t("columns.domains")}</Th>
              <Th>{t("columns.approval")}</Th>
              <Th>{t("columns.link")}</Th>
            </tr>
          </thead>
          <tbody>
            {ways.map((way) => (
              <tr key={`${way.kind}:${way.id}`}>
                <Td className="font-semibold">
                  {way.kind === "sign_up" ? (
                    <a href={way.href} className="text-link hover:underline">
                      {name(way)}
                    </a>
                  ) : (
                    <Link href={way.href} className="text-link hover:underline">
                      {name(way)}
                    </Link>
                  )}
                </Td>
                <Td>
                  <Flag on={way.on} yes={t("yes")} no={t("no")} />
                </Td>
                <Td>
                  <Flag on={way.createsAccounts} yes={t("yes")} no={t("no")} />
                </Td>
                <Td className="text-muted">{way.createsAccounts ? domains(way) : "–"}</Td>
                <Td>
                  {way.createsAccounts ? (
                    <Flag on={way.approval} yes={t("yes")} no={t("no")} />
                  ) : (
                    "–"
                  )}
                </Td>
                <Td>
                  {way.linkByEmail === null ? (
                    "–"
                  ) : (
                    <Flag on={way.linkByEmail} yes={t("yes")} no={t("no")} />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {ways.flatMap((way) => [
          ...way.blockedListed.map((domain) => (
            <Notice
              key={`${way.id}:${domain}`}
              kind="warn"
              title={t("warnings.blocked", { domain, way: name(way) })}
            />
          )),
          ...(way.approvalWithoutMail
            ? [
                <Notice
                  key={`${way.id}:mail`}
                  kind="warn"
                  title={t("warnings.approvalWithoutMail", { way: name(way) })}
                />,
              ]
            : []),
        ])}
      </div>
    </section>
  );
};
