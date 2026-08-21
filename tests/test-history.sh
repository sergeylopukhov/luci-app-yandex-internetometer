#!/bin/sh
set -eu

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT INT TERM

export YANDEX_INTERNETOMETER_STATE_DIR="$TEST_ROOT/state"
export YANDEX_INTERNETOMETER_HISTORY_DIR="$TEST_ROOT/history"
export YANDEX_INTERNETOMETER_HISTORY_LIMIT=3
export YANDEX_INTERNETOMETER_VERSION_FILE="$TEST_ROOT/version"
export YANDEX_INTERNETOMETER_LIBRARY=1

. "$(dirname "$0")/../root/usr/bin/yandex-internetometer"

i=1
while [ "$i" -le 4 ]; do
	history_append "$(jq -cn --arg timestamp "2026-08-2${i}T10:00:00+03:00" --argjson value "$i" '{timestamp:$timestamp,download_mbps:$value,upload_mbps:($value/2),ping_ms:(10+$value),jitter_ms:1.2,streams:6,upload_streams:4,server:"cdn.yandex.net",transfer_protocol:"http",version:"1.0.1",public_ip:"203.0.113.10"}')"
	i=$((i + 1))
done

result="$(history_test)"
printf '%s\n' "$result" | jq -e '.ok == true and (.records | length) == 3' >/dev/null
printf '%s\n' "$result" | jq -e '.records[0].download_mbps == 2 and .records[2].download_mbps == 4' >/dev/null
printf '%s\n' "$result" | jq -e 'all(.records[]; has("public_ip") | not)' >/dev/null

[ "$(stat -c %a "$YANDEX_INTERNETOMETER_HISTORY_DIR/history.jsonl" 2>/dev/null || stat -f %Lp "$YANDEX_INTERNETOMETER_HISTORY_DIR/history.jsonl")" = 600 ]

history_clear | jq -e '.ok == true and .records == []' >/dev/null
[ ! -e "$YANDEX_INTERNETOMETER_HISTORY_DIR/history.jsonl" ]

printf '%s\n' 'history tests: ok'
