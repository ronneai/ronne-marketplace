import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th } from "@/components/ui/Table";

/** One way to sign in, as the panel lists it (122; 105 and 106 add theirs). */
export type SignInMethod = { name: string; on: boolean; note: string };

/** Admin › Settings › Authentication › Sign-in methods (122): read-only, for now. */
export const SignInMethodsPanel = ({ methods }: { methods: readonly SignInMethod[] }) => {
  const t = useTranslations("admin.settings.methods");
  return (
    <section aria-labelledby="sign-in-methods-title" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sign-in-methods-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <Help id="auth-methods" />
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      <Table>
        <thead>
          <tr>
            <Th>{t("columns.method")}</Th>
            <Th>{t("columns.state")}</Th>
            <Th>{t("columns.note")}</Th>
          </tr>
        </thead>
        <tbody>
          {methods.map((method) => (
            <tr key={method.name}>
              <Td className="font-semibold">{method.name}</Td>
              <Td>
                <Badge tone={method.on ? "accent" : "muted"}>
                  {method.on ? t("on") : t("off")}
                </Badge>
              </Td>
              <Td className="text-muted">{method.note}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
};
