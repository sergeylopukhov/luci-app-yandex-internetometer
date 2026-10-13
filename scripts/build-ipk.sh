#!/bin/sh
# Build one opkg package for one architecture.
# usage: scripts/build-ipk.sh <staged-root> <native-dir> <arch> <package-version> <output.ipk>
# The native engine for <arch> (from scripts/build-native.sh) is added when it exists;
# the package is always labelled with its real architecture, never "all".
set -eu
staged="$1"; native="$2"; arch="$3"; version="$4"; output="$5"
root="$(cd "$(dirname "$0")/.." && pwd)"
case "$arch" in all|noarch|'') echo "refusing architecture '$arch'" >&2; exit 1;; esac
work="$(mktemp -d)"
mkdir -p "$work/data" "$work/control"
cp -a "$staged/." "$work/data/"
if [ -f "$native/$arch/transfer-native" ]; then
	install -m 0755 "$native/$arch/transfer-native" "$work/data/usr/libexec/yandex-internetometer/transfer-native"
fi
cat > "$work/control/control" <<EOF
Package: luci-app-yandex-internetometer
Version: $version
Depends: libc, curl, jq
Source: https://github.com/sergeylopukhov/luci-app-yandex-internetometer
SourceName: luci-app-yandex-internetometer
License: MIT
Section: luci
URL: https://github.com/sergeylopukhov/luci-app-yandex-internetometer
Maintainer: Sergey Lopukhov <sergey.lopukhov@gmail.com>
Architecture: $arch
Description:  LuCI app for unofficial Yandex Internetometer-compatible speed tests
EOF
printf '%s\n' /etc/config/yandex-internetometer > "$work/control/conffiles"
install -m 0755 "$root/scripts/post-install" "$work/control/postinst"
install -m 0755 "$root/scripts/post-deinstall" "$work/control/postrm"
printf '2.0\n' > "$work/debian-binary"
# Files are owned by root inside the package (GNU tar on CI, bsdtar locally).
if tar --version 2>/dev/null | grep -q GNU; then owner='--owner=0 --group=0'; else owner='--uid 0 --gid 0'; fi
tar --numeric-owner $owner -czf "$work/data.tar.gz" -C "$work/data" .
tar --numeric-owner $owner -czf "$work/control.tar.gz" -C "$work/control" .
tar --numeric-owner $owner -czf "$output" -C "$work" ./debian-binary ./data.tar.gz ./control.tar.gz
trash "$work" 2>/dev/null || true
