import { Monitor, Moon, Sun } from "lucide-react";
import { setThemeFromForm } from "./actions";
import type { Theme } from "./theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const LABEL: Record<Theme, string> = {
  system: "the system theme",
  light: "the light theme",
  dark: "the dark theme",
};

/**
 * The theme switch in the header (feature 032): one button that cycles system → light → dark, its
 * icon showing the current choice. A form posting to a server action, so it works without
 * JavaScript; the page comes back rendered in the new theme.
 */
export const ThemeToggle = ({ theme }: { theme: Theme }) => {
  const Icon = ICON[theme];
  const next = NEXT[theme];
  return (
    <form action={setThemeFromForm}>
      <button
        type="submit"
        name="theme"
        value={next}
        aria-label={`Using ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
        title={`Theme: ${theme} (click for ${next})`}
        className="flex size-8 items-center justify-center rounded-control border border-hairline text-muted hover:border-strong hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Icon size={16} aria-hidden />
      </button>
    </form>
  );
};
