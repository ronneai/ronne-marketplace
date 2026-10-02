"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yamlLanguage } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { languageFor } from "./languages";
import { type Mentions, mentionExtension } from "./mentions";

/** 032's tokens, so the editor follows the light and dark themes: teal is the only accent. */
const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--surface)",
    color: "var(--fg)",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--fg)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--fg)" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--muted)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--tint)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  ".cm-matchingBracket": { outline: "1px solid var(--accent)", backgroundColor: "transparent" },
  // The `@` list (056): a flat panel on the surface, the picked option on the tint.
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete > ul > li": { padding: "4px 8px", color: "var(--fg)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--tint)",
    color: "var(--fg)",
  },
  ".cm-completionDetail": { color: "var(--muted)", fontStyle: "normal", marginLeft: "8px" },
});

/**
 * GitHub's syntax colours (Primer), through 032's tokens so both themes follow: grey comments,
 * green keys, blue strings and constants, purple keywords (044).
 */
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.definitionKeyword, tags.moduleKeyword, tags.controlKeyword],
    color: "var(--syntax-keyword)",
  },
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName), tags.attributeName],
    color: "var(--syntax-key)",
  },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syntax-string)" },
  { tag: [tags.comment, tags.meta], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.heading], fontWeight: "700", color: "var(--syntax-constant)" },
  { tag: [tags.emphasis], fontStyle: "italic" },
  { tag: [tags.strong], fontWeight: "700" },
  { tag: [tags.link, tags.url], color: "var(--link)", textDecoration: "underline" },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.labelName, tags.typeName],
    color: "var(--syntax-constant)",
  },
]);

/** In YAML, a plain value is a string too, as GitHub shows it; elsewhere `content` is prose. */
const yamlValues = HighlightStyle.define([{ tag: tags.content, color: "var(--syntax-string)" }], {
  scope: yamlLanguage,
});

/** Markdown files, where `@` mentions an item to depend on (056). */
const isMarkdown = (path: string) => /\.(md|mdx|markdown)$/i.test(path);

const stateFor = (
  path: string,
  doc: string,
  onChange: (content: string) => void,
  readOnly: boolean,
  mentions: { current: Mentions | null },
) =>
  EditorState.create({
    doc,
    extensions: [
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      syntaxHighlighting(highlight),
      syntaxHighlighting(yamlValues),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping,
      languageFor(path, doc),
      theme,
      EditorView.contentAttributes.of({ "aria-label": `Contents of ${path}` }),
      ...(isMarkdown(path) && !readOnly ? [mentionExtension(mentions)] : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
    ],
  });

/**
 * CodeMirror 6 for one text file (feature 012), used directly without a React wrapper. Each file
 * keeps its own state, so undo history survives switching files. When `value` changes from outside
 * (the manifest form, an import), the document follows as one undoable change.
 */
export const CodeEditor = ({
  path,
  value,
  onChange,
  goToLine,
  readOnly = false,
  mentions = null,
}: {
  path: string;
  value: string;
  onChange: (path: string, content: string) => void;
  /** Moves the cursor to a line when it changes, such as from a validation issue. */
  goToLine?: { line: number; at: number } | null;
  /** Shown but not editable, such as a submitted submission (feature 013). */
  readOnly?: boolean;
  /** `@` in markdown files: the items to mention, and what a pick does (056). */
  mentions?: Mentions | null;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const change = useRef(onChange);
  change.current = onChange;
  // Read when the list opens, so a file's cached state keeps working as the draft changes.
  const mentioning = useRef(mentions);
  mentioning.current = mentions;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({ parent: host.current });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  // `value` is only the starting document when a file opens; the next effect follows changes.
  const latest = useRef(value);
  latest.current = value;
  // Fixed for a page: a submission's status changes by reloading it.
  const locked = useRef(readOnly);
  locked.current = readOnly;

  // Switching files: keep the old file's state, restore or create the new one's.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const saved = states.current.get(path);
    editor.setState(
      saved ??
        stateFor(
          path,
          latest.current,
          (content) => change.current(path, content),
          locked.current,
          mentioning,
        ),
    );
    return () => {
      states.current.set(path, editor.state);
    };
  }, [path]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc;
    if (current.length === value.length && current.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || !goToLine) return;
    const line = editor.state.doc.line(
      Math.min(Math.max(goToLine.line, 1), editor.state.doc.lines),
    );
    editor.dispatch({ selection: EditorSelection.cursor(line.from), scrollIntoView: true });
    editor.focus();
  }, [goToLine]);

  return <div ref={host} className="h-full min-h-80 overflow-hidden" />;
};
