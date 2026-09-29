---
name: review-diff
description: Reviews the current git diff, or a given file or folder.
disable-model-invocation: true
---
<!-- managed by rmk: @examples/review-diff@1.0.0 -->

Review the uncommitted changes in {{target}} (or the whole `git diff` if no target is given).

List bugs and risky changes first, then anything unclear. Keep it short.

## Arguments

Where this text says `{{name}}`, use what the person gave with the command, or ask them:

- `target` (optional): File or folder to review. Defaults to the whole diff.
