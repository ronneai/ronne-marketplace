# Docker Hub pulls in CI

On 2026-10-09 most of CI's Docker jobs failed in seconds with `toomanyrequests: You have reached
your unauthenticated pull rate limit` or `429 Too Many Requests`: the database servers, our image's
`node` base, `shfmt`, and the Ubuntu, Debian and Fedora images the package tests run in. GitHub's
runners share addresses, so anonymous pulls share Docker Hub's anonymous limit with everyone else on
them. Re-running doesn't help for long, and re-running adds pulls of its own.

## How CI pulls now

Every job that pulls from Docker Hub signs in first, with a read-only token:

- **Repository secret `DOCKERHUB_READ_TOKEN`:** a Docker Hub personal access token with *Public Repo
  Read-only* access. Not the release token: that one can push, and lives in the `dockerhub`
  environment, which only `main` and `v*` tags can use.
- **Repository variable `DOCKERHUB_USERNAME`** (`ronneai`). The `dockerhub` environment has its own
  copy for `release.yml`; a job sees an environment's variables only when it runs in it.
- **The step** is `docker/login-action`, pinned as in `release.yml`, guarded by the job's
  `HAS_DOCKERHUB_TOKEN`, which holds only whether the secret exists, not the token. Pull requests
  from forks get no secrets, skip it, and pull anonymously, as before.

Jobs: `install-scripts.yml` (sh), `image.yml` (build, through `.github/actions/build-image`),
`packages.yml` (package), `database.yml` (test). `release.yml` signs in with its own token.

Each of them is also a called workflow (`workflow_call`): `packages.yml` from `server-package.yml`
and `release.yml`, and `database.yml`, `image.yml`, `install-scripts.yml` and `server-package.yml`
from `nightly.yml` (and some from `release.yml`). A called workflow gets **no secrets unless its
caller passes them**. Without that, `packages.yml`'s sign-in
skipped itself on every run and the package tests kept pulling anonymously. So each declares
`DOCKERHUB_READ_TOKEN` under `workflow_call.secrets`, and every caller passes it by name (not
`secrets: inherit`, which would hand over every secret, the release token included). A skipped step
leaves no line in the log: check the job's steps (`gh api …/actions/jobs/<id> --jq '.steps'`).

## The budget, shared by every job

Signed in, every job counts against **one** account: `ronneai`'s **200 pulls per 6 hours**
([Docker's limits](https://docs.docker.com/docker-hub/usage/pulls/)), whatever runner it's on. A
pull is a manifest request, so each image a fresh runner uses counts, layers cached or not. On
2026-10-09 every push pulled about 16–18 images (all of the suites below, on both architectures),
so about six pushes and their merges used up the 6 hours, and CI failed with 429 until the window
moved on.

| Suite | Images | Pulls a run | Runs on |
|---|---|---|---|
| `database.yml` | postgres, mysql, mariadb | 3 | pull requests (not drafts), `main`, nightly, weekly, releases |
| `image.yml` | the node base, Trivy, Caddy (scan and compose probe) | 3–4 per architecture | pull requests that change the image (amd64), `main`, nightly, releases (both) |
| `packages.yml` | Ubuntu, Debian, Fedora | 3 per architecture, more on retries | pull requests that change the server, nightly, releases |
| `install-scripts.yml` | shfmt | 1 | pull requests that change the scripts, nightly, releases |

So an ordinary pull request push (app code, not a draft) pulls **3**, and a draft none. Nightly
pulls about 18 once a day. Which suite runs when: [test-runs.md](test-runs.md).

**A new job that pulls from Docker Hub** runs where it's needed, not on every push: scoped through
`changes.yml` (`ci-scope.js`), skipped on drafts, and run nightly and in releases. Add its pulls to
the table.

## Checking the limits

`pnpm docker:limits` asks Docker Hub how many pulls are left: anonymously, counted for this
machine's address, and signed in, counted for the account, when you give it a token
(`DOCKERHUB_TOKEN`, or typed at its hidden prompt; Enter skips). It looks up
`ratelimitpreview/test`, which doesn't use a pull, and reads `ratelimit-limit`,
`ratelimit-remaining` and `docker-ratelimit-source`. A reached limit is HTTP 429; a 5xx or no answer
is Docker Hub failing, not a limit; a 401 is a wrong or revoked token. A runner's anonymous limit
is its own address's, which this machine can't see.

## Retries in the package tests

Signing in doesn't stop Docker Hub failing on its own side: on 2026-10-09 it also answered
`500 Internal Server Error` on `auth.docker.io/token` and on manifests, for signed-in pulls too.
`scripts/packages/test-in-containers.sh` builds each distribution's image up to 4 times when the
build's output shows a registry or network error (429, 500, 502, 503, 504, a timeout, a reset),
waiting 10, 20 and 40 seconds. Any other failure, such as a package that won't install, fails at
once and prints the build's output, which `docker build -q` used to hide. `RMK_BUILD_ATTEMPTS` and
`RMK_BUILD_WAIT` change the attempts and the first wait, for testing.

## When you add a job that pulls an image

A `docker run`, `docker build`, `docker compose` or a `FROM` pulls from Docker Hub unless the image
names another registry. Add the same flag and step before the first pull. A step that runs before
`actions/checkout` can't use a local action, so the step is written out in each job rather than
shared. A service container or a job's `container:` starts before any step, so a step can't sign it
in: give it `credentials` (`username: ${{ vars.DOCKERHUB_USERNAME }}`, `password: ${{
secrets.DOCKERHUB_READ_TOKEN }}`) instead.
