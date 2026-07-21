# luci-app-yandex-internetometer

## v1.0.0

- Тестовый download/upload в `auto` использует проверенный HTTP CDN Яндекса, а probe и публичный IP остаются на HTTPS.
- Добавлены безопасная проверка URL, HTTPS-fallback, фактический транспорт в JSON/LuCI и принудительный режим HTTPS.
- Upload использует sparse-payload, дробное монотонное время, отдельные счётчики worker, round-robin CDN и корректное завершение процессов.
- Добавлены уведомление LuCI о новой версии, `version.json`, универсальный установщик apk/opkg с проверкой подписи или SHA256.
- Пакет: `1.0.0-r1`; IPK: `luci-app-yandex-internetometer-1.0.0-openwrt-24.10-all.ipk`.

# Архив 0.0.1

Initial public release.

Hotfix `0.0.1-r2`:

- removed jq regex functions for OpenWrt jq builds without ONIGURUMA;
- added package install/remove scripts to clear LuCI menu cache and reload rpcd;
- keeps project version `0.0.1`, package release is `r2`.

Hotfix `0.0.1-r3`:

- ships compiled LuCI Russian translation file;
- uses `Интернетометр` as the Russian menu title;
- adds animated progress and current-stage display while a test is running;
- adds an in-app RU/EN language switch that does not change global LuCI language;
- keeps project version `0.0.1`, package release is `r3`.

Hotfix `0.0.1-r4`:

- makes the Start test button update the page immediately;
- removes blocking `uci.save()/apply()` from the Start test action;
- sets action buttons to `type="button"` to avoid accidental form submission;
- keeps project version `0.0.1`, package release is `r4`.

Hotfix `0.0.1-r5`:

- redesigns the LuCI page around a Speedtest-like central gauge;
- shows test stage pills for ping, download, upload, and completion;
- keeps the UI visually similar to a speed tester without cloning Yandex or Ookla branding;
- keeps project version `0.0.1`, package release is `r5`.

Hotfix `0.0.1-r6`:

- adds a universal installer at `https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh`;
- installer detects `apk` or `opkg` and installs or upgrades the package;
- uses Russian as the default language inside the LuCI application;
- documents that package installation was tested only on apk-based OpenWrt;
- keeps project version `0.0.1`, package release is `r6`.

Hotfix `0.0.1-r7`:

- writes live ping, download, and upload values to the status JSON while a test is running;
- changes the LuCI gauge to show the active metric instead of test completion percent;
- removes the duplicate result-card block under the main test panel;
- changes the default stream count to `8`;
- keeps project version `0.0.1`, package release is `r7`.

Hotfix `0.0.1-r8`:

- changes the LuCI view module path to force browsers to load the new live-metrics UI instead of a cached percent-based view;
- keeps project version `0.0.1`, package release is `r8`.

Hotfix `0.0.1-r9`:

- ships the new live-metrics LuCI UI under both the old and new view module paths;
- makes the universal installer use `apk add --upgrade` for already installed apk packages;
- keeps project version `0.0.1`, package release is `r9`.

Hotfix `0.0.1-r10`:

- increases the default upload payload to `30720000` bytes to reduce per-request overhead on routers;
- lets upload requests run for up to 10 seconds, capped by remaining test time, instead of hard-stopping every POST after 2 seconds;
- reduces shell overhead during speed tests by selecting each worker's probe URL once instead of spawning `sed` for every request;
- refreshes the LuCI speed-test page with a more minimal Yandex Internetometer-like dark layout and smoother gauge/status animations;
- keeps project version `0.0.1`, package release is `r10`.

Hotfix `0.0.1-r11`:

- replaces the generic circular gauge with a Yandex Internetometer-like oval tick scale;
- shows download, upload, and latency as three large centered metrics inside the scale;
- measures latency with 10 HTTP RTT samples and uses their average for ping;
- keeps project version `0.0.1`, package release is `r11`.

Hotfix `0.0.1-r12`:

- changes latency measurement to one warm-up request plus 10 measured requests on a reused HTTP connection;
- uses time to first byte for latency samples to avoid counting a new TCP/TLS handshake in every ping sample;
- keeps project version `0.0.1`, package release is `r12`.

Hotfix `0.0.1-r13`:

- updates ping progress after each of the 10 latency samples instead of only after the full series;
- exposes `latency_samples` in the status JSON and LuCI details;
- moves the Start test action into the speedometer area and removes the generic stage strip for a closer Yandex Internetometer layout;
- keeps project version `0.0.1`, package release is `r13`.

Hotfix `0.0.1-r14`:

