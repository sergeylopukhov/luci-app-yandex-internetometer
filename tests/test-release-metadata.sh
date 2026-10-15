#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

grep -q '^PKG_VERSION:=2.1.11$' "$ROOT/Makefile"
grep -q '^PKG_RELEASE:=1$' "$ROOT/Makefile"
[ "$(tr -d '\r\n' < "$ROOT/root/usr/share/yandex-internetometer/version")" = 2.1.11 ]
grep -q '^  PROJECT_VERSION: 2.1.11$' "$ROOT/.github/workflows/release.yml"
grep -q '^  PKG_VERSION: 2.1.11-r1$' "$ROOT/.github/workflows/release.yml"
grep -q "printf '2.1.11" "$ROOT/docs/install.sh"
grep -q '^## Версия 2.1.11$' "$ROOT/RELEASE_NOTES.md"
test -x "$ROOT/root/usr/libexec/yandex-internetometer/transfer"
test -x "$ROOT/root/usr/libexec/yandex-internetometer/migrate-settings"

# Architecture-specific binaries are never published as all/noarch.
! grep -q 'arch:noarch\|Architecture: all\|-all\.ipk' "$ROOT/.github/workflows/release.yml"
grep -q 'openwrt-24.10-$ARCH.ipk' "$ROOT/docs/install.sh"
# CI updates the published metadata only after release; both states must pass.
jq -e '(.version == "2.1.1" or .version == "2.1.11") and
    .package_version == (.version + "-r1") and .tag == ("v" + .version)' "$ROOT/docs/version.json" >/dev/null

printf '%s\n' 'release metadata tests: ok'
