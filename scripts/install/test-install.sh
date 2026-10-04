#!/bin/sh
# Unit tests for install.sh's helpers (feature 081), run under dash and bash:
#   dash scripts/install/test-install.sh && bash scripts/install/test-install.sh
# The script is loaded without its last line, so main doesn't run.
here=$(cd "$(dirname "$0")" && pwd)
# The shell running this file, to run install.sh under the same one.
SHELL_UNDER_TEST=$(ps -o comm= -p $$ 2>/dev/null || echo sh)
SHELL_UNDER_TEST=${SHELL_UNDER_TEST##*/}
SHELL_UNDER_TEST=${SHELL_UNDER_TEST#-}
SHELL_UNDER_TEST=$(command -v "$SHELL_UNDER_TEST")
lib=$(mktemp)
work=$(mktemp -d)
trap 'rm -rf "$lib" "$work"' EXIT
sed '$d' "$here/install.sh" >"$lib"
# shellcheck source=/dev/null
. "$lib"

failures=0
check() { # check NAME EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then
    printf 'ok   %s\n' "$1"
  else
    printf 'FAIL %s: expected [%s], got [%s]\n' "$1" "$2" "$3"
    failures=$((failures + 1))
  fi
}

for c in "0.4.0 0.3.0 1" "0.3.0 0.4.0 -1" "1.0.0 1.0.0 0" "1.0.0-rc.1 1.0.0 -1" "1.0.0 1.0.0-rc.1 1" \
  "1.0.0-rc.2 1.0.0-rc.1 1" "0.10.0 0.9.9 1" "5.5.0 2.23.1 1" "2.23.0 2.23.1 -1"; do
  set -- $c
  check "version_cmp $1 $2" "$3" "$(version_cmp "$1" "$2")"
done

for d in ronne.example.com localhost a.b.co xn--bcher-kva.example; do
  check "valid_domain $d" yes "$(valid_domain "$d" && echo yes || echo no)"
done
for d in nodot 'bad_domain!' -x.example.com example.com. "a b.com" ""; do
  check "invalid domain [$d]" no "$(valid_domain "$d" && echo yes || echo no)"
done
check "valid_email" yes "$(valid_email ops@example.com && echo yes || echo no)"
check "invalid email" no "$(valid_email 'not an email' && echo yes || echo no)"

DIR="$work"
printf 'CUSTOM=1\nRONNE_PORT=7660\n' >"$DIR/.env"
env_set RONNE_PORT ""
env_set RONNE_IMAGE ronneai/marketplace:0.3.0
env_set RONNE_DOMAIN x.example.com
env_set RONNE_DOMAIN y.example.com
check "env_set keeps other lines and replaces keys" \
  "CUSTOM=1 RONNE_IMAGE=ronneai/marketplace:0.3.0 RONNE_DOMAIN=y.example.com" "$(tr '\n' ' ' <"$DIR/.env" | sed 's/ $//')"
check "env_get" y.example.com "$(env_get RONNE_DOMAIN)"
check "env_get missing" "" "$(env_get RONNE_TLS)"

RONNE_VERSION="@RONNE_VERSION@"
check "a repository copy isn't a release" no "$(is_release && echo yes || echo no)"
RONNE_VERSION="0.3.0"
check "a written-in version is a release" yes "$(is_release && echo yes || echo no)"

out=$(PATH=/nonexistent "$SHELL_UNDER_TEST" "$here/install.sh" --yes --dir "$work/x" 2>&1)
check "no docker exits 1" 1 "$?"
case "$out" in *"Docker isn't installed"*) msg=yes ;; *) msg=no ;; esac
check "no docker says so" yes "$msg"
out=$("$SHELL_UNDER_TEST" "$here/install.sh" --mode moon 2>&1)
check "a bad --mode exits 1" 1 "$?"
out=$("$SHELL_UNDER_TEST" "$here/install.sh" --dir 2>&1)
check "a flag without its value exits 1" 1 "$?"

[ "$failures" = 0 ] || {
  printf '%s failed\n' "$failures"
  exit 1
}
printf 'all passed\n'
