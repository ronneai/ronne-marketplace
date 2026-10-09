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

`packages.yml` is a called workflow (`workflow_call`, from `server-package.yml` and `release.yml`),
and a called workflow gets **no secrets unless its caller passes them**. Without that its sign-in
skipped itself on every run and the package tests kept pulling anonymously. So it declares
`DOCKERHUB_READ_TOKEN` under `workflow_call.secrets`, and both callers pass it by name (not
`secrets: inherit`, which would hand over every secret, the release token included). A skipped step
leaves no line in the log: check the job's steps (`gh api …/actions/jobs/<id> --jq '.steps'`).

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
