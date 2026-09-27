import { Moon, Sun } from "lucide-react";
import { setThemeFromForm } from "./actions";
import type { Theme } from "./theme";

const NEXT: Record<Theme, Theme> = { light: "dark", dark: "light" };

/**
 * The theme switch in the header (feature 032): one button that switches between light and dark.
 * It shows the theme you'd switch to (a moon in light, a sun in dark). A form posting to a server
 * action, so it works without JavaScript; the page comes back rendered in the new theme.
 */
export const ThemeToggle = ({ theme }: { theme: Theme }) => {
  const next = NEXT[theme];
  const Icon = next === "dark" ? Moon : Sun;
  return (
    <form action={setThemeFromForm}>
      <button
        type="submit"
        name="theme"
        value={next}
        aria-label={`Switch to the ${next} theme`}
        title={`Switch to the ${next} theme`}
        className="flex size-8 items-center justify-center rounded-control border border-hairline text-muted hover:border-strong hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Icon size={16} aria-hidden />
      </button>
    </form>
  );
};
