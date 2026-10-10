# Which tests run where

The checks had grown slow: on a pull request the MySQL job took about 9 minutes and the
end-to-end job about 6. The owner asked for checks that run what a change needs, without
redundancy (2026-10-08). Feature 112 did that (tasks 10–13): on its own pull request (#150), with
every database test running, MySQL took 4.8 minutes and the end-to-end check 4.0. Read this before adding a database
test, an end-to-end test, or a CI job, and keep the table below current when you do.

## The three kinds of test

| Kind | Where it runs | What it's for |
|---|---|---|
| Unit and component tests (`pnpm test`) | Node, jsdom, and **SQLite in memory** for the `db` project | Every rule and screen, fast. All of them run on every commit and in CI |
| Database tests (`*.db.test.ts`, `pnpm test:db`) | SQLite in `pnpm test`; **PostgreSQL, MySQL and MariaDB** in `database.yml` and `pnpm test:db:<server>` | Dialect differences (SQLite accepts what the servers refuse), locks, transactions, and the edge cases a browser never reaches |
| End-to-end (`pnpm test:e2e`) | A production build against a throwaway **SQLite** instance, in Chromium, phones (also WebKit) and a tablet | That the pieces work together on every screen |

**Why database tests stay** although the end-to-end tests cover the same flows: the end-to-end
tests only ever run on SQLite, so they can't catch a query PostgreSQL or MySQL refuses, and they
walk the happy path of a few flows, where the database tests hold hundreds of edge cases (two
releases at once, a yanked dependency, a cycle) at a fraction of the cost.

## What runs where (CI)

On 2026-10-09 a day of pushes and pull requests used up Docker Hub's pulls (see
[docker-hub-pulls.md](docker-hub-pulls.md)), and every push started about 35 jobs. So a pull
request now runs what its change can break. The suites a change rarely touches run when their files
change, every night on `main` (`nightly.yml`), and in every release run (`release.yml`, the dry
run included), so a release is checked as fully as before.

| Suite | Draft pull request | Pull request | Push to `main` | Nightly | Release |
|---|---|---|---|---|---|
| `ci.yml`: lint, typecheck, tests, build; witness; licenses and audit | ✓ | ✓ | ✓ | licenses and audit | ✓ |
| CodeQL | ✓ | ✓ | ✓ | weekly | — |
| End-to-end, two halves (`e2e.yml`) | — | ✓ | ✓ | ✓ | ✓ |
| Database servers (`database.yml`) | — | the scope below | all | all | all |
| Docker image (`image.yml`) | — | amd64, when its files change | both architectures | both, scanned | both |
| Server package (`server-package.yml`: install, services, bundles, `.deb`/`.rpm`) | — | when its files change | — | ✓ | ✓ |
| Install scripts (`install-scripts.yml`) | — | when they change | — | ✓ | ✓ |

- **Drafts** run only the light checks (`changes.yml`'s `full`). Marking one ready for review
  (`ready_for_review`) runs the rest, and so does every push after that. Open a pull request as a
  draft while you're still pushing to it.
- **"When its files change"** is `packages/repo-tools/src/ci-scope.js`, through `changes.yml`'s
  `image`, `server` and `install` outputs:
  - the image: the `Dockerfile`, `.dockerignore`, `compose.yaml`, `docker/`, the build-image
    action, the web app's `next.config` and `scripts/`, and `scripts/install/` (the image job runs
    install.sh against it);
  - the server package: `packages/server/`, `packaging/`, `scripts/service/`,
    `scripts/packages/`, its scripts in `packages/repo-tools`, and its workflows;
  - the install scripts: `scripts/install/` and their tools.

  The dependencies, `.nvmrc` and the detection itself run all three, and so does an empty list.
  The app's own code doesn't run them: `ci.yml` builds the same standalone output on every pull
  request, and `release:smoke` starts the packed `rmk-server`.
- **Required checks still report**: each suite's check (`Docker image (build, run, scan)`,
  `Server package`, `Install scripts`, `End-to-end (Chromium)`, `Database tests (…)`) passes when
  its jobs were skipped, as for a documentation-only pull request.
- **Node 22** runs the tests and the build; lint, typecheck, `build:server`, `packages:check` and
  `release:smoke` run once, on Node 24. `server-package.yml` installs the packed server on both.

Before a release, last night's Nightly is green, and the dry run runs every suite
([release.md](../runbooks/release.md)). A suite that fails only there gets fixed on `main`, then the
dry run again.

## On a pull request (CI)

- **ci.yml:** lint, typecheck, every unit, component and database test on SQLite, and the build:
  the tests and the build on Node 22 and 24, the rest on Node 24.
- **database.yml:** the servers run **`pnpm test:db:core`**, the tests of the database code
  itself (`src/server/db/`, migrations, repositories, `src/server/setup/`, `scripts/`: 33 of the
  86 files; 29 of them took 44 s on MySQL, against about 105 s for all 86 after task 10). They run **every** database test when the
  pull request changes database code: the rule is `packages/repo-tools/src/db-scope.js`, and
  `changes.yml`'s `database` output carries it. Database code is those paths, any `*.db.test.ts`,
  any changed file that queries the database (`from "kysely"`, `` sql` ``, `.selectFrom(` …)
  or a deleted code file, the dependencies, and what runs the database tests. Anything the rule
  can't tell runs everything.
- **End-to-end** (`e2e.yml`): two jobs in parallel, `pnpm test:e2e --shard=1/2` and `--shard=2/2`, each with
  its own build and instance. The required check "End-to-end (Chromium)" is a small job that passes
  when both halves did. Locally the halves took 1.6 and 1.1 min.
- Documentation-only pull requests skip all of it (`docs-only.js`); the required checks still report.

Pushes to `main`, the nightly and weekly runs, releases and manual runs run **every** database test
on every server.

## While working

- `pnpm test` runs on SQLite, every time (the pre-commit hook runs it).
- Run the servers (`pnpm test:db:up`, then `pnpm test:db:postgres` / `:mysql` / `:mariadb`) only
  for changes to database code, and only the test files that change touches:
  `pnpm test:db:mysql -- src/server/domains/items/`. Run every file when you change the database
  code itself (`db/`, a migration, a repository) or `createTestDb()`.
- A witness checking a task gets the relevant test files, not the full suites.

## How a database test gets its database

On a server, `createTestDb()` (`apps/web/src/server/db/testing/test-db.ts`) migrates **one
database per test file** and puts it back to just migrated before each test: every table emptied
and the migrations' own rows put back, on new connections, and migrated afresh when a test changed
the schema (tables, columns, indexes, constraints, triggers or the database's settings). On MySQL
that took the full run from about 450 s to about 105 s. What follows from it:

- **End every transaction a test starts.** One left open holds its connection and its locks. The
  next test then gets a newly migrated database, and on PostgreSQL the held one is left, named on
  stderr, for the next run to drop.
- **Two `createTestDb()` calls in one test share one database**, and the second empties it and
  closes the first one's pool (a handle from `beforeAll` too). A test that needs two at once, or
  one for the whole file, asks for `{ fresh: true }`; migration tests ask for `{ migrate: false }`.
  Both get a database of their own, which `cleanup()` drops.
- Shared databases are dropped after their file. An interrupted run leaves its databases behind:
  the next run's global setup (`db-global-setup.ts`) drops the `ronne_test_*` ones older than two
  hours.
