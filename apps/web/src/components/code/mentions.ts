import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

/**
 * `@` mentions in a markdown file (056): typing `@` and part of an item's name opens a list of
 * items to depend on; picking one writes `@scope/name` in the text and tells the editor, which adds
 * the dependency to ronne.yaml. The list comes from `find`, the server's dependency search.
 */
export type Mention = { name: string; detail: string };

export type Mentions = {
  find: (query: string) => Promise<Mention[]>;
  pick: (name: string) => void;
};

/**
 * What's being mentioned at the cursor: an `@` at the start of the line or after a space or an
 * opening bracket, then the name typed so far. Null when the cursor isn't in a mention, so an
 * email address (`a@b.c`) never opens the list.
 */
export const mentionAt = (lineBefore: string): { offset: number; query: string } | null => {
  const match = /(^|[\s([{"'`])@([\w.-]*\/?[\w.-]*)$/.exec(lineBefore);
  if (!match) return null;
  const query = match[2] ?? "";
  return { offset: lineBefore.length - query.length - 1, query };
};

/** The completion source over `mentions` (read through a ref, so the editor's state can stay). */
export const mentionSource =
  (mentions: { current: Mentions | null }) =>
  async (context: CompletionContext): Promise<CompletionResult | null> => {
    const current = mentions.current;
    if (!current) return null;
    const line = context.state.doc.lineAt(context.pos);
    const found = mentionAt(line.text.slice(0, context.pos - line.from));
    if (!found) return null;
    const from = line.from + found.offset;
    const options = await current.find(found.query);
    if (context.aborted) return null;
    return {
      from,
      filter: false,
      options: options.map(
        (option): Completion => ({
          label: option.name,
          detail: option.detail,
          apply: (view, _completion, start, end) => {
            view.dispatch({
              changes: { from: start, to: end, insert: option.name },
              selection: { anchor: start + option.name.length },
            });
            current.pick(option.name);
          },
        }),
      ),
    };
  };

/** The editor extension: the list opens as you type a mention; ↑/↓ and Enter pick, Esc closes. */
export const mentionExtension = (mentions: { current: Mentions | null }): Extension =>
  autocompletion({
    override: [mentionSource(mentions)],
    activateOnTyping: true,
    icons: false,
  });
