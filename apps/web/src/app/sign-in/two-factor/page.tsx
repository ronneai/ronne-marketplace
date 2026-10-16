import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Panel } from "@/components/ui/Panel";
import { TwoFactorStep } from "@/features/sign-in/TwoFactorStep";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Two-factor sign-in · Ronne AI Marketplace" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The second step at sign-in (feature 105), after a right password for an account with two-factor
 * on. Public, like `/sign-in`: there's no session yet, only the challenge's cookie.
 */
const TwoFactorSignIn = async ({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    method?: string | string[];
  }>;
}) => {
  const params = await searchParams;
  const next = safeNextPath(one(params.next));
  if (await getCurrentUser(await requestHeaders())) redirect(next);
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-4 py-12">
      <Panel padding="lg" className="grid gap-6">
        <div className="grid gap-3">
          <BrandLogo height={40} className="text-fg" />
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
              Two-factor sign-in
            </h1>
            <p className="text-sm text-muted">
              Your password was right. Now the code from your phone.
            </p>
          </div>
        </div>
        <TwoFactorStep
          next={next}
          method={one(params.method) === "backup" ? "backup_code" : "totp"}
        />
        <p className="text-xs text-muted">
          Lost your phone? Use a backup code, or ask a root administrator to reset your two-factor
          sign-in.{" "}
          <a href="/sign-in" className="text-link underline-offset-2 hover:underline">
            Start again
          </a>
        </p>
      </Panel>
    </main>
  );
};

export default TwoFactorSignIn;
