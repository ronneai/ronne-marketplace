#!/bin/sh
# After the files are in place (feature 085). A first install makes Ronne a service (083); an
# upgrade restarts it on the new files (the unit runs /opt/rmk-server, which doesn't move). A
# failure here only explains: the package stays installed, and the command to finish is printed.
# deb: $1 = configure; rpm: $1 = 1 (install) or 2 (upgrade).
rmk=/opt/rmk-server/bin/rmk-server

if [ ! -d /run/systemd/system ]; then
  echo "rmk-server: systemd isn't running here (a container or another init system), so no service was installed."
  echo "Start it with: rmk-server start --host 0.0.0.0   (data in ~/.local/share/rmk-server)"
  exit 0
fi

if [ -f /etc/rmk-server/service.json ]; then
  "$rmk" service restart ||
    echo "rmk-server: the service didn't restart on the new version. Its log: journalctl -u rmk-server"
else
  "$rmk" service install ||
    echo "rmk-server: the service isn't installed (see above). Finish with: sudo rmk-server service install [--port N] [--domain D]"
fi
exit 0
