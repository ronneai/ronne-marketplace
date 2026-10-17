import { buttonClasses } from "@/components/ui/Button";
import { ssoFromForm } from "./actions";

/**
 * "Continue with <provider>" for each identity provider that's on (106): each a small form that
 * posts to the start action, so it works without JavaScript. 44px tall on a touch screen.
 */
export const ProviderButtons = ({
  providers,
  next,
}: {
  providers: readonly { id: string; name: string }[];
  next: string;
}) => (
  <div className="grid gap-2">
    {providers.map((provider) => (
      <form key={provider.id} action={ssoFromForm}>
        <input type="hidden" name="provider" value={provider.id} />
        <input type="hidden" name="next" value={next} />
        <button type="submit" className={`${buttonClasses("secondary")} w-full`}>
          Continue with {provider.name}
        </button>
      </form>
    ))}
  </div>
);
