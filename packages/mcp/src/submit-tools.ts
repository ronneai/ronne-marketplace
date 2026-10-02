import { connectRegistry, type Io, planSubmit, sendSubmit, submitLines } from "@ronneai/rmk/lib";
import { answer, failure, type ToolAnswer } from "./text.js";

/**
 * Submitting the person's drafts from inside their AI tool (feature 052), in two steps like
 * exporting: `check_drafts` shows what's ready and what's in the way, and sends nothing;
 * `submit_drafts` sends the ready ones for review, which the tool asks the person about first.
 * Both use `rmk submit`'s own functions.
 */
export type SubmitInput = { items?: string[]; all?: boolean; dependencies?: boolean };

const selectionOf = (
  input: SubmitInput,
):
  | { ok: true; selection: { refs: readonly string[] } | { all: true } }
  | { ok: false; answer: ToolAnswer } => {
  if (input.all && input.items?.length)
    return {
      ok: false,
      answer: failure("invalid_request", "Name drafts in items, or use all; not both."),
    };
  if (!input.all && !input.items?.length)
    return {
      ok: false,
      answer: failure(
        "invalid_request",
        "Say which drafts: items (@scope/name or draft ids), or all: true for every one.",
      ),
    };
  return { ok: true, selection: input.all ? { all: true } : { refs: input.items ?? [] } };
};

const planData = (plan: Awaited<ReturnType<typeof planSubmit>>) => ({
  ready: plan.ready,
  /** The person's own dependency drafts included first (056), each with who it's for. */
  included: plan.ready.filter((d) => d.includedFor),
  notReady: plan.notReady,
  order: plan.order,
  more: plan.more,
});

/** What submitting would do, sending nothing. */
export const checkDraftsTool = async (io: Io, input: SubmitInput): Promise<ToolAnswer> => {
  const chosen = selectionOf(input);
  if (!chosen.ok) return chosen.answer;
  const plan = await planSubmit(
    connectRegistry(io).api,
    chosen.selection,
    input.dependencies !== false,
  );
  if (plan.checked.length === 0 && plan.notReady.length === 0)
    return answer(["The person has no drafts to submit."], planData(plan));
  return answer(
    [
      ...plan.preview,
      "",
      plan.ready.length > 0
        ? "Show this to the person. Submitting sends the ready ones to reviewers, who see them; the person can withdraw one until it's approved. If they agree, call submit_drafts with the same items."
        : "Nothing is ready: what's in the way is fixed in the web app's editor (or by exporting the item again).",
    ],
    planData(plan),
  );
};

/** Submits the ready drafts of the selection, checking again first, and says what happened. */
export const submitDraftsTool = async (io: Io, input: SubmitInput): Promise<ToolAnswer> => {
  const chosen = selectionOf(input);
  if (!chosen.ok) return chosen.answer;
  const { api } = connectRegistry(io);
  const plan = await planSubmit(api, chosen.selection, input.dependencies !== false);
  if (plan.ready.length === 0)
    return {
      ...answer(["Nothing is ready to submit.", ...plan.preview], planData(plan)),
      isError: true,
    };
  const outcome = await sendSubmit(api, plan);
  return answer(submitLines(outcome, plan), {
    submitted: outcome.submitted,
    notSubmitted: outcome.notSubmitted,
  });
};
