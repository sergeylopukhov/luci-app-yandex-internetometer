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

Assets:

- GitHub Pages APK repository for apk-based OpenWrt systems.
- `luci-app-yandex-internetometer-0.0.1-openwrt-24.10-all.ipk` for OpenWrt 24.10.x legacy opkg systems.

Recommended apk installation uses the GitHub Pages repository:

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
apk upgrade luci-app-yandex-internetometer
```

If an older test repository was already configured and `apk add` fails with `ADB integrity error`, refresh the key and clear `/var/cache/apk/*` before running `apk update` again.

This is an unofficial Yandex Internetometer-compatible implementation. It is not official Yandex software.

The package depends only on `curl` and `jq`; LuCI is expected to be already installed.
