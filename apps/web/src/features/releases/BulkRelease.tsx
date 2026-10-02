"use client";

import { highestMatching } from "@ronneai/core";
import { Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/Dialog";
import { FieldError, inputClasses, Label, Select } from "@/components/ui/Field";
import { TypeBadge } from "@/components/ui/TypeBadge";
import type {
  ReleaseCandidate,
  ReleasedSubmission,
  ReleaseSettings,
} from "@/server/domains/submissions/actions/publish";
import { planReleases } from "@/server/domains/submissions/models/release-plan";
import { prepareReleaseAction, releaseSelectedAction } from "./actions";

/**
 * Releasing several approved submissions at once (feature 055), on My submissions and the review
 * queue's To release tab. The page says which rows can be released; ticking them and Release
 * selected opens one dialog: the settings once for all, each version and tag previewed in release
 * order with the approved dependencies added (056), then each result.
 */
type Selection = {
  releasable: ReadonlyMap<string, string>;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

const useSelection = () => {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("BulkRelease's parts go inside BulkReleaseProvider.");
  return selection;
};

/** Holds the selection: `releasable` is every row that can be ticked, id → `@scope/name`. */
export const BulkReleaseProvider = ({
  releasable,
  children,
}: {
  releasable: Record<string, string>;
  children: ReactNode;
}) => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const map = new Map(Object.entries(releasable));
  const value: Selection = {
    releasable: map,
    selected,
    toggle: (id) =>
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else if (map.has(id)) next.add(id);
        return next;
      }),
    selectAll: () => setSelected(new Set(map.keys())),
    clear: () => setSelected(new Set()),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

/** An approved row's checkbox. */
export const ReleaseSelectCell = ({ id, name }: { id: string; name: string }) => {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Select ${name} to release`}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className="size-4 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    />
  );
};

const DEFAULT_SETTINGS: ReleaseSettings = { kind: "stable", bump: "suggested", tag: "" };

/** The settings, once for all: stable or pre-release, the bump, the tag, the notes. */
const SettingsForm = ({
  settings,
  onChange,
  notes,
  onNotes,
}: {
  settings: ReleaseSettings;
  onChange: (settings: ReleaseSettings) => void;
  notes: string;
  onNotes: (notes: string) => void;
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <fieldset className="grid gap-1.5">
      <legend className="text-xs font-semibold">Release as</legend>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {(["stable", "prerelease"] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="release-kind"
              checked={settings.kind === kind}
              onChange={() => onChange({ ...settings, kind, id: settings.id ?? "beta" })}
              className="size-4 accent-(--accent)"
            />
            {kind === "stable" ? "Stable" : "Pre-release"}
          </label>
        ))}
        {settings.kind === "prerelease" ? (
          <input
            aria-label="Pre-release id"
            value={settings.id ?? ""}
            onChange={(event) => onChange({ ...settings, id: event.target.value })}
            className={cn(inputClasses, "h-8 w-24 font-mono text-xs")}
          />
        ) : null}
      </div>
    </fieldset>
    <div className="grid gap-1.5">
      <Label htmlFor="release-bump">Bump, for items with versions</Label>
      <Select
        id="release-bump"
        value={settings.bump}
        onChange={(event) =>
          onChange({ ...settings, bump: event.target.value as ReleaseSettings["bump"] })
        }
        className="h-8 text-sm"
      >
        <option value="suggested">Suggested for each</option>
        <option value="patch">Patch for all</option>
        <option value="minor">Minor for all</option>
        <option value="major">Major for all</option>
      </Select>
    </div>
    <div className="grid gap-1.5">
      <Label htmlFor="release-tag">Tag</Label>
      <input
        id="release-tag"
        value={settings.tag ?? ""}
        placeholder="latest, or next for a pre-release"
        onChange={(event) => onChange({ ...settings, tag: event.target.value })}
        className={cn(inputClasses, "h-8 font-mono text-xs")}
      />
    </div>
    <div className="grid gap-1.5">
      <Label htmlFor="release-notes">
        Release notes <span className="font-normal text-muted">(optional)</span>
      </Label>
      <textarea
        id="release-notes"
        rows={1}
        maxLength={2000}
        value={notes}
        placeholder="Stored on every version"
        onChange={(event) => onNotes(event.target.value)}
        className={cn(inputClasses, "h-auto resize-none py-1.5 text-sm")}
      />
    </div>
  </div>
);

/** How a candidate's version came about: a first release, or the bump from its newest version. */
const originOf = (candidate: ReleaseCandidate, bump: string | null, suggested: boolean) =>
  candidate.published.length === 0
    ? "first release"
    : `after ${highestMatching(candidate.published, ">=0.0.0-0") ?? candidate.published[0]} · ${bump}${suggested ? " (suggested)" : ""}`;

const RESULT_TEXT: Record<ReleasedSubmission["result"], string> = {
  published: "Published",
  not_found: "Not released",
  not_releasable: "Not released",
  skipped: "Skipped",
};

/** Select all and Release selected, above the list; only when something can be released. */
export const BulkReleaseToolbar = ({
  help,
  selectAllLabel = "Select all approved",
}: {
  help?: ReactNode;
  selectAllLabel?: string;
}) => {
  const router = useRouter();
  const { releasable, selected, selectAll, clear } = useSelection();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ReleaseSettings>(DEFAULT_SETTINGS);
  const [notes, setNotes] = useState("");
  const [prepared, setPrepared] = useState<{
    candidates: ReleaseCandidate[];
    refused: ReleasedSubmission[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ReleasedSubmission[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [releasing, startReleasing] = useTransition();
  if (releasable.size === 0 && !open) return null;
  const chosen = [...selected].filter((id) => releasable.has(id));
  const plans = prepared ? planReleases(prepared.candidates, settings) : [];
  const blocked = plans.some((plan) => !plan.ok);
  const count = prepared?.candidates.length ?? 0;
  const close = () => {
    setOpen(false);
    if (results) {
      setResults(null);
      clear();
      router.refresh();
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 pb-4">
      {releasable.size > 0 ? (
        <>
          <Button variant="secondary" onClick={selectAll}>
            {selectAllLabel} ({releasable.size})
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              setPrepared(null);
              setError(null);
              setResults(null);
              setOpen(true);
              startLoading(async () => {
                const result = await prepareReleaseAction(chosen);
                if (result.ok) setPrepared(result);
                else setError(result.error);
              });
            }}
          >
            <Rocket size={16} aria-hidden="true" />
            Release selected ({chosen.length})
          </Button>
          {help}
        </>
      ) : null}
      <Dialog
        open={open}
        onClose={close}
        size="large"
        title={results ? "Released" : `Release ${count} ${count === 1 ? "item" : "items"}?`}
      >
        {results ? (
          <>
            <section
              aria-label="What happened to each"
              className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
            >
              <ul className="text-sm">
                {results.map((r) => (
                  <li key={r.id} className="border-b border-hairline py-2.5 last:border-b-0">
                    <span className="mr-2 font-mono text-xs font-semibold">
                      {RESULT_TEXT[r.result]}:
                    </span>
                    <Link
                      href={`/submissions/${r.id}`}
                      className="font-mono text-link hover:underline"
                    >
                      {r.name ?? r.id}
                    </Link>
                    {r.result === "published" ? (
                      <span className="ml-2 font-mono text-xs text-muted">
                        {r.version} as {r.tag} · sha256 {r.sha256.slice(0, 12)}…
                      </span>
                    ) : "reason" in r ? (
                      <p className="mt-1 text-muted">{r.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
            <div className="flex shrink-0 justify-end border-t border-hairline px-4 py-4">
              <Button onClick={close}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <div className="shrink-0 border-b border-hairline bg-canvas px-4 py-3">
              <SettingsForm
                settings={settings}
                onChange={setSettings}
                notes={notes}
                onNotes={setNotes}
              />
            </div>
            <section
              aria-label="What would be released"
              className="min-h-0 flex-1 overflow-y-auto px-4 py-1"
            >
              {loading || (!prepared && !error) ? (
                <p className="py-6 text-center text-sm text-muted">Working out the order…</p>
              ) : (
                <ul className="text-sm">
                  {prepared?.candidates.map((candidate) => {
                    const plan = plans.find((p) => p.id === candidate.id);
                    return (
                      <li
                        key={candidate.id}
                        className="grid gap-1 border-b border-hairline py-2.5 last:border-b-0"
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[13px] font-semibold">
                            {candidate.name}
                          </span>
                          <TypeBadge type={candidate.type} />
                        </span>
                        <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                          <span>
                            {candidate.author}
                            {plan?.ok ? ` · ${originOf(candidate, plan.bump, plan.suggested)}` : ""}
                          </span>
                          {plan?.ok ? (
                            <span className="font-mono text-fg">
                              {plan.version} as {plan.tag}
                            </span>
                          ) : (
                            <span className="text-error-text">{plan?.problem}</span>
                          )}
                        </span>
                        {candidate.includedFor ? (
                          <span>
                            <Badge>included for {candidate.includedFor.join(", ")}</Badge>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                  {prepared?.refused.map((r) => (
                    <li
                      key={r.id}
                      className="grid gap-1 border-b border-hairline py-2.5 last:border-b-0"
                    >
                      <span className="font-mono text-[13px] font-semibold">{r.name ?? r.id}</span>
                      <span className="text-xs text-error-text">
                        {"reason" in r ? r.reason : "It doesn't exist, or you can't see it."}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="grid shrink-0 gap-3 border-t border-hairline px-4 py-4">
              <p className="text-sm text-muted">
                Dependencies go first. Each is released on its own: one that fails stops only what
                depends on it. Versions never change once published.
              </p>
              <FieldError id="release-error">{error}</FieldError>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
                <Button
                  loading={releasing}
                  disabledReason={
                    count === 0
                      ? "Nothing here can be released."
                      : blocked
                        ? "Change the settings: some versions or tags don't work."
                        : null
                  }
                  onClick={() =>
                    startReleasing(async () => {
                      const result = await releaseSelectedAction(
                        prepared?.candidates.map((c) => c.id) ?? [],
                        settings,
                        notes,
                      );
                      if (!result.ok) return setError(result.error);
                      // What couldn't go from the start, then each one sent.
                      const refused = prepared?.refused ?? [];
                      setResults([
                        ...refused,
                        ...result.results.filter((r) => !refused.some((x) => x.id === r.id)),
                      ]);
                    })
                  }
                >
                  <Rocket size={16} aria-hidden="true" />
                  Release {count} {count === 1 ? "item" : "items"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
};
