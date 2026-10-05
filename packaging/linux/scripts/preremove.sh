#!/bin/sh
# Before the files go (feature 085): on removal, not on an upgrade, stop and remove the service
# and the accounts it made (083). The data and settings stay.
# deb: $1 = remove or upgrade; rpm: $1 = 0 (erase) or 1 (upgrade).
case "$1" in
  remove | 0)
    if [ -d /run/systemd/system ] && [ -x /opt/rmk-server/bin/rmk-server ]; then
      /opt/rmk-server/bin/rmk-server service uninstall || true
    fi
    ;;
esac
exit 0
