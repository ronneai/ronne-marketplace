# Knowledge

Lessons learned while building Ronne, one topic per note. Before writing code in an area a note
covers, read it and follow it. When a check fails for a reason the next person could avoid, add or
update a note in the same change, and list it here: `pnpm docs:check` fails when a note is missing
from this list.

## How the work is checked

- [state-witness.md](state-witness.md): how a task is checked by an agent that didn't do it before
  it's ticked, and the `WITNESS.md` record.
- [test-runs.md](test-runs.md): which tests run where (commits, pull requests, `main`, nightly,
  releases) and why the database tests stay.
- [skip-ci.md](skip-ci.md): the words that make GitHub skip every workflow, anywhere in a commit
  message.

## CI

- [ci-runner-and-mirror-stalls.md](ci-runner-and-mirror-stalls.md): jobs that hang before the tests
  start, and what to do.
- [docker-hub-pulls.md](docker-hub-pulls.md): Docker Hub's pull limit in CI, and how the jobs stay
  under it.
- [bundle-downloads.md](bundle-downloads.md): the bundle jobs' downloads from nodejs.org, and what to do
  when they fail.
- [image-security-updates.md](image-security-updates.md): Debian's security fixes and the image
  build cache, which keeps them out until the base digest moves.
- [caddy-proxy-image.md](caddy-proxy-image.md): why the proxy image's vulnerability scan keeps
  failing, and what to check before taking an exception.
- [dependabot-groups.md](dependabot-groups.md): one failing member blocks a Dependabot group, and
  how to get the rest in.
- [duplicate-codemirror-packages.md](duplicate-codemirror-packages.md): two copies of a CodeMirror
  package break the editor's pickers.

## CodeQL

- [codeql-regex.md](codeql-regex.md): regular expressions CodeQL flags as slow, and how to write
  them so it doesn't.
- [codeql-dom-text.md](codeql-dom-text.md): text from the page reaching a link's address.
- [codeql-logging.md](codeql-logging.md): logging anything read from the environment.
- [codeql-randomness.md](codeql-randomness.md): `Math.random()` values that reach something that
  looks like a secret.
- [codeql-shell.md](codeql-shell.md): starting programs without a shell.
- [codeql-tag-stripping.md](codeql-tag-stripping.md): stripping HTML tags with a regular
  expression.

## Database

- [collations.md](collations.md): MySQL and MariaDB compare text without case and accents; SQLite
  and PostgreSQL don't.
- [mysql-removed-functions.md](mysql-removed-functions.md): `SHA1()`, `SHA()` and `MD5()` are gone
  from MySQL 9.6.
- [timestamp-names.md](timestamp-names.md): timestamp columns end in `_at`, and nothing else does.
- [sort-needs-a-tiebreaker.md](sort-needs-a-tiebreaker.md): a sort by timestamp needs a second key.

## Tests

- [unit-tests-and-settings.md](unit-tests-and-settings.md): unit tests and this clone's settings
  file, which CI doesn't have.
- [better-auth-in-tests.md](better-auth-in-tests.md): Better Auth's schema check in tests that make
  many instances.
- [fake-timers.md](fake-timers.md): don't fake timers in a database test while it talks to the
  database.
- [unhandled-rejections.md](unhandled-rejections.md): expect a rejection before awaiting anything
  else.
- [turbo-test-inputs.md](turbo-test-inputs.md): a test that reads a file outside its package needs
  it as a Turborepo input.
- [e2e-open-contexts.md](e2e-open-contexts.md): end-to-end tests must close the contexts they open.
- [e2e-sign-in-limit.md](e2e-sign-in-limit.md): end-to-end tests and the sign-in rate limit.

## The web app

- [i18n.md](i18n.md): how the app's text is kept in three languages, and the glossary.
- [mobile-layout.md](mobile-layout.md): how to follow the phone and tablet rules, and check them.
- [dialog-sizes.md](dialog-sizes.md): the one scale of dialog sizes.
- [toasts.md](toasts.md): when and how to use a toast.
- [help-tips-and-paragraphs.md](help-tips-and-paragraphs.md): inline helpers can't go inside a
  paragraph.
- [server-client-props.md](server-client-props.md): what a server component can pass to a client
  component.
- [links-that-change-state.md](links-that-change-state.md): links that change something are a
  plain `<a>`, never `Link`.
- [redirects.md](redirects.md): redirect to a path, never an address built from `request.url`.
- [hot-reload-singletons.md](hot-reload-singletons.md): objects kept across hot reloads go stale.
- [dev-server-origins.md](dev-server-origins.md): opening `pnpm dev` from another address.

## Builds and tools

- [build-caches.md](build-caches.md): build caches that grow without end, and their limits.
- [skill-scanner.md](skill-scanner.md): how the security scan runs SkillSpector, and the rules
  Ronne follows.
