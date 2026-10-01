import { RENDERERS, supportOf, type ToolSupport } from "@ronneai/core/render";
import Link from "next/link";
import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { docsHref } from "@/components/help/topics";
import { placeFor, TOOL_PAGES } from "@/components/tools/tool-paths";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";

/**
 * Which AI tools the shown version works in (feature 026), on the item page's Works in tab: one row
 * per built-in renderer, its level from the renderer's `supports()` and the version's own
 * `targets`, and what that means here. The same answer `rmk` acts on.
 */
export const LEVEL: Record<ToolSupport, { label: string; tone: BadgeTone }> = {
  native: { label: "supported", tone: "accent" },
  degraded: { label: "partly", tone: "warning" },
  off: { label: "turned off", tone: "muted" },
  none: { label: "skipped", tone: "muted" },
};

const Place = ({ place }: { place: string }) =>
  /[./]/.test(place) ? (
    <code className="font-mono text-[11px] text-fg">{place}</code>
  ) : (
    <>{place}</>
  );

const line = (level: ToolSupport, tool: string, type: string, place: string): ReactNode => {
  switch (level) {
    case "native":
      return place ? (
        <>
          Goes to <Place place={place} />.
        </>
      ) : (
        "Installs as it is."
      );
    case "degraded":
      return (
        <>
          Goes to <Place place={place} />, with some of it left out: the tool&apos;s page says what.
        </>
      );
    case "off":
      return "This version's ronne.yaml keeps it away from this tool.";
    default:
      return `${tool} has no place for ${type} items, so rmk skips it there with a warning.`;
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
  const support = supportOf(manifest, type);
  return (
    <Panel className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Works in</h2>
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
                <Link
                  href={docsHref(page)}
                  className="text-sm font-semibold text-fg underline-offset-2 hover:underline"
                >
                  {renderer.name}
                </Link>
              ) : (
                <span className="text-sm font-semibold text-fg">{renderer.name}</span>
              )}
              <span>
                <Badge tone={LEVEL[level].tone}>{LEVEL[level].label}</Badge>
              </span>
              <span className="col-span-2 min-w-0 break-words text-xs text-muted sm:col-span-1">
                {line(level, renderer.name, type, placeFor(renderer.id, type, name))}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
