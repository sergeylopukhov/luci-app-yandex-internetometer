# luci-app-yandex-internetometer 0.0.1

Initial public release.

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

If an older test repository was already configured and `apk add` fails with `ADB integrity error`, refresh the key and clear `/var/cache/apk/*` before running `apk update` again.

This is an unofficial Yandex Internetometer-compatible implementation. It is not official Yandex software.

The package depends only on `curl` and `jq`; LuCI is expected to be already installed.
