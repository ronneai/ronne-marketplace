#!/bin/sh
# Before the files go (feature 085): on removal, not on an upgrade, stop and remove the service
# and the accounts it made (083). The data and settings stay.
# deb: $1 = remove or upgrade; rpm: $1 = 0 (erase) or 1 (upgrade).
rmk=/opt/rmk-server/bin/rmk-server

# dnf cuts each line a package script prints at 80 columns, its ">>> " prefix included, so every
# line here fits in 76: the echoes are written short, and rmk-server's messages are folded at spaces.
wrapped() {
  out=$(mktemp) || {
    "$@"
    return
  }
  "$@" >"$out" 2>&1
  status=$?
  fold -s -w 76 "$out"
  rm -f "$out"
  return "$status"
}

case "$1" in
  remove | 0)
    if [ -d /run/systemd/system ] && [ -x "$rmk" ]; then
      wrapped "$rmk" service uninstall || true
    fi
    ;;
esac
exit 0
