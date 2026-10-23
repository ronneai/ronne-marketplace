# Starting programs without a shell

CodeQL's `js/shell-command-injection-from-environment` flags a command line given to a shell
(`execSync`, `spawn` with `shell: true`) when any part of it comes from the environment, a file
name included: on #222 it flagged `server-probe.js`, whose Windows branch joined the data folder's
path (from `os.tmpdir()`) into one line for `cmd.exe`. It's a warning, so the CodeQL check still
passes, but the pull request gets an inline comment.

- **Pass the program and its arguments separately, with no shell:** `execFileSync(file, args)`,
  `spawn(file, args)`.
- **npm's `.cmd` shims on Windows only start through a shell** (Node refuses them otherwise). Run
  what the shim runs instead: `process.execPath` with the package's own entry file
  (`<prefix>/node_modules/<package>/<bin>`, beside the `.cmd` on `PATH`), as `server-probe.js` does.
- `rmk-server` itself opens the browser with `cmd.exe /c start "" <url>` through `spawn` with
  separate arguments and no shell option, and a URL built only from a parsed port: not flagged.
