#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

grep -q '^PKG_VERSION:=2.0.0$' "$ROOT/Makefile"
grep -q '^PKG_RELEASE:=1$' "$ROOT/Makefile"
[ "$(tr -d '\r\n' < "$ROOT/root/usr/share/yandex-internetometer/version")" = 2.0.0 ]
grep -q '^  PROJECT_VERSION: 2.0.0$' "$ROOT/.github/workflows/release.yml"
grep -q '^  PKG_VERSION: 2.0.0-r1$' "$ROOT/.github/workflows/release.yml"
grep -q "printf '2.0.0" "$ROOT/docs/install.sh"
grep -q '^## Версия 2.0.0$' "$ROOT/RELEASE_NOTES.md"
test -x "$ROOT/root/usr/libexec/yandex-internetometer/transfer"
test -x "$ROOT/root/usr/libexec/yandex-internetometer/migrate-settings"

# Architecture-specific binaries are never published as all/noarch.
! grep -q 'arch:noarch\|Architecture: all\|-all\.ipk' "$ROOT/.github/workflows/release.yml"
grep -q 'openwrt-24.10-$ARCH.ipk' "$ROOT/docs/install.sh"
# The published metadata only changes when the release is really published by CI.
jq -e '.version == "1.1.2" and .package_version == "1.1.2-r1"' "$ROOT/docs/version.json" >/dev/null

printf '%s\n' 'release metadata tests: ok'
