#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT
export YANDEX_INTERNETOMETER_LIBRARY=1
export YANDEX_INTERNETOMETER_STATE_DIR="$TEST_ROOT/state"
export YANDEX_INTERNETOMETER_HISTORY_DIR="$TEST_ROOT/history"
. "$ROOT/root/usr/bin/yandex-internetometer"
JSON_MODE=1
ensure_state_dir
RUN_STARTED='2026-09-07T12:00:00+03:00'
PROGRESS_PHASE=upload
DOWNLOAD_VALUE=100
UPLOAD_VALUE=null
QUALITY=partial
finish_state false 'Upload failed; result is incomplete' > "$TEST_ROOT/failure"
jq -e '.ok == false and .running == false and .download_mbps == 100 and .upload_mbps == null and .quality == "partial" and .error != null' "$TEST_ROOT/failure" >/dev/null
[ ! -e "$HISTORY_FILE" ]
write_state
status_test > "$TEST_ROOT/interrupted"
jq -e '.running == false and .ok == false and .phase == "error"' "$TEST_ROOT/interrupted" >/dev/null
PROGRESS_PHASE=complete; QUALITY=complete; UPLOAD_VALUE=80
finish_state true null >/dev/null
history_test | jq -e '.records | length == 1' >/dev/null
STREAMS=auto; UPLOAD_STREAMS=auto; validate_settings
printf '%s\n' 'state tests: ok'
