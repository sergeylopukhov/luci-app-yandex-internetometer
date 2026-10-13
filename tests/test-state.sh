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
# A broken/older engine printing zero must never complete or enter history.
cat > "$TEST_ROOT/engine" <<'ENGINE'
#!/bin/sh
case "$1" in download) printf '100.00\n';; upload) printf '0.00\n';; esac
ENGINE
chmod +x "$TEST_ROOT/engine"
ENGINE="$TEST_ROOT/engine"
VERSION_FILE="$ROOT/root/usr/share/yandex-internetometer/version"
SELF="$ROOT/root/usr/bin/yandex-internetometer"
resource_sample() { :; }
public_ip() { :; }
choose_streams() { EFFECTIVE_STREAMS=1; EFFECTIVE_UPLOAD_STREAMS=1; }
fetch_probes() { :; }
probe_count() { printf '1\n'; }
server_name() { printf 'fixture.cdn.yandex.net\n'; }
transfer_urls() { printf 'https://fixture.cdn.yandex.net/probes/50mb\n'; }
select_transport() { ACTUAL_PROTOCOL=http; }
measure_latency() { PING_VALUE=1; JITTER_VALUE=0; }
(
    QUALITY=unknown; UPLOAD_ENABLED=1
    run_test
) > "$TEST_ROOT/zero-upload" && exit 1
jq -e '.ok == false and .phase == "error" and .quality == "partial" and .download_mbps == 100 and .error == "Upload failed; result is incomplete"' "$TEST_ROOT/zero-upload" >/dev/null
history_test | jq -e '.records | length == 1' >/dev/null
printf '%s\n' 'state tests: ok'
