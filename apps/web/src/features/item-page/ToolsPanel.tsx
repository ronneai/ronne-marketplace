import { RENDERERS, supportOf, type ToolSupport } from "@ronneai/core/render";
import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { docsHref } from "@/components/help/topics";
import { placeFor, TOOL_PAGES } from "@/components/tools/tool-paths";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { Panel } from "@/components/ui/Panel";

/**
 * Which AI tools the shown version works in (feature 026), on the item page's Works in tab: one row
 * per built-in renderer, its level from the renderer's `supports()` and the version's own
 * `targets`, and what that means here. The same answer `rmk` acts on.
 */
const TONE: Record<ToolSupport, BadgeTone> = {
  native: "accent",
  degraded: "warning",
  off: "muted",
  none: "muted",
};

const Place = ({ place }: { place: string }) =>
  /[./]/.test(place) ? <code className="font-mono text-[11px] text-fg">{place}</code> : place;

/** What a level means for one tool, in a sentence (the tool's file or folder inside it). */
const Line = ({
  level,
  tool,
  type,
  place,
}: {
  level: ToolSupport;
  tool: string;
  type: string;
  place: string;
}) => {
  const t = useTranslations("item.tools");
  const where = { place: () => <Place place={place} /> };
  switch (level) {
    case "native":
      return place ? t.rich("native", where) : t("nativeAsIs");
    case "degraded":
      return t.rich("degraded", where);
    case "off":
      return t("off");
    default:
      return t("none", { tool, type });
  }
};

export const ToolsPanel = ({
  name,
  type,
  manifest,
}: {
  /** The item's name without its scope, as renderers name files. */
  name: string;
  type: string;
  manifest: Record<string, unknown>;
}) => {
  const t = useTranslations("item.tools");
  const support = supportOf(manifest, type);
  return (
    <Panel className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{t("title")}</h2>
        <Help id="support" />
      </div>
      <ul className="grid divide-y divide-hairline">
        {RENDERERS.map((renderer) => {
          const level = support[renderer.id] ?? "none";
          const page = TOOL_PAGES[renderer.id];
          return (
            <li
              key={renderer.id}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[9rem_6.5rem_1fr]"
            >
              {page ? (
                <NewTabLink
                  href={docsHref(page)}
                  className="text-sm font-semibold text-fg underline-offset-2 hover:underline"
                >
                  {renderer.name}
                </NewTabLink>
              ) : (
                <span className="text-sm font-semibold text-fg">{renderer.name}</span>
              )}
              <span>
                <Badge tone={TONE[level]}>{t(`level.${level}`)}</Badge>
              </span>
              <span className="col-span-2 min-w-0 break-words text-xs text-muted sm:col-span-1">
                <Line
                  level={level}
                  tool={renderer.name}
                  type={type}
                  place={placeFor(renderer.id, type, name)}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
