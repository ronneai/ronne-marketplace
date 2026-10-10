# Logging what came from the environment

CodeQL's `js/clear-text-logging` (high) fails a pull request when anything read from
`process.env` reaches `console.log` or a thrown message, even part of a longer string, and even a
value that isn't secret: on #160 it flagged `pnpm docker:limits` printing "signed in as <name>",
where the name came from `DOCKERHUB_USERNAME`. It follows the value through function arguments, so
passing it as a label to a helper that logs doesn't help.

- **Don't print environment values.** Print a fixed label ("signed in"), and let the other side say
  who it was when that's useful (Docker Hub's `docker-ratelimit-source` names the account).
- **A secret never goes near a log or an error message,** however it's built.
- A prompt written to `process.stderr` with the value in it wasn't flagged; a `console.log` of the
  same value was.
