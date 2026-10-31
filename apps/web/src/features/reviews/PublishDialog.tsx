"use client";

import {
  type Bump,
  defaultTag,
  nextVersion,
  type ReleaseChoice,
  tagProblemOf,
} from "@ronneai/core";
import { Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/toast";
import type { BumpReason, SuggestedBump } from "@/server/domains/submissions/models/bump";
import { publishAction } from "./actions";
import type { PublishResult, ReleaseMember } from "./types";

/**
 * Each of what goes out with the item (112) and the version it gets: the same kind (stable or
 * pre-release) and its own suggested bump, as the server plans it (`planReleases`).
 */
export const groupVersions = (
  members: readonly ReleaseMember[],
  kind: "stable" | "prerelease",
  preId: string,
): { name: string; version: string | null }[] =>
  members.map((member) => {
    const bump: Bump = member.suggested ?? "minor";
    const choice: ReleaseChoice =
      kind === "stable" ? { kind, bump } : { kind, id: preId.trim(), bump };
    return { name: member.name, version: nextVersion(member.published, choice) };
  });

/**
 * Why Publish is off for the group (112): the first that gets no version, as the server would
 * refuse; the dialog words it (`publish.stuck`).
 */
export const groupBlockedBy = (group: readonly { name: string; version: string | null }[]) =>
  group.find((member) => member.version === null)?.name ?? null;

/** What's released with the item (112), each with its version. */
export const ReleaseGroupList = ({
  members,
}: {
  members: readonly { name: string; version: string | null }[];
}) => {
  const t = useTranslations("author.review.publish");
  return (
    <section aria-labelledby="release-group" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="release-group" className="text-sm font-semibold text-fg">
          {members.length === 1 ? t("withOne") : t("withMany", { count: members.length })}
        </h3>
        <Help id="submit-together" />
      </div>
      <ul className="grid gap-1" aria-label={t("withLabel")}>
        {members.map((member) => (
          <li key={member.name} className="text-sm text-fg">
            <span className="font-mono">{member.name}</span>{" "}
            <span className="font-mono font-semibold">{member.version ?? "—"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const radio = "flex items-start gap-2 text-sm text-fg";

/** Why a tag can't point to a version, in the person's language (131), or null. */
export const useTagWords = () => {
  const t = useTranslations("author.review.tagProblem");
  return (tag: string, version: string): string | null => {
    const problem = tagProblemOf(tag, version);
    return problem ? t(problem, { tag }) : null;
  };
};

/** One reason in words, its names as `code` (as they read before 131). */
const useReasonWords = () => {
  const t = useTranslations("author.review.reason");
  return (reason: BumpReason) =>
    t(reason.kind, {
      names: reason.names.map((name) => `\`${name}\``).join(", "),
      type: reason.type ?? "",
    });
};

/** Why the dialog picked a bump for a change proposal (017); the publisher can pick another. */
export const BumpSuggestion = ({ suggested }: { suggested: SuggestedBump }) => {
  const t = useTranslations("author.review.publish");
  const words = useReasonWords();
  return (
    <p className="text-xs text-muted">
      {t.rich("suggested", {
        bump: suggested.bump,
        reasons: suggested.reasons.map(words).join("; "),
        strong: (chunks) => <span className="font-semibold text-fg">{chunks}</span>,
      })}
    </p>
  );
};
const radioInput = "mt-0.5 size-4 accent-(--accent)";

/** What a release published (015): the item's version and tag, with what went along (112). */
export const PublishedNotice = ({
  itemName,
  result,
}: {
  itemName: string;
  result: Extract<PublishResult, { ok: true }>;
}) => {
  const t = useTranslations("author.review.publish");
  const format = useFormatter();
  return (
    <Notice
      kind="info"
      title={
        result.with && result.with.length > 0
          ? t("doneWith", {
              item: itemName,
              version: result.version,
              tag: result.tag,
              others: format.list(
                result.with.map((m) => `${m.name} ${m.version}`),
                { type: "conjunction" },
              ),
            })
          : t("done", { item: itemName, version: result.version, tag: result.tag })
      }
    >
      {/* biome-ignore lint/plugin: the hash's name and value, the same in every language */}
      <span className="font-mono text-xs break-all">sha256 {result.sha256}</span>
    </Notice>
  );
};

/**
 * Releases an approved submission (feature 015): stable or pre-release, the bump for later
 * releases, the tag and optional notes. The version is previewed with the same rule the server
 * uses (`nextVersion`); the publisher never types a version number.
 */
export const PublishDialog = ({
  id,
  itemName,
  published,
  versionsHref,
  suggested = null,
  blocked = null,
  goesWith = [],
  defaultOpen = false,
  defaultKind = "stable",
}: {
  /** Opened at once, without its button being pressed. */
  defaultOpen?: boolean;
  /** The kind of release it starts on: stable unless asked. */
  defaultKind?: "stable" | "prerelease";
  /** Its approved dependencies not released yet (112): released with it. */
  goesWith?: ReleaseMember[];
  /** Why it can't be released yet (056): a dependency not released, or blocked. */
  blocked?: string | null;
  id: string;
  itemName: string;
  /** For a change proposal (017): the bump its changes suggest, and why. */
  suggested?: SuggestedBump | null;
  /** The item's Versions page, offered once the release is out. */
  versionsHref: string;
  /** The item's versions so far; empty for a first release. */
  published: string[];
}) => {
  const t = useTranslations("author.review");
  const said = useTranslations("common.done");
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<"stable" | "prerelease">(defaultKind);
  const [preId, setPreId] = useState("beta");
  const [bump, setBump] = useState<Bump>(suggested?.bump ?? "minor");
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [pending, start] = useTransition();

  const choice: ReleaseChoice =
    kind === "stable" ? { kind, bump } : { kind, id: preId.trim(), bump };
  const version = nextVersion(published, choice);
  const shownTag = tag.trim() || (version ? defaultTag(version) : "");
  const tagWords = useTagWords();
  const problem = !version ? t("publish.badPre") : tagWords(shownTag, version);
  const first = published.length === 0;
  // What goes with it gets its versions by the same rule (112): one that gets none stops it.
  const group = groupVersions(goesWith, kind, preId);
  const stuck = groupBlockedBy(group);
  const blockedBy = stuck ? t("publish.stuck", { name: stuck }) : null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={blocked !== null}
        title={blocked ?? undefined}
        aria-label={blocked ? t("publish.blockedLabel", { reason: blocked }) : undefined}
      >
        <Rocket size={16} aria-hidden="true" />
        {t("publish.button")}
      </Button>
      {open ? (
        <Dialog
          open
          onClose={() => {
            setOpen(false);
            if (result?.ok) router.refresh();
          }}
          title={t("publish.title", { item: itemName })}
        >
          {result?.ok ? (
            <div className="grid gap-4">
              <PublishedNotice itemName={itemName} result={result} />
              <DialogActions>
                <Link href={versionsHref} className={buttonClasses("secondary")}>
                  {t("publish.viewVersions")}
                </Link>
                <Button
                  onClick={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                >
                  {t("publish.doneButton")}
                </Button>
              </DialogActions>
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                start(async () => {
                  const published = await publishAction(id, {
                    choice,
                    tag: tag.trim() || undefined,
                    notes,
                  });
                  setResult(published);
                  // The dialog keeps the version, the tag and the checksum to read and copy.
                  if (published.ok) toast.ok(said("released"));
                });
              }}
            >
              <fieldset className="grid gap-2">
                <legend className="pb-1 text-sm font-semibold text-fg">
                  {t("publish.release")}
                </legend>
                <label className={radio}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === "stable"}
                    onChange={() => setKind("stable")}
                    className={radioInput}
                  />
                  <span>{t("publish.stable")}</span>
                </label>
                <label className={radio}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === "prerelease"}
                    onChange={() => setKind("prerelease")}
                    className={radioInput}
                  />
                  <span>{t("publish.prerelease")}</span>
                </label>
                {kind === "prerelease" ? (
                  <div className="grid gap-1.5 pl-6">
                    <Label htmlFor="pre-id">{t("publish.preId")}</Label>
                    <input
                      id="pre-id"
                      value={preId}
                      onChange={(event) => setPreId(event.target.value)}
                      maxLength={16}
                      className={`${inputClasses} font-mono`}
                    />
                  </div>
                ) : null}
              </fieldset>
              {first ? null : (
                <fieldset className="grid gap-2">
                  <legend className="pb-1 text-sm font-semibold text-fg">
                    {t("publish.change")}
                  </legend>
                  {suggested ? <BumpSuggestion suggested={suggested} /> : null}
                  <Help id="bump" />
                  {(["patch", "minor", "major"] as const).map((b) => (
                    <label key={b} className={radio}>
                      <input
                        type="radio"
                        name="bump"
                        checked={bump === b}
                        onChange={() => setBump(b)}
                        className={radioInput}
                      />
                      <span>{t(`publish.bump.${b}`)}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="release-tag">{t("publish.tag")}</Label>
                <input
                  id="release-tag"
                  value={tag}
                  placeholder={version ? defaultTag(version) : ""}
                  onChange={(event) => setTag(event.target.value)}
                  className={`${inputClasses} font-mono`}
                />
                <p className="text-xs text-muted">{t("publish.tagHint")}</p>
                <Help id="tag" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="release-notes">{t("publish.notes")}</Label>
                <textarea
                  id="release-notes"
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={`${inputClasses} h-auto py-2`}
                />
              </div>
              {goesWith.length > 0 ? <ReleaseGroupList members={group} /> : null}
              <p className="rounded-control bg-canvas p-3 text-sm text-fg" role="status">
                {version && !problem && !blockedBy ? (
                  t.rich("publish.preview", {
                    item: itemName,
                    version,
                    tag: shownTag,
                    mono: (chunks) => <span className="font-mono">{chunks}</span>,
                    strong: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
                  })
                ) : (
                  <span className="text-error-text">{problem ?? blockedBy}</span>
                )}
              </p>
              <FieldError id="publish-error">
                {result && !result.ok ? result.error : null}
              </FieldError>
              <DialogActions>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  {t("publish.cancel")}
                </Button>
                <Button type="submit" loading={pending} disabled={Boolean(problem || blockedBy)}>
                  {t("publish.submit", { version: version ?? "" })}
                </Button>
              </DialogActions>
            </form>
          )}
        </Dialog>
      ) : null}
    </>
  );
};
