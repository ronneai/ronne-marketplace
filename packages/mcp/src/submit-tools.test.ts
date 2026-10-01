import {
  type FakeIo,
  type FakeSubmitDraft,
  fakeIo,
  identityRoutes,
  REGISTRY,
  submitRoutes,
} from "@ronneai/rmk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { checkDraftsTool, submitDraftsTool } from "./submit-tools.js";

let io: FakeIo;
afterEach(() => io?.cleanup());

const READY = "01J0000000000000000000000A";
const MISSING = "01J0000000000000000000000B";
const DRAFTS: FakeSubmitDraft[] = [
  { id: READY, name: "@team/style", type: "rule", status: "draft" },
  {
    id: MISSING,
    name: "@team/notes",
    type: "rule",
    status: "draft",
    errors: [{ code: "schema", message: "description is required." }],
  },
];

const setup = () => {
  const registry = submitRoutes(DRAFTS);
  io = fakeIo(
    { ...identityRoutes("rmk_test_token"), ...registry.routes },
    { interactive: false, env: { RMK_TOKEN: "rmk_test_token", RMK_REGISTRY: REGISTRY } },
  );
  return registry;
};
const sent = () => io.requests.filter((r) => r.path === "/api/v1/drafts/submit");

describe("check_drafts and submit_drafts (052)", () => {
  it("checks without submitting, and says to ask the person first", async () => {
    setup();
    const result = await checkDraftsTool(io, { all: true });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Ready to submit (1):");
    expect(text).toContain("    - description is required.");
    expect(text).toContain("If they agree, call submit_drafts with the same items.");
    expect(result.structuredContent).toMatchObject({
      ready: [{ id: READY }],
      notReady: [{ id: MISSING }],
    });
    expect(sent()).toEqual([]);
  });

  it("submits only the ready ones, and says why the others weren't", async () => {
    const { submitted } = setup();
    const result = await submitDraftsTool(io, { items: ["@team/style", "@team/notes"] });
    expect(result.isError).toBeUndefined();
    expect(submitted).toEqual([READY]);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain(
      `@team/style: submitted for review (revision 1) at ${REGISTRY}/submissions/${READY}`,
    );
    expect(text).toContain("Not ready, so not submitted: @team/notes.");
  });

  it("submits nothing when nothing is ready, and needs items or all", async () => {
    setup();
    const nothing = await submitDraftsTool(io, { items: [MISSING] });
    expect(nothing.isError).toBe(true);
    expect(sent()).toEqual([]);
    expect((await checkDraftsTool(io, {})).structuredContent).toMatchObject({
      error: { code: "invalid_request" },
    });
    expect((await submitDraftsTool(io, { all: true, items: [READY] })).isError).toBe(true);
  });
});
