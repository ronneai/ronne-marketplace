#!/bin/sh
# managed by rmk: @examples/git-branch@1.0.0
# Reads the platform's status JSON on stdin (unused here) and prints one line.
cat > /dev/null
branch=$(git branch --show-current 2>/dev/null)
printf '%s%s\n' "$(basename "$PWD")" "${branch:+ · $branch}"
