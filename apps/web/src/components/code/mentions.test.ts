import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import { type Mentions, mentionAt, mentionSource } from "./mentions";

describe("mentionAt (056)", () => {
  it("finds an @ at the start, after a space or a bracket, with what's typed after it", () => {
    expect(mentionAt("@")).toEqual({ offset: 0, query: "" });
    expect(mentionAt("Use @team/gi")).toEqual({ offset: 4, query: "team/gi" });
    expect(mentionAt("(see @gith")).toEqual({ offset: 5, query: "gith" });
  });

  it("ignores an email address, and a mention the cursor has left", () => {
    expect(mentionAt("mail a@b.c")).toBeNull();
    expect(mentionAt("@team/github and")).toBeNull();
  });
});

describe("mentionSource (056)", () => {
  const setup = () => {
    const mentions: Mentions = {
      find: vi.fn(async () => [{ name: "@team/github", detail: "mcp-server · published 1.4.0" }]),
      pick: vi.fn(),
    };
    return { mentions, source: mentionSource({ current: mentions }) };
  };
  const at = (doc: string) => {
    const state = EditorState.create({ doc });
    return new CompletionContext(state, doc.length, false);
  };

  it("offers the search's items from the @, and nothing outside a mention", async () => {
    const { mentions, source } = setup();
    const result = await source(at("Ask @team/gi"));
    expect(mentions.find).toHaveBeenCalledWith("team/gi");
    expect(result).toMatchObject({
      from: 4,
      filter: false,
      options: [{ label: "@team/github", detail: "mcp-server · published 1.4.0" }],
    });
    expect(await source(at("no mention here"))).toBeNull();
  });

  it("writes the name and tells the editor, which adds the dependency", async () => {
    const { mentions, source } = setup();
    const result = await source(at("Ask @team/gi"));
    const option = result?.options[0];
    const dispatch = vi.fn();
    const apply = option?.apply;
    if (typeof apply !== "function") throw new Error("expected an apply function");
    apply({ dispatch } as never, option as never, 4, 12);
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 4, to: 12, insert: "@team/github" },
      selection: { anchor: 16 },
    });
    expect(mentions.pick).toHaveBeenCalledWith("@team/github");
  });
});
