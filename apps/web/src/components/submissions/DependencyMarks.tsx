import { CircleX, Link2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/Notice";
import { Popover } from "@/components/ui/Popover";
import { TONES } from "@/components/ui/tones";
import type { DependencyMark } from "@/server/domains/submissions/actions/submissions";

/**
 * One mark in words (056, in the person's language since 131): its sentence ("Waits on
 * @team/github (in review)", "Blocked: @team/github was rejected"), and its own status in a word or
 * two, for a badge beside its name. Approved reads "pending release" (owner, 2026-10-01); a
 * withdrawn dependency "archived" (057).
 */
export const useMarkWords = () => {
  const t = useTranslations("author.marks");
  return {
    text: (mark: DependencyMark): string =>
      mark.kind === "waits"
        ? t("waitsOn", { dependency: mark.dependency, status: t(`waits.${mark.status}`) })
        : mark.through.length === 0
          ? t("blocked", { dependency: mark.dependency, status: mark.status })
          : t("blockedThrough", {
              dependency: mark.dependency,
              through: mark.through.at(-1) ?? "",
              status: mark.status,
            }),
    status: (mark: DependencyMark): string =>
      mark.kind === "waits"
        ? t(`waits.${mark.status}`)
        : mark.through.length === 0
          ? t(`closed.${mark.status}`)
          : t("throughStatus", { through: mark.through.at(-1) ?? "", status: mark.status }),
  };
};

/**
 * Beside a dependency's name (owner, 2026-10-01): an amber badge while it isn't released yet ("in
 * review", "approved", "not submitted"), a red one when it's blocked. The full sentence is on
 * hover and for screen readers. Reusable: any list of dependencies can show it, with its classes.
 */
export const DependencyStatusBadge = ({
  mark,
  className,
}: {
  mark: DependencyMark;
  className?: string;
}) => {
  const words = useMarkWords();
  const blocked = mark.kind === "blocked";
  const Icon = blocked ? CircleX : TriangleAlert;
  return (
    <Badge
      tone={blocked ? "error" : "warning"}
      title={words.text(mark)}
      aria-label={words.text(mark)}
      className={cn("gap-1", className)}
    >
      <Icon size={11} aria-hidden="true" />
      {words.status(mark)}
    </Badge>
  );
};

/**
 * A row's dependencies that aren't released yet, as one icon (owner, 2026-10-01): a link with the
 * count, amber while they're pending, red when one is blocked. Clicking it lists each with its
 * status badge, in a popover of the same tone. Nothing when there are none. Reusable in any list.
 */
export const DependencyMarksIcon = ({
  marks,
  className,
}: {
  marks?: readonly DependencyMark[];
  className?: string;
}) => {
  const t = useTranslations("author.marks");
  if (!marks || marks.length === 0) return null;
  const tone = marks.some((mark) => mark.kind === "blocked") ? "error" : "warning";
  const count = marks.length;
  const label = t(tone === "error" ? "problem" : "pending", { count });
  return (
    <Popover
      label={label}
      tone={tone}
      buttonClassName={cn(
        "h-5 gap-1 rounded-full border px-1.5 text-[11px] font-semibold",
        TONES[tone].chip,
        TONES[tone].text,
        className,
      )}
      button={
        <>
          <Link2 size={12} aria-hidden="true" />
          {count}
        </>
      }
    >
      <p className="font-semibold">{t(tone === "error" ? "wontRelease" : "releasedOnce")}</p>
      <ul className="grid gap-1.5">
        {marks.map((mark) => (
          <li key={mark.dependency} className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{mark.dependency}</span>
            <DependencyStatusBadge mark={mark} />
          </li>
        ))}
      </ul>
      <Help id="waits-on" />
    </Popover>
  );
};

/**
 * A page's marks, as a notice: a warning when something is blocked, information while it only
 * waits. Says what that means for releasing.
 */
export const DependencyMarksNotice = ({ marks }: { marks?: readonly DependencyMark[] }) => {
  const t = useTranslations("author.marks");
  const words = useMarkWords();
  if (!marks || marks.length === 0) return null;
  const blocked = marks.some((mark) => mark.kind === "blocked");
  return (
    <Notice kind={blocked ? "warn" : "info"} title={t(blocked ? "wontRelease" : "canRelease")}>
      <ul className="mt-1 grid gap-0.5">
        {marks.map((mark) => (
          <li key={mark.dependency}>{words.text(mark)}</li>
        ))}
      </ul>
      {blocked ? <p className="mt-2 text-muted">{t("blockedHint")}</p> : null}
      <div className="mt-2">
        <Help id="waits-on" />
      </div>
    </Notice>
  );
};
