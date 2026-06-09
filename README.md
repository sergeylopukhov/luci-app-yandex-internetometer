# luci-app-yandex-internetometer

LuCI-приложение и лёгкий CLI-backend для замера скорости интернета на OpenWrt через probe-серверы Яндекс Интернетометра.

Это неофициальная совместимая реализация. Это не ПО Яндекса и не официальный SDK. Пакет не использует VPS, Ookla, speedtest.net, Python, Node.js, npm или bash на роутере.

## Что делает пакет

- добавляет страницу LuCI: `Status -> Yandex Internetometer`;
- измеряет HTTP RTT, jitter, входящую и исходящую скорость;
- получает список probe-серверов из `https://yandex.ru/internet/api/v0/get-probes`;
- хранит временные файлы только в `/tmp/yandex-internetometer/`;
- генерирует upload-payload потоком из `/dev/zero`, без записи больших файлов во flash;
- отдаёт результат в JSON для CLI и LuCI.

## Установка из релиза

Для OpenWrt с `apk` лучше использовать репозиторий пакета. LuCI должен быть уже установлен на роутере.

```sh
curl -L -o /etc/apk/keys/yandex-internetometer.rsa.pub \
  https://sergeylopukhov.github.io/luci-app-yandex-internetometer/keys/yandex-internetometer.rsa.pub

ARCH="$(apk --print-arch)"
echo "https://sergeylopukhov.github.io/luci-app-yandex-internetometer/packages/${ARCH}/yandex-internetometer/packages.adb" \
  >> /etc/apk/repositories.d/yandex-internetometer.list

apk update
apk add luci-app-yandex-internetometer
```

Для OpenWrt 24.10.x с legacy `opkg` используйте `.ipk`:

```sh
cd /tmp
curl -L -o luci-app-yandex-internetometer.ipk \
  https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/download/v0.0.1/luci-app-yandex-internetometer-0.0.1-openwrt-24.10-all.ipk
opkg install ./luci-app-yandex-internetometer.ipk
```

Удаление:

```sh
apk del luci-app-yandex-internetometer
```

Для legacy `opkg`:

```sh
opkg remove luci-app-yandex-internetometer
```

## Использование

В LuCI:

```text
Status -> Yandex Internetometer
```

CLI:

```sh
yandex-internetometer run --json
yandex-internetometer run --streams 3 --download-time 10 --upload-time 10 --upload-size 12000000
yandex-internetometer start
yandex-internetometer status
yandex-internetometer stop
```

## Сборка в OpenWrt SDK/buildroot

```sh
cp -a luci-app-yandex-internetometer /path/to/openwrt/package/
cd /path/to/openwrt
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
make package/luci-app-yandex-internetometer/compile V=s
```

В `menuconfig` выберите:

```text
LuCI -> Applications -> luci-app-yandex-internetometer
```

На apk-based OpenWrt targets итоговый файл будет `.apk`.

## English

LuCI application and lightweight CLI backend for an unofficial Yandex Internetometer-compatible speed test on OpenWrt routers.

This is not official Yandex software. It uses Yandex Internetometer-style probe endpoints and fetches probe information from:

```sh
https://yandex.ru/internet/api/v0/get-probes
```

No VPS, Ookla, speedtest.net, Python, Node.js, npm, or bash is required on the router.

## Runtime dependencies

- BusyBox-compatible `/bin/ash`
- `curl`
- `jq`
- working LuCI installation

`jq` is intentionally used to parse Yandex probe JSON safely. If Yandex changes the response structure, the backend returns a clean JSON error.

## Build with OpenWrt SDK/buildroot

Most users should install from the GitHub release. Use SDK/buildroot only if you need to rebuild the package.

For apk-based OpenWrt:

```sh
curl -L -o /etc/apk/keys/yandex-internetometer.rsa.pub \
  https://sergeylopukhov.github.io/luci-app-yandex-internetometer/keys/yandex-internetometer.rsa.pub

ARCH="$(apk --print-arch)"
echo "https://sergeylopukhov.github.io/luci-app-yandex-internetometer/packages/${ARCH}/yandex-internetometer/packages.adb" \
  >> /etc/apk/repositories.d/yandex-internetometer.list

apk update
apk add luci-app-yandex-internetometer
```

For OpenWrt 24.10.x legacy opkg:

```sh
cd /tmp
curl -L -o luci-app-yandex-internetometer.ipk \
  https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/download/v0.0.1/luci-app-yandex-internetometer-0.0.1-openwrt-24.10-all.ipk
opkg install ./luci-app-yandex-internetometer.ipk
```

To build manually, place this package in a package feed or directly under `package/`:

```sh
cp -a luci-app-yandex-internetometer /path/to/openwrt/package/
cd /path/to/openwrt
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
```

Select:

```text
LuCI -> Applications -> luci-app-yandex-internetometer
```

Build:

```sh
make package/luci-app-yandex-internetometer/compile V=s
```

On apk-based OpenWrt targets, the buildroot/SDK produces an `.apk` package under `bin/packages/.../luci/` or the matching package output directory.

## Install

Copy the generated package to the router and install it with `apk`:

```sh
apk add --allow-untrusted ./luci-app-yandex-internetometer-*.apk
```

Uninstall:

```sh
apk del luci-app-yandex-internetometer
```

## LuCI

Open:

```text
LuCI -> Status -> Yandex Internetometer
```

The page allows starting/stopping a test, viewing results, and saving settings:

- stream count
- download duration
- upload duration
- upload payload size
- upload test enabled/disabled
- debug mode

LuCI calls only fixed wrapper scripts through rpcd ACL:

- `/usr/libexec/yandex-internetometer/start`
- `/usr/libexec/yandex-internetometer/status`
- `/usr/libexec/yandex-internetometer/stop`

No arbitrary command execution is granted.

## CLI usage

```sh
yandex-internetometer run
yandex-internetometer run --json
yandex-internetometer run --debug
yandex-internetometer run --streams 3 --download-time 10 --upload-time 10 --upload-size 12000000
yandex-internetometer start
yandex-internetometer status
yandex-internetometer stop
```

Example JSON:

```json
{
  "ok": true,
  "running": false,
  "timestamp": "2026-06-09T12:00:00+03:00",
  "download_mbps": 95.42,
  "upload_mbps": 47.11,
  "ping_ms": 12.34,
  "jitter_ms": 1.23,
  "streams": 3,
  "download_time": 10,
  "upload_time": 10,
  "probe_count": 9,
  "server": "cloudcdn-example.cdn.yandex.net",
  "error": null
}
```

## Troubleshooting

No probe servers: check router DNS, TLS certificates, and access to `https://yandex.ru/internet/api/v0/get-probes`.

curl TLS failure: install/update CA certificates for your OpenWrt image if your curl build validates certificates.

Router CPU too weak: reduce stream count, download duration, upload duration, or upload payload size.

Result is lower than expected: router CPU, NAT offload settings, Wi-Fi, VPN, SQM, and concurrent traffic can limit measured speed.

Yandex endpoint changed: the backend returns an error such as `Yandex probe response has an unsupported structure`. Update the parser/endpoints.

## Security and privacy

The test contacts Yandex probe, upload, download, and latency endpoints needed for the measurement. It does not use third-party IP/geolocation services and does not send data to Ookla, speedtest.net, a VPS, or analytics services.

Runtime state is stored in `/tmp/yandex-internetometer/`. Large upload/download payloads are never written to flash. Upload data is streamed from `/dev/zero`.

## Manual testing

See `TESTING.md`.
