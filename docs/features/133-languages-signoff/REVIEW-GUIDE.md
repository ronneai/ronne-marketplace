# Reading the Portuguese and French (feature 133)

For the two native readers: one of Brazilian Portuguese (pt-BR), one of Canadian French (fr-CA).
You do not need to run the app or read code. You read, and you say what is wrong.

## What you get

Run `pnpm i18n:review` (or ask the owner to). It writes `docs/features/133-languages-signoff/review/`,
one **Markdown** file and one **CSV** per area (`shell`, `common`, `home`, `auth`, `account`,
`catalogue`, `item`, `author`, `workspaces`, `admin`, `help`, `errors`, `types`, `shelves`,
`feedback`): about 2,750 messages in all. Each row is a message: its key, the English, the
Portuguese and the French. The Markdown opens in any editor or on GitHub; the CSV opens in a
spreadsheet. The folder is git-ignored and generated: a correction is made in the message file
(`apps/web/messages/<language>/<area>.json`) by the owner or by us, never in the export.

Read in this order, the most seen first: `shell`, `common`, `home`, `auth`, `account`, `catalogue`,
`item`, `author`, `workspaces`, `shelves`, `feedback`, `admin`, `help`, `errors`, `types`.

The same folder holds two more files. `GLOSSARY.md` is the table of words held the same
everywhere (a copy of the glossary in [`docs/knowledge/i18n.md`](../../knowledge/i18n.md)).
`WEBSITE.md` is the second part: the address of every Documentation page on the website in
Portuguese and in French (35 topics), to read in the browser, with the home and marketplace texts
in `ronne-web/www/messages/pt.json` and `fr.json`. The website has its own guide, in the
`ronne-web` repository: `docs/translation-guide.md`.

## What to look for

- **Does it read like a person wrote it,** in your language, for a developer or an administrator?
  Not a word-for-word copy of the English.
- **Is the meaning the same?** Nothing stronger, nothing weaker ("planned" stays planned).
- **The register.** Portuguese: "você", Brazilian words (arquivo, tela, time). French: "vous",
  Canadian words (courriel, téléverser, fin de ligne), not France-isms.
- **The same word for the same thing,** everywhere. The glossary is in
  [`docs/knowledge/i18n.md`](../../knowledge/i18n.md) (workspace = espaço de trabalho / espace de
  travail, scope = escopo / portée, review = revisão / révision, change proposal = proposta de
  alteração / proposition de modification, and so on; the whole table is `GLOSSARY.md`). If you
  think a glossary word is wrong, say so once: it then changes everywhere.
- **Length.** A button or a tab that is much longer than the English may not fit on a phone.
- **Spelling, accents, agreement, punctuation.** French: a space before `:` and none before
  `?` `!` `;`, « guillemets » with spaces inside. Portuguese: no space before `:` `?` `!`.

## What to leave alone

- The parts of a message in `{braces}` or `<tags>`: they are filled in by the program
  (`{count, plural, one {…} other {…}}` is a plural: check that the words in each branch read well).
- Names that stay in English: Ronne AI Marketplace, `rmk`, MCP, Claude Code, Codex, Cursor, commands
  and file names, item type names where `rmk` prints them.
- Text the server or a provider writes (shown in English on purpose): the owner has the list.

## How to send what you find

Add a row to `REVIEW.md` in this folder, or send a list with these columns (a spreadsheet is fine):

| Language | Key | Now | Suggested | Why (optional) |
|---|---|---|---|---|

For a thing that repeats ("the word X should be Y everywhere"), one row is enough: say so, and we
find the rest. Mark a row **question** if you are not sure and want the owner to decide.

Every row ends up **done** (the message changed), **kept** (we explain why) or **moved** (it is about
the glossary or the website, and goes there). `REVIEW.md` records which.
