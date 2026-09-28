import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { diffRevisions } from "@/server/domains/submissions/models/diff";
import type { EditorProposal } from "./types";

const proposals = vi.hoisted(() => ({ rebaseProposal: vi.fn(), resolveConflict: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/proposals", () => proposals);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/cache", () => cache);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), redirect: vi.fn() }));

const { ProposalBar } = await import("./ProposalBar");
const { DraftSettingsDialog } = await import("./FileDialogs");
const { rebaseAction, resolveConflictAction } = await import("./actions");
const { SubmissionStaleError, ConflictNotFoundError } = await import(
  "@/server/domains/submissions/exceptions/errors"
);

const file = (path: string, content: string) => ({
  path,
  encoding: "utf8" as const,
  content,
  size: content.length,
  executable: false,
});
const proposal = (overrides: Partial<EditorProposal> = {}): EditorProposal => ({
  itemName: "@team/fmt",
  baseVersion: "1.0.0",
  baseHref: "/items/team/fmt?version=1.0.0",
  stale: null,
  canRebase: true,
  canResolve: true,
  conflicts: [],
  ...overrides,
});
const bar = (p: EditorProposal, { status = "draft", dirty = false } = {}) =>
  renderToStaticMarkup(<ProposalBar draftId="d" proposal={p} status={status} dirty={dirty} />);

beforeEach(() => vi.clearAllMocks());

describe("ProposalBar", () => {
  it("says which version it changes, and links to it", () => {
    const html = bar(proposal());
    expect(html).toContain("A change to @team/fmt 1.0.0.");
    expect(html).toContain('href="/items/team/fmt?version=1.0.0"');
    expect(html).not.toContain("Rebase onto");
  });

  it("offers Rebase once it's stale, after saving, and says a submitted one goes back for review", () => {
    const stale = proposal({ stale: "1.1.0" });
    const html = bar(stale);
    expect(html).toContain("1.1.0 has been released since this proposal started.");
    expect(html).toMatch(/<button[^>]*>.*Rebase onto 1\.1\.0<\/button>/);
    expect(html).not.toContain("to be reviewed again");
    expect(bar(stale, { status: "submitted" })).toContain("to be reviewed again");
    const dirty = bar(stale, { dirty: true });
    expect(dirty).toMatch(/<button[^>]*disabled=""[^>]*>.*Rebase onto/);
    expect(dirty).toContain("Save your changes first.");
    expect(bar(proposal({ stale: "1.1.0", canRebase: false }))).not.toContain("Rebase onto");
  });

  it("lists conflicts with their diff and Mark resolved", () => {
    const change =
      diffRevisions([file("README.md", "Theirs.")], [file("README.md", "Mine.")])[0] ?? null;
    const html = bar(
      proposal({
        conflicts: [
          { path: "README.md", change },
          { path: "x.bin", change: null },
        ],
      }),
    );
    expect(html).toContain("Conflicts (2)");
    expect(html).toContain("Compare with 1.0.0");
    expect(html).toContain("Theirs.");
    expect(html).toContain("Mine.");
    expect(html).toContain("couldn&#x27;t be read");
    expect(html.match(/Mark resolved/g)).toHaveLength(2);
    expect(bar(proposal({ conflicts: [{ path: "a", change }], canResolve: false }))).not.toContain(
      "Mark resolved",
    );
  });
});

describe("DraftSettingsDialog", () => {
  it("offers no rename for a change proposal", () => {
    const html = renderToStaticMarkup(
      <DraftSettingsDialog
        draftId="d"
        scope="team"
        name="fmt"
        dirty={false}
        proposal
        onClose={() => {}}
      />,
    );
    expect(html).toContain("A change proposal keeps its item&#x27;s scope and name");
    expect(html).toMatch(/<form hidden=""/);
    expect(html).toContain("Delete draft");
  });
});

describe("proposal actions", () => {
  it("rebases and refreshes the page, or returns the domain's message", async () => {
    proposals.rebaseProposal.mockResolvedValue({});
    expect(await rebaseAction("d")).toEqual({ ok: true });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/submissions/d");
    proposals.rebaseProposal.mockRejectedValue(
      new SubmissionStaleError("@team/fmt", "1.0.0", "1.1.0"),
    );
    expect(await rebaseAction("d")).toMatchObject({
      ok: false,
      error: expect.stringContaining("1.1.0"),
    });
  });

  it("resolves a conflict, or says why not", async () => {
    proposals.resolveConflict.mockResolvedValue([]);
    expect(await resolveConflictAction("d", "README.md")).toEqual({ ok: true });
    expect(proposals.resolveConflict).toHaveBeenCalledWith(expect.any(Headers), "d", "README.md");
    proposals.resolveConflict.mockRejectedValue(new ConflictNotFoundError("x"));
    expect(await resolveConflictAction("d", "x")).toEqual({
      ok: false,
      error: "x has no conflict to resolve.",
    });
  });
});
