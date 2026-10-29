import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../../identity/models/user";
import type {
  DismissalTarget,
  ScanDismissalRepository,
} from "../repositories/scan-dismissal-repository";
import { dismissalReasonFrom, dismissFinding, restoreFinding } from "./dismissals";

const moderator: CurrentUser = {
  id: "mod",
  email: "mod@example.com",
  name: "Mo",
  role: "user",
  workspaces: { global: "moderator" },
};

const target: DismissalTarget = {
  scanId: "01J0000000000000000000SCAN",
  status: "done",
  findings: [
    {
      rule: "P2",
      category: "Prompt Injection",
      severity: "HIGH",
      confidence: 0.9,
      title: "Hidden Instructions",
      explanation: null,
      remediation: null,
      file: "SKILL.md",
      line: 3,
    },
  ],
  revision: 1,
  submission: {
    id: "sub1",
    authorId: "author",
    status: "submitted",
    name: "style",
    scope: { name: "team" },
    workspace: { id: "global", name: "global" },
  },
};

/** A repository whose first transaction the database ends to break a deadlock (MySQL's 1213). */
const deadlockingOnce = () => {
  const audits: unknown[] = [];
  let attempts = 0;
  const repo: ScanDismissalRepository = {
    transaction: async (work) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("Deadlock"), { code: "ER_LOCK_DEADLOCK" });
      return work(repo);
    },
    lockScan: vi.fn(async () => {}),
    target: vi.fn(async () => target),
    dismissals: vi.fn(async () => new Map()),
    dismiss: vi.fn(async () => true),
    restore: vi.fn(async () => true),
    recordAudit: vi.fn(async (event) => {
      audits.push(event);
    }),
  };
  return { repo, audits, attempts: () => attempts };
};

describe("false positives and deadlocks (137)", () => {
  it("runs a mark again when the database ended it for a deadlock, and audits it once", async () => {
    const { repo, audits, attempts } = deadlockingOnce();
    await dismissFinding(
      { repo },
      { user: moderator, ip: null },
      {
        scanId: "01J0000000000000000000SCAN",
        finding: 0,
        reason: "Docs only.",
      },
    );
    expect(attempts()).toBe(2);
    expect(audits).toHaveLength(1);
  });

  it("does the same for a restore", async () => {
    const { repo, audits, attempts } = deadlockingOnce();
    await restoreFinding(
      { repo },
      { user: moderator, ip: null },
      { scanId: "01J0000000000000000000SCAN", finding: 0 },
    );
    expect(attempts()).toBe(2);
    expect(audits).toHaveLength(1);
  });
});

describe("dismissalReasonFrom (137)", () => {
  // Written as escapes: a lone surrogate can't sit in a UTF-8 file, and the rest is invisible.
  it("keeps a reason with something visible, cleaned, and the joiner of an emoji sequence", () => {
    expect(dismissalReasonFrom("  Docs​ only.‮ ")).toBe("Docs only.");
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    expect(dismissalReasonFrom(family)).toBe(family);
  });

  it("drops lone surrogates (half pairs)", () => {
    expect(dismissalReasonFrom("\ud800abc\udfff")).toBe("abc");
    expect(() => dismissalReasonFrom("\udc00")).toThrow();
  });

  it("refuses a reason with nothing to read: blanks, fillers, joiners or marks alone", () => {
    for (const blank of ["⠀", "́", "ㅤ", "‍", "  ", "️"])
      expect(() => dismissalReasonFrom(blank), JSON.stringify(blank)).toThrow();
    expect(dismissalReasonFrom("é")).toBe("é");
  });
});
