import { KeyRound } from "lucide-react";

/**
 * The provider's own mark on its button (feature 157), chosen by the OIDC preset (106). The vendors'
 * marks keep their brand colours, as tokens (`--mark-*`) because the mark is theirs. A preset without a mark of its own (Okta, Keycloak…) gets a neutral key.
 */
export const ProviderIcon = ({ preset }: { preset: string }) => {
  if (preset === "entra") {
    return (
      <svg viewBox="0 0 21 21" className="size-4 shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" className="fill-(--mark-ms-red)" />
        <rect x="11" y="1" width="9" height="9" className="fill-(--mark-ms-green)" />
        <rect x="1" y="11" width="9" height="9" className="fill-(--mark-ms-blue)" />
        <rect x="11" y="11" width="9" height="9" className="fill-(--mark-ms-yellow)" />
      </svg>
    );
  }
  if (preset === "google") {
    return (
      <svg viewBox="0 0 48 48" className="size-4 shrink-0" aria-hidden="true">
        <path
          className="fill-(--mark-g-red)"
          d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"
        />
        <path
          className="fill-(--mark-g-blue)"
          d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
        />
        <path
          className="fill-(--mark-g-yellow)"
          d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
        />
        <path
          className="fill-(--mark-g-green)"
          d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
        />
      </svg>
    );
  }
  return <KeyRound aria-hidden="true" className="size-4 shrink-0" />;
};
