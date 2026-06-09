# luci-app-yandex-internetometer 0.0.1

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
- keeps project version `0.0.1`, package release is `r11`.

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
