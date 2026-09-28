---
name: review-diff
description: Reviews the current git diff, or a given file or folder.
argument-hint: "[target]"
arguments:
  - target
disable-model-invocation: true
---
<!-- managed by rmk: @examples/review-diff@1.0.0 -->

Review the uncommitted changes in $target (or the whole `git diff` if no target is given).

List bugs and risky changes first, then anything unclear. Keep it short.
