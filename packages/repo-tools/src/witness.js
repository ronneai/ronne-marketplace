// Checks the state witness records (docs/knowledge/state-witness.md): each WITNESS.md is in the
// record format, and every ticked task in PLAN.md has a witness pass that met it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const VERDICTS = ["confirmed", "partly", "not met", "can't check here"];

/**
 * Features checked: from 087 on, except those witnessed before the record format (2026-10-06).
 * Earlier features were built before the witness, or with its first format.
 */
const FIRST_CHECKED = 87;
const LEGACY = new Set([88, 89, 96, 97]);

export const isChecked = (id) => id >= FIRST_CHECKED && !LEGACY.has(id);

const TABLE_HEADER = ["#", "Claim", "In the notes?", "Verdict", "Evidence"];

/** Splits a Markdown table row into cells, keeping `|` inside code spans and `\|`. */
export const splitRow = (line) => {
  const cells = [];
  let cell = "";
  let inCode = false;
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "\\" && body[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (char === "`") {
      inCode = !inCode;
      cell += char;
    } else if (char === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
};

/**
 * The tasks in a PLAN.md: `- [x] **3. Name.**`, risky when its first line has `[risky]`.
 * @returns {{ n: number, ticked: boolean, risky: boolean, line: number }[]}
 */
export const parsePlan = (text) =>
  text.split("\n").flatMap((line, index) => {
    const match = /^- \[([ xX])\] \*\*(\d+)\./.exec(line);
    if (!match) return [];
    return [
      {
        n: Number(match[2]),
        ticked: match[1] !== " ",
        risky: line.includes("[risky]"),
        line: index + 1,
      },
    ];
  });

/** The task numbers in a heading such as `## Task 2 — …` or `## Tasks 3, 4 and 5 — …`. */
export const headingTasks = (heading) => {
  const match = /^## Tasks? ((?:\d+|,|and|\s)+)/.exec(heading);
  return match ? (match[1].match(/\d+/g) ?? []).map(Number) : [];
};

/**
 * Reads a WITNESS.md into sections (one per `## ` heading) and passes (one per `Witnessed:` line).
 * @returns {{ sections: { tasks: number[], line: number, passes: Pass[] }[], errors: string[] }}
 * @typedef {{ line: number, adversarial: boolean, rows: string[][], met: boolean | null }} Pass
 */
export const parseWitness = (text, file = "WITNESS.md") => {
  const errors = [];
  const sections = [];
  let section = null;
  let pass = null;
  let inTable = false;

  const closePass = () => {
    if (!pass) return;
    if (pass.rows.length === 0) errors.push(`${file}:${pass.line}: the pass has no claims table`);
    if (pass.met === null) {
      errors.push(`${file}:${pass.line}: the pass has no "**Overall:** met" or "not met" line`);
    }
    pass = null;
  };

  text.split("\n").forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    if (line.startsWith("## ")) {
      closePass();
      inTable = false;
      section = { tasks: headingTasks(line), line: index + 1, passes: [] };
      sections.push(section);
      return;
    }
    if (line.startsWith("Witnessed:")) {
      closePass();
      inTable = false;
      if (!section) {
        errors.push(`${at}: "Witnessed:" before any "## Task" heading`);
        return;
      }
      if (!/\bCommit: [0-9a-f]{7,40}\b/.test(line)) {
        errors.push(`${at}: "Witnessed:" needs "Commit: <sha>", the commit the witness checked`);
      }
      pass = { line: index + 1, adversarial: /\badversarial\b/i.test(line), rows: [], met: null };
      section.passes.push(pass);
      return;
    }
    if (line.startsWith("**Overall:**")) {
      const verdict = line.slice("**Overall:**".length).trim().toLowerCase();
      const met = verdict.startsWith("met") ? true : verdict.startsWith("not met") ? false : null;
      if (met === null) errors.push(`${at}: "**Overall:**" must start with "met" or "not met"`);
      if (pass && pass.met === null) pass.met = met;
      return;
    }
    if (!line.trimStart().startsWith("|")) {
      inTable = false;
      return;
    }

    const cells = splitRow(line);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) return;
    if (!inTable) {
      inTable = true;
      const header = cells.map((cell, i) => (i === 4 ? cell.split(" (")[0] : cell));
      if (header.join("|") !== TABLE_HEADER.join("|")) {
        errors.push(`${at}: the claims table's columns must be: ${TABLE_HEADER.join(", ")}`);
      }
      if (!pass) errors.push(`${at}: a claims table outside a pass (no "Witnessed:" line above)`);
      return;
    }
    if (cells.length !== TABLE_HEADER.length) {
      errors.push(`${at}: the row has ${cells.length} cells, not ${TABLE_HEADER.length}`);
      return;
    }
    const [, claim, inNotes, verdict, evidence] = cells;
    if (!claim) errors.push(`${at}: the claim is empty`);
    if (inNotes !== "yes" && inNotes !== "no") {
      errors.push(`${at}: "In the notes?" must be yes or no, not "${inNotes}"`);
    }
    if (!VERDICTS.includes(verdict)) {
      errors.push(`${at}: the verdict must be one of ${VERDICTS.join(", ")}; not "${verdict}"`);
    }
    if (!evidence) errors.push(`${at}: the evidence is empty; give the command and what it showed`);
    pass?.rows.push(cells);
  });
  closePass();
  return { sections, errors };
};

