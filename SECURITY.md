# Security policy

## Reporting a vulnerability

Please don't open a public issue for a security problem.

Report it privately through GitHub instead: go to the repository's **Security** tab and choose
**Report a vulnerability**. That opens a private advisory that only the maintainers can see.

Include what you found, how to reproduce it, and which version or commit you tested. We'll
acknowledge the report, keep you updated while we work on it, and credit you in the advisory
unless you'd rather stay anonymous.

## Supported versions

Security fixes go to `main` and come out in the next release. Only the latest release is supported:
upgrade to get a fix (see **Upgrade** under "After installing" in the install guide,
[docs/runbooks/install.md](docs/runbooks/install.md)).

## What Ronne defends against, and what to do when something goes wrong

- The [threat model](docs/security/threat-model.md): what an instance holds, who might attack it,
  what stops each threat today, and the known gaps.
- The [incident runbook](docs/runbooks/incident-response.md), for people running an instance: a
  harmful item version, a leaked token, a taken-over account, a leaked settings file or backup, a
  moderator acting against the rules, and a vulnerability in Ronne itself, with the commands for
  each way of installing.

## How we handle dependencies

Every dependency must have a license that allows free use and redistribution, be on a current
stable or LTS version, and have no known high or critical vulnerabilities. CI checks licenses and
advisories on every pull request. The full rules are in
[docs/policies/dependencies.md](docs/policies/dependencies.md).
