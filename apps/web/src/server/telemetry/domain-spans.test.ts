import { afterEach, expect, it } from "vitest";
import { marketplace } from "../domains/feeds/services/plugin-feed";
import { releaseMany } from "../domains/submissions/services/bulk-release";
import { publishSubmission } from "../domains/submissions/services/publish";
import { postDraft } from "../http/drafts-api";
import { hooks, installHooks } from "./hooks";

// Each entry point opens its span (101), whatever happens inside it: here every one fails at once
// (no dependencies), and the span was still opened, with its name and attributes.
afterEach(() => installHooks(undefined));

it("opens ronne.release, ronne.feed.build and ronne.draft.upload", async () => {
  const opened: [string, Record<string, unknown>][] = [];
  installHooks({
    ...hooks(),
    inSpan: (name, attributes, work) => {
      opened.push([name, attributes]);
      return work();
    },
  });
  const none = {} as never;
  await publishSubmission(none, none, "id", none).catch(() => {});
  await releaseMany(none, none, none).catch(() => {});
  await marketplace(none, none, "claude-code", "https://r.example").catch(() => {});
  await postDraft(new Request("https://r.example/api/v1/drafts", { method: "POST" }), {}).catch(
    () => {},
  );
  expect(opened.map(([name]) => name)).toEqual([
    "ronne.release",
    "ronne.release",
    "ronne.feed.build",
    "ronne.draft.upload",
  ]);
  expect(opened[2]?.[1]).toEqual({ "ronne.tool": "claude-code" });
});
