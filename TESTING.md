# Проверка v1.0.0

Автоматически: `sh -n root/usr/bin/yandex-internetometer docs/install.sh`, `node --check htdocs/luci-static/resources/view/status/yandex-internetometer.js`, сравнение двух LuCI-файлов и `git diff --check`.

Smoke-тест: получить probe по HTTPS, выполнить короткие HTTP GET/POST без redirect и проверить HTTPS-fallback с недоступным HTTP URL. На реальном роутере дополнительно нужны три замера: `auto`, `https` и ориентир с Ethernet-компьютера, а также CPU, MemAvailable и отсутствие `curl` после Stop.

# Архив: ручная проверка

1. Build the package with an apk-based OpenWrt SDK/buildroot.
2. Install it on the router with the universal installer:

```sh
curl -fsSL https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh
```

Run the same command again and confirm it upgrades or keeps the current package without breaking the installation.

3. Install it manually on an apk-based router from the APK repository:

```sh
curl -fL -o /etc/apk/keys/yandex-internetometer.rsa.pub \
  https://sergeylopukhov.github.io/luci-app-yandex-internetometer/keys/yandex-internetometer.rsa.pub
ARCH="$(apk --print-arch)"
echo "https://sergeylopukhov.github.io/luci-app-yandex-internetometer/packages/${ARCH}/yandex-internetometer/packages.adb" > \
  /etc/apk/repositories.d/yandex-internetometer.list
rm -f /var/cache/apk/*
apk update
apk add luci-app-yandex-internetometer
```

4. Confirm CLI JSON output:

```sh
yandex-internetometer run --json
```

Confirm that a fresh config uses `streams: 8` unless the user changed `/etc/config/yandex-internetometer`.

Confirm there is no jq regex error such as:

```text
jq was compiled without ONIGURUMA regex library
```

5. Confirm the LuCI menu item appears under:

```text
Status -> Internetometer
```

If it does not appear immediately, clear LuCI cache and reload rpcd:

```sh
rm -f /tmp/luci-indexcache.*
/etc/init.d/rpcd reload 2>/dev/null || /etc/init.d/rpcd restart
```

6. Open the app for the first time and confirm Russian is selected by default.
7. Start a test from LuCI and confirm the running indicator appears.
8. Confirm the main gauge shows live ping during the latency phase.
9. Confirm the main gauge shows live download speed during the download phase.
10. Confirm the main gauge shows live upload speed during the upload phase.
11. Confirm there is no duplicate result-card block below the main test panel.
12. Confirm final values remain visible after the test finishes.
13. Use the page language button and confirm only this app switches between Russian and English.
14. Switch LuCI language to Russian and confirm Russian menu title `Интернетометр`.
15. Switch LuCI language to English and confirm English menu title `Internetometer`.
16. Simulate endpoint failure by blocking `yandex.ru` or Yandex CDN DNS and confirm the backend returns clean JSON with `ok=false`.
17. Start two tests at once:

```sh
yandex-internetometer start
yandex-internetometer run --json
```

Confirm the second command reports `running=true` instead of starting another measurement.

18. Reboot the router and confirm no stale running state remains:

```sh
yandex-internetometer status
```

The status should return valid JSON and `running=false` unless a new test is active.
