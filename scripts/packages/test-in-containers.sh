#!/usr/bin/env bash
# Runs test-linux-package.sh (feature 085) for each distribution, each in a fresh container booted
# with systemd, on this machine's processor: Ubuntu 24.04 and Debian 13 with the .deb files, Fedora
# 42 with the .rpm files. Needs Docker able to run privileged containers (GitHub's Linux runners).
#   test-in-containers.sh <folder with the older packages> <folder with the newer ones>
set -euo pipefail

older=$(cd "$1" && pwd)
newer=$(cd "$2" && pwd)
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"; docker container rm --force rmk-package-test >/dev/null 2>&1 || true' EXIT

# Docker Hub fails now and then, on the token or on the image's manifest: a rate limit (429) or a
# server error (5xx), or the network to it. Only those are tried again, at most ATTEMPTS times in
# all, waiting WAIT seconds and then twice as long each time. Anything else, such as a package that
# won't install, fails at once with the build's output.
attempts=${RMK_BUILD_ATTEMPTS:-4}
wait_s=${RMK_BUILD_WAIT:-10}
transient='429 Too Many Requests|toomanyrequests|50[0234] (Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)|i/o timeout|TLS handshake timeout|connection reset by peer'

image() { # name base install-command
  cat >"$work/Dockerfile" <<EOF
FROM $2
RUN $3
CMD ["/sbin/init"]
EOF
  local attempt=1 delay=$wait_s log="$work/build.log" reason found
  until docker build -t "$1" "$work" >"$log" 2>&1; do
    # The first registry or network error in the output; none means it isn't one.
    reason=""
    if found=$(grep -Eo -m 1 "$transient" "$log"); then reason=${found%%$'\n'*}; fi
    if [ -z "$reason" ] || [ "$attempt" -ge "$attempts" ]; then
      cat "$log" >&2
      if [ -z "$reason" ]; then
        echo "✗ building $1 from $2 failed (not a registry or network error, so not tried again)" >&2
      else
        echo "✗ building $1 from $2 failed $attempt times: $reason" >&2
      fi
      return 1
    fi
    echo "… building $1 from $2: $reason; attempt $((attempt + 1)) of $attempts in ${delay}s" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}
image rmk-pkg-ubuntu ubuntu:24.04 "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq systemd systemd-sysv dbus curl ca-certificates >/dev/null"
image rmk-pkg-debian debian:13 "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq systemd systemd-sysv dbus curl ca-certificates >/dev/null"
image rmk-pkg-fedora fedora:42 "dnf install -y -q systemd dbus-broker curl >/dev/null && dnf clean all >/dev/null"

run() { # image older-file newer-file
  echo "== $1: $(basename "$2") → $(basename "$3")"
  docker run -d --name rmk-package-test --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
    --tmpfs /run --tmpfs /run/lock -v "$older:/older:ro" -v "$newer:/newer:ro" -v "$here:/s:ro" "$1" >/dev/null
  sleep 5
  docker exec rmk-package-test sh -c "cp '/older/$(basename "$2")' '/newer/$(basename "$3")' /tmp/ && sh /s/test-linux-package.sh '/tmp/$(basename "$2")' '/tmp/$(basename "$3")'"
  docker container rm --force rmk-package-test >/dev/null
}
deb_old=$(ls "$older"/*.deb)
deb_new=$(ls "$newer"/*.deb)
rpm_old=$(ls "$older"/*.rpm)
rpm_new=$(ls "$newer"/*.rpm)
run rmk-pkg-ubuntu "$deb_old" "$deb_new"
run rmk-pkg-debian "$deb_old" "$deb_new"
run rmk-pkg-fedora "$rpm_old" "$rpm_new"
echo "✓ the packages install, upgrade and remove on Ubuntu 24.04, Debian 13 and Fedora 42"
