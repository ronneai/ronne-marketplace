# Bundles and nodejs.org

Each bundle job (`server-package.yml`, feature 084) runs `packages/repo-tools/src/bundle.js`, which
downloads from nodejs.org: `index.json` (which 24 is newest), `SHASUMS256.txt` and the platform's
Node.js archive. Six jobs on six runners do that in every release, every nightly and every pull
request that changes the server package.

On 2026-10-10 the first nightly failed on one of them, darwin-x64, with nothing but
`bundle: fetch failed` after ten seconds (Node's time limit to connect). The other five reached
nodejs.org in the same run, and re-running the failed jobs passed. The runner couldn't reach
nodejs.org for a moment.

## What the script does about it

- **`getRetrying` tries each download up to three times** (`FETCH_ATTEMPTS`), 2 and then 4 seconds
  apart, after a network error, a 5xx or a 429, and when the body breaks halfway. Another answer,
  such as a 404 for a version that doesn't exist, fails at once: it would say the same again.
- **It says why.** fetch puts the reason in the error's `cause` (`UND_ERR_CONNECT_TIMEOUT`,
  `ECONNRESET`, `ENOTFOUND`…); `errorText` prints it, on each retry and at the end.
- The SHA-256 check against `SHASUMS256.txt` is unchanged: a retry never accepts other bytes.

## If it still fails

Read the reason in the log. A cause on every try, on one runner only, is that runner's network:
re-run the failed jobs. The same answer from every runner (a 404, a version nodejs.org doesn't list)
is a real problem with what's asked for.
