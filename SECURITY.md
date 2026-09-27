# Security policy

## Reporting a vulnerability

Please don't open a public issue for a security problem.

Report it privately through GitHub instead: go to the repository's **Security** tab and choose
**Report a vulnerability**. That opens a private advisory that only the maintainers can see.

Include what you found, how to reproduce it, and which version or commit you tested. We'll
acknowledge the report, keep you updated while we work on it, and credit you in the advisory
unless you'd rather stay anonymous.

## Supported versions

Ronne is in early development and has no releases yet. Security fixes go to the `main` branch.

## How we handle dependencies

Every dependency must have a license that allows free use and redistribution, be on a current
stable or LTS version, and have no known high or critical vulnerabilities. CI checks licenses and
advisories on every pull request. The full rules are in
[docs/policies/dependencies.md](docs/policies/dependencies.md).