- replaces the previous HTML tick imitation with an SVG speedometer using the same wide `957x392` geometry as the Yandex Internetometer reference;
- positions the three large result metrics inside the oval like the Yandex result screen, without number overlap;
- changes the running animation to a subtle red tick scan instead of fading large parts of the scale;
- keeps project version `0.0.1`, package release is `r14`.

Hotfix `0.0.1-r15`:

- stops recreating the whole speedometer DOM on every one-second polling update, so numbers and tick animations no longer blink;
- matches the saved Yandex Internetometer page sizing more closely: `957px` desktop speedometer, `64px` desktop values, and `213px` metric blocks;
- changes the scale from an ellipse to a capsule-like path with straight top and bottom sections, rounded sides, and a bottom-center gap;
- adds an outer progress path around the capsule during running tests;
- adds a LuCI/backend setting for latency sample count, defaulting to 10 and allowing 10-50 samples;
- keeps project version `0.0.1`, package release is `r15`.

Hotfix `0.0.1-r16`:

- uses the saved Yandex Internetometer speedometer SVG as the static scale layer instead of trying to redraw the scale geometry manually;
- keeps the local live values and router measurement logic, with a separate overlay for the running progress path;
- creates the progress overlay SVG with `document.createElementNS()` to avoid LuCI HTML namespace rendering bugs;
- keeps project version `0.0.1`, package release is `r16`.

Hotfix `0.0.1-r19`:

- prepares the upload test payload once in the temporary run directory before the upload timer starts;
- makes upload requests read that prepared payload file directly instead of generating `/dev/zero` through a pipe during the measurement;
- reuses HTTPS connections during upload by running one `curl` process per upload stream with a sequence of POST transfers;
- raises the default upload payload to 50 MB now that payload generation is outside the timed measurement;
- adds separate `upload_streams` support with `auto` selection across 4, 8, and 12 upload streams;
- resets the main UI to the central measure button on page refresh instead of showing stale completed results;
- animates live metric values and the outer speed progress path from the current running speed;
- replaces the bottom progress/action controls with router public IPv4, a compact stop control, and an inline "run again" action;
- moves the language control to the top-left corner and hides settings under a collapsed details block;
- starts the outer progress path from the lower 0 marker instead of the upper-left corner;
- keeps project version `0.0.1`, package release is `r19`.

Hotfix `0.0.1-r20`:

- rebuilds the APK repository from the current full source tree so the published package includes the latest backend, UI, config, and installer changes;
- keeps project version `0.0.1`, package release is `r20`.

Hotfix `0.0.1-r21`:

- avoids refreshing the router public IP on every running status poll, reducing backend work during heavy upload tests;
- keeps the current UI state when LuCI/browser aborts a polling XHR instead of replacing the test with an error banner;
- keeps project version `0.0.1`, package release is `r21`.

Hotfix `0.0.1-r22`:

- reverts the upload connection-reuse experiment because long single `curl` workers can pin upload load to one CPU core and stall LuCI polling;
- keeps the prepared `/tmp` upload payload from `r17`, but restores the bounded short POST loop for predictable completion;
- restores the default upload payload size to 30.72 MB;
- keeps project version `0.0.1`, package release is `r22`.

Assets:

- GitHub Pages APK repository for apk-based OpenWrt systems.
- `luci-app-yandex-internetometer-0.0.1-openwrt-24.10-all.ipk` for OpenWrt 24.10.x legacy opkg systems.

Recommended installation uses the universal installer:

```sh
curl -fsSL https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh
```

The same command can be used again to upgrade the package.

Manual apk installation uses the GitHub Pages repository:

```sh
curl -fL -o /etc/apk/keys/yandex-internetometer.rsa.pub \
  https://sergeylopukhov.github.io/luci-app-yandex-internetometer/keys/yandex-internetometer.rsa.pub
ARCH="$(apk --print-arch)"
echo "https://sergeylopukhov.github.io/luci-app-yandex-internetometer/packages/${ARCH}/yandex-internetometer/packages.adb" > \
  /etc/apk/repositories.d/yandex-internetometer.list
apk update
apk add luci-app-yandex-internetometer
```

For an already installed older test build:

```sh
rm -f /var/cache/apk/*
apk update
apk add --upgrade luci-app-yandex-internetometer
```

If an older test repository was already configured and `apk add` fails with `ADB integrity error`, refresh the key and clear `/var/cache/apk/*` before running `apk update` again.

This is an unofficial Yandex Internetometer-compatible implementation. It is not official Yandex software.

The package depends only on `curl` and `jq`; LuCI is expected to be already installed.
