#!/bin/sh
# Settings migration: upgrade values, backup, marker after commit, idempotence, history.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
migrate="$root/root/usr/libexec/yandex-internetometer/migrate-settings"
work="$(mktemp -d)"; trap 'trash "$work" 2>/dev/null || true' EXIT
mkdir -p "$work/bin"; cp "$root/tests/fake-uci" "$work/bin/uci"; chmod 755 "$work/bin/uci"
export PATH="$work/bin:$PATH"; cases=0
fail() { echo "migration test failed: $*" >&2; exit 1; }
setup() { cases=$((cases + 1)); export UCI_DIR="$work/uci.$cases"; mkdir -p "$UCI_DIR"; printf '%s\n' "$@" > "$UCI_DIR/committed"; }
val() { awk -F= -v k="yandex-internetometer.$1" '$1==k{print substr($0,length(k)+2)}' "$UCI_DIR/committed"; }
expect() { [ "$(val "$1")" = "$2" ] || fail "$1 is '$(val "$1")', expected '$2' ($3)"; }
# Uncommitted uci changes do not survive a reboot.
reboot() { echo $(( $(cat "$UCI_DIR/boot" 2>/dev/null || echo 0) + 1 )) > "$UCI_DIR/boot"; echo 0 > "$UCI_DIR/commits"; }

legacy="yandex-internetometer.main=settings
yandex-internetometer.main.streams=auto
yandex-internetometer.main.upload_streams=auto
yandex-internetometer.main.download_time=15
yandex-internetometer.main.upload_time=25
yandex-internetometer.main.upload_size=8000000
yandex-internetometer.main.upload_enabled=1
yandex-internetometer.main.transfer_protocol=auto
yandex-internetometer.main.latency_samples=60
yandex-internetometer.main.debug=1"

# 1. Upgrade from 1.1.2 defaults: new durations, marker, backup; unrelated options kept.
setup $legacy
sh "$migrate"
expect main.download_time 10 'old default'; expect main.upload_time 10 'old default'
expect main.settings_version 2 marker; expect main.debug 1 'unrelated option'
expect previous.download_time 15 backup; expect previous.upload_time 25 backup; expect previous.from_settings_version 0 backup

# 2. Custom performance values become automatic, custom durations are kept, all backed up.
setup yandex-internetometer.main=settings yandex-internetometer.main.streams=2 yandex-internetometer.main.upload_streams=8 \
  yandex-internetometer.main.transfer_protocol=https yandex-internetometer.main.download_time=30 yandex-internetometer.main.upload_time=20
sh "$migrate"
expect main.streams auto custom; expect main.upload_streams auto custom; expect main.transfer_protocol auto custom
expect main.download_time 30 'user duration'; expect main.upload_time 20 'user duration'
expect previous.streams 2 backup; expect previous.upload_streams 8 backup; expect previous.transfer_protocol https backup

# 3. Reinstalling the same version never resets what the user changed afterwards.
uci set yandex-internetometer.main.streams=6; uci set yandex-internetometer.main.upload_time=25; uci commit yandex-internetometer
sh "$migrate"; sh "$migrate"
expect main.streams 6 'user change after migration'; expect main.upload_time 25 'user change after migration'

# 4. A failed commit writes no marker; after reboot the retry migrates and keeps one backup.
setup $legacy
UCI_FAIL_COMMIT=1 sh "$migrate" && fail 'commit failure must be reported'
[ -z "$(val main.settings_version)" ] || fail 'marker written although values were not saved'
expect main.download_time 15 'nothing committed'
reboot; sh "$migrate"
expect main.settings_version 2 retry; expect main.download_time 10 retry; expect previous.download_time 15 'backup of original values'

# 5. Marker commit fails after values were saved: retry keeps the original backup.
setup $legacy
UCI_FAIL_COMMIT=2 sh "$migrate" && fail 'marker commit failure must be reported'
[ -z "$(val main.settings_version)" ] || fail 'marker must not be committed'
reboot; sh "$migrate"
expect main.settings_version 2 retry; expect previous.download_time 15 'backup not overwritten by migrated values'

# 6. Fresh install ships the marker: nothing changes, no backup is created.
setup $(sed -n "s/^\toption \([a-z_]*\) '\(.*\)'$/yandex-internetometer.main.\1=\2/p" "$root/root/etc/config/yandex-internetometer") yandex-internetometer.main=settings
before="$(cat "$UCI_DIR/committed")"
sh "$migrate"
[ "$(cat "$UCI_DIR/committed")" = "$before" ] || fail 'fresh install config changed'
expect main.settings_version 2 fresh; expect main.download_time 10 fresh; [ -z "$(val previous)" ] || fail 'fresh install got a backup'

# 7. Missing section is created; history is never touched.
setup ''
mkdir -p "$work/history"; printf '{"id":"1"}\n' > "$work/history/history.jsonl"; sum="$(cksum < "$work/history/history.jsonl")"
sh "$migrate"
expect main settings 'section created'; expect main.streams auto defaults; expect main.upload_size 8000000 defaults
[ "$(cksum < "$work/history/history.jsonl")" = "$sum" ] || fail 'history changed'
grep -q history "$migrate" && fail 'migration must not reference history'

# 8. Every install path runs the migration.
grep -q migrate-settings "$root/scripts/post-install" || fail 'post-install does not migrate'
grep -q migrate-settings "$root/Makefile" || fail 'Makefile postinst does not migrate'
grep -q 'post-upgrade:$GITHUB_WORKSPACE/scripts/post-install' "$root/.github/workflows/release.yml" || fail 'APK post-upgrade does not migrate'
echo 'migration tests: ok'
