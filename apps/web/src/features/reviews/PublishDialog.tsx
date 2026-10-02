"use client";

import { type Bump, defaultTag, nextVersion, type ReleaseChoice, tagProblem } from "@ronneai/core";
import { Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { SuggestedBump } from "@/server/domains/submissions/models/bump";
import { publishAction } from "./actions";
import type { PublishResult } from "./types";

const radio = "flex items-start gap-2 text-sm text-fg";

/** Why the dialog picked a bump for a change proposal (017); the publisher can pick another. */
export const BumpSuggestion = ({ suggested }: { suggested: SuggestedBump }) => (
  <p className="text-xs text-muted">
    Suggested: <span className="font-semibold text-fg">{suggested.bump}</span>, because{" "}
    {suggested.reasons.join("; ")}.
  </p>
);
const radioInput = "mt-0.5 size-4 accent-(--accent)";

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
}: {
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"stable" | "prerelease">("stable");
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
  const problem = !version
    ? "That doesn't give a new version: a pre-release id is lowercase letters and digits, starting with a letter."
    : tagProblem(shownTag, version);
  const first = published.length === 0;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={blocked !== null}
        title={blocked ?? undefined}
        aria-label={blocked ? `Publish: ${blocked}` : undefined}
      >
        <Rocket size={16} aria-hidden="true" />
        Publish
      </Button>
      {open ? (
        <Dialog
          open
          onClose={() => {
            setOpen(false);
            if (result?.ok) router.refresh();
          }}
          title={`Publish ${itemName}`}
        >
          {result?.ok ? (
            <div className="grid gap-4">
              <Notice
                kind="info"
                title={`Published ${itemName} ${result.version} as ${result.tag}.`}
              >
                <span className="font-mono text-xs break-all">sha256 {result.sha256}</span>
              </Notice>
              <div className="flex flex-wrap justify-end gap-2">
                <Link href={versionsHref} className={buttonClasses("secondary")}>
                  View versions
                </Link>
                <Button
                  onClick={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                start(async () =>
                  setResult(
                    await publishAction(id, { choice, tag: tag.trim() || undefined, notes }),
                  ),
                );
              }}
            >
              <fieldset className="grid gap-2">
                <legend className="pb-1 text-sm font-semibold text-fg">Release</legend>
                <label className={radio}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === "stable"}
                    onChange={() => setKind("stable")}
                    className={radioInput}
                  />
                  <span>Stable</span>
                </label>
                <label className={radio}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === "prerelease"}
                    onChange={() => setKind("prerelease")}
                    className={radioInput}
                  />
                  <span>Pre-release, such as a beta for early testers</span>
                </label>
                {kind === "prerelease" ? (
                  <div className="grid gap-1.5 pl-6">
                    <Label htmlFor="pre-id">Pre-release id</Label>
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
                  <legend className="pb-1 text-sm font-semibold text-fg">Change</legend>
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
                      <span>
                        {b === "patch"
                          ? "Patch: fixes, nothing new"
                          : b === "minor"
                            ? "Minor: new, and compatible"
                            : "Major: breaks something for installs"}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="release-tag">Tag</Label>
                <input
                  id="release-tag"
                  value={tag}
                  placeholder={version ? defaultTag(version) : ""}
                  onChange={(event) => setTag(event.target.value)}
                  className={`${inputClasses} font-mono`}
                />
                <p className="text-xs text-muted">
                  Installing without a version uses latest. Pre-releases go to next by default.
                </p>
                <Help id="tag" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="release-notes">Release notes (optional)</Label>
                <textarea
                  id="release-notes"
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={`${inputClasses} h-auto py-2`}
                />
              </div>
              <p className="rounded-control bg-canvas p-3 text-sm text-fg" role="status">
                {version && !problem ? (
                  <>
                    Publishes <span className="font-mono">{itemName}</span>{" "}
                    <span className="font-mono font-semibold">{version}</span> as{" "}
                    <span className="font-mono">{shownTag}</span>. Versions never change once
                    published.
                  </>
                ) : (
                  <span className="text-error-text">{problem}</span>
                )}
              </p>
              <FieldError id="publish-error">
                {result && !result.ok ? result.error : null}
              </FieldError>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending} disabled={Boolean(problem)}>
                  Publish {version ?? ""}
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      ) : null}
    </>
  );
};