const passHolds = (pass) => pass.met === true && pass.rows.every((row) => row[3] === "confirmed");

/**
 * Checks one feature: its WITNESS.md's format, and a witness that met every ticked task.
 * @param {{ id: number, dir: string, plan: string, witness: string | null }} feature
 * @returns {string[]} errors, empty when it holds
 */
export const checkFeature = ({ dir, plan, witness }) => {
  const planFile = `${dir}/PLAN.md`;
  const witnessFile = `${dir}/WITNESS.md`;
  const ticked = parsePlan(plan).filter((task) => task.ticked);
  if (witness === null) {
    return ticked.map(
      (task) => `${planFile}:${task.line}: task ${task.n} is ticked but there's no WITNESS.md`,
    );
  }

  const { sections, errors } = parseWitness(witness, witnessFile);
  for (const task of ticked) {
    const passes = sections.filter((s) => s.tasks.includes(task.n)).flatMap((s) => s.passes);
    const where = `${planFile}:${task.line}: task ${task.n}`;
    const blind = passes.filter((p) => !p.adversarial).at(-1);
    if (!blind) {
      errors.push(`${where} is ticked but WITNESS.md has no pass for it`);
    } else if (!passHolds(blind)) {
      errors.push(`${where} is ticked but its latest pass isn't met with every claim confirmed`);
    }
    if (task.risky) {
      const adversarial = passes.filter((p) => p.adversarial).at(-1);
      if (!adversarial) {
        errors.push(`${where} is [risky] and ticked but has no adversarial pass`);
      } else if (!passHolds(adversarial)) {
        errors.push(
          `${where} is [risky]; its latest adversarial pass isn't met with every claim confirmed`,
        );
      }
    }
  }
  return errors;
};

/** Checks every feature folder under `docs/features` in scope (see `isChecked`). */
export const checkAll = (root) => {
  const featuresDir = join(root, "docs", "features");
  return readdirSync(featuresDir, { withFileTypes: true }).flatMap((entry) => {
    const match = /^(\d{3})-/.exec(entry.name);
    if (!entry.isDirectory() || !match || !isChecked(Number(match[1]))) return [];
    const dir = `docs/features/${entry.name}`;
    const planPath = join(root, dir, "PLAN.md");
    const witnessPath = join(root, dir, "WITNESS.md");
    if (!existsSync(planPath)) return [];
    return checkFeature({
      id: Number(match[1]),
      dir,
      plan: readFileSync(planPath, "utf8"),
      witness: existsSync(witnessPath) ? readFileSync(witnessPath, "utf8") : null,
    });
  });
};
