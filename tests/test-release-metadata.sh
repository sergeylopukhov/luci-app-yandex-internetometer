#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

grep -q '^PKG_VERSION:=1.0.2$' "$ROOT/Makefile"
grep -q '^PKG_RELEASE:=1$' "$ROOT/Makefile"
[ "$(tr -d '\r\n' < "$ROOT/root/usr/share/yandex-internetometer/version")" = 1.0.2 ]
grep -q '^  PROJECT_VERSION: 1.0.2$' "$ROOT/.github/workflows/release.yml"
grep -q '^  PKG_VERSION: 1.0.2-r1$' "$ROOT/.github/workflows/release.yml"
grep -q "printf '1.0.2" "$ROOT/docs/install.sh"
grep -q '^## Версия 1.0.2$' "$ROOT/RELEASE_NOTES.md"

printf '%s\n' 'release metadata tests: ok'
