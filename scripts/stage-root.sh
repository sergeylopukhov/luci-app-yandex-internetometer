#!/bin/sh
# Stage the architecture-independent package files.
# usage: scripts/stage-root.sh <output-dir>
set -eu
out="${1:?output directory}"
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$out/www"
cp -a "$root/root/." "$out/"
cp -a "$root/htdocs/." "$out/www/"
find "$out" -name .DS_Store -exec trash {} + 2>/dev/null || find "$out" -name .DS_Store -delete
mkdir -p "$out/usr/lib/lua/luci/i18n"
python3 "$root/scripts/po2lmo.py" "$root/po/ru/yandex-internetometer.po" "$out/usr/lib/lua/luci/i18n/yandex-internetometer.ru.lmo"
test -x "$out/usr/libexec/yandex-internetometer/transfer"
test -x "$out/usr/libexec/yandex-internetometer/migrate-settings"
