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

## When you add a job that pulls an image

A `docker run`, `docker build`, `docker compose` or a `FROM` pulls from Docker Hub unless the image
names another registry. Add the same flag and step before the first pull. A step that runs before
`actions/checkout` can't use a local action, so the step is written out in each job rather than
shared. A service container or a job's `container:` starts before any step, so a step can't sign it
in: give it `credentials` (`username: ${{ vars.DOCKERHUB_USERNAME }}`, `password: ${{
secrets.DOCKERHUB_READ_TOKEN }}`) instead.
