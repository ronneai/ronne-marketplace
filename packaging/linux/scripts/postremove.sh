#!/bin/sh
# After removal (feature 085). The data is never deleted by the package: a maintainer script can't
# ask, so a purge says where the data is and how to delete it.
# deb: $1 = remove, purge or upgrade; rpm: $1 = 0 (erase) or 1 (upgrade).
case "$1" in
  purge | 0)
    if [ -d /var/lib/rmk-server ] || [ -d /etc/rmk-server ]; then
      echo "rmk-server: the data and settings are kept, in /var/lib/rmk-server and /etc/rmk-server"
      echo "(and the proxy's in /var/lib/rmk-server-proxy and /etc/rmk-server-proxy). To delete them:"
      echo "  sudo rm -rf /var/lib/rmk-server /etc/rmk-server /var/lib/rmk-server-proxy /etc/rmk-server-proxy"
    fi
    ;;
esac
exit 0
