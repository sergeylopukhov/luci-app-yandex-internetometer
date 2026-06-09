# luci-app-yandex-internetometer

LuCI-приложение и лёгкий CLI-backend для замера скорости интернета на OpenWrt через probe-серверы Яндекс Интернетометра.

Это неофициальная совместимая реализация. Пакет не относится к Яндексу, не использует официальный SDK и не должен восприниматься как официальное ПО Яндекса.

## Что делает пакет

- добавляет страницу LuCI: `Status -> Internetometer`, в русской локали — «Интернетометр»;
- измеряет HTTP RTT, jitter, входящую и исходящую скорость;
- получает список probe-серверов из `https://yandex.ru/internet/api/v0/get-probes`;
- показывает тест в веб-интерфейсе: текущий ping, текущую входящую или исходящую скорость, итоговую скорость и параметры сервера;
- хранит временные файлы только в `/tmp/yandex-internetometer/`;
- генерирует upload-payload потоком из `/dev/zero`, без записи больших файлов во flash;
- отдаёт результат в JSON для CLI и LuCI.

Пакету не нужны VPS, Ookla, speedtest.net, Python, Node.js, npm или bash на роутере.

## Важное про проверку

Установка и обновление пакета проверялись только на OpenWrt с `apk`.

IPK для legacy `opkg` собирается и установщик умеет его скачать, но эта ветка не проходила полноценную проверку на реальном opkg-роутере.

## Быстрая установка и обновление

Одна команда ставит пакет. Повторный запуск этой же команды обновляет пакет, если вышла новая версия.

```sh
curl -fsSL https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh
```

Если на роутере нет `curl`, используйте `wget`:

```sh
wget -O - https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh
```

Установщик:

- проверяет, запущен ли он от `root`;
- выбирает `apk`, если он есть;
- если `apk` не найден, пробует `opkg`;
- для `apk` добавляет ключ и репозиторий пакета, затем ставит или обновляет приложение;
- для `opkg` скачивает IPK из GitHub Release и запускает `opkg install`;
- очищает кеш меню LuCI и перезагружает `rpcd`.

После установки откройте:

```text
LuCI -> Status -> Internetometer
```

В русской локали пункт меню называется «Интернетометр».

## Ручная установка через apk

Рекомендуемый способ для apk-based OpenWrt:

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

Обновление:

```sh
rm -f /var/cache/apk/*
apk update
apk add --upgrade luci-app-yandex-internetometer
```

## Ручная установка через opkg

Этот вариант предназначен для OpenWrt 24.10.x с legacy `opkg`. Он собран, но не проверялся так же полно, как APK-вариант.

```sh
cd /tmp
curl -fL -o luci-app-yandex-internetometer.ipk \
  https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/download/v0.0.1/luci-app-yandex-internetometer-0.0.1-openwrt-24.10-all.ipk
opkg update
opkg install ./luci-app-yandex-internetometer.ipk
```

## Удаление

Для `apk`:

```sh
apk del luci-app-yandex-internetometer
```

Для `opkg`:

```sh
opkg remove luci-app-yandex-internetometer
```

## Использование CLI

```sh
yandex-internetometer run
yandex-internetometer run --json
yandex-internetometer run --debug
yandex-internetometer run --streams 8 --download-time 10 --upload-time 10 --upload-size 12000000
yandex-internetometer start
yandex-internetometer status
yandex-internetometer stop
```

Пример JSON:

```json
{
  "ok": true,
  "running": false,
  "timestamp": "2026-06-09T12:00:00+03:00",
  "phase": "complete",
  "download_mbps": 95.42,
  "upload_mbps": 47.11,
  "ping_ms": 12.34,
  "jitter_ms": 1.23,
  "streams": 8,
  "download_time": 10,
  "upload_time": 10,
  "upload_enabled": 1,
  "probe_count": 9,
  "server": "cloudcdn-example.cdn.yandex.net",
  "error": null
}
```

## Настройки

В LuCI можно изменить:

- количество потоков;
- длительность входящего теста;
- длительность исходящего теста;
- размер upload-payload;
- включение или отключение исходящего теста;
- debug-режим.

По умолчанию используется 8 потоков.

Во время активного теста `/usr/bin/yandex-internetometer status` возвращает промежуточные значения: сначала ping, затем текущую входящую скорость, затем текущую исходящую скорость. LuCI обновляет эти данные примерно раз в секунду.

Русский язык включён по умолчанию внутри приложения. Кнопка `English` переключает только это приложение и не меняет глобальный язык LuCI.

## Как LuCI вызывает backend

Страница LuCI не получает произвольный shell-доступ. Через ACL разрешены только фиксированные wrapper-скрипты:

- `/usr/libexec/yandex-internetometer/start`;
- `/usr/libexec/yandex-internetometer/status`;
- `/usr/libexec/yandex-internetometer/stop`.

Основная CLI-команда находится в `/usr/bin/yandex-internetometer`.

## Зависимости

На роутере нужны:

- BusyBox-совместимый `/bin/ash`;
- `curl`;
- `jq`;
- установленный LuCI.

`jq` используется для безопасного разбора JSON от Yandex probe endpoint. Если структура ответа изменится, backend вернёт чистую JSON-ошибку.

## Сборка в OpenWrt SDK/buildroot

```sh
cp -a luci-app-yandex-internetometer /path/to/openwrt/package/
cd /path/to/openwrt
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
```

В `menuconfig` выберите:

```text
LuCI -> Applications -> luci-app-yandex-internetometer
```

Сборка:

```sh
make package/luci-app-yandex-internetometer/compile V=s
```

На apk-based target OpenWrt SDK/buildroot создаст `.apk` в каталоге `bin/packages/...`.

## Диагностика

Нет probe-серверов: проверьте DNS, TLS-сертификаты и доступ к `https://yandex.ru/internet/api/v0/get-probes`.

Ошибка TLS в `curl`: установите или обновите CA-сертификаты в вашей сборке OpenWrt.

Роутер слабый по CPU: уменьшите количество потоков, длительность теста или размер upload-payload.

Результат ниже ожидаемого: на скорость влияют CPU роутера, NAT offload, Wi-Fi, VPN, SQM и параллельный трафик.

Yandex endpoint изменился: backend вернёт ошибку вроде `Yandex probe response has an unsupported structure`. В этом случае нужно обновить parser или endpoints.

Пункт меню не появился:

```sh
rm -f /tmp/luci-indexcache.*
/etc/init.d/rpcd reload 2>/dev/null || /etc/init.d/rpcd restart
```

После обновления JS-интерфейса сделайте жёсткое обновление страницы LuCI в браузере.

Ошибка `ADB integrity error` при `apk add`: обновите ключ и очистите кеш:

```sh
curl -fL -o /etc/apk/keys/yandex-internetometer.rsa.pub \
  https://sergeylopukhov.github.io/luci-app-yandex-internetometer/keys/yandex-internetometer.rsa.pub
rm -f /var/cache/apk/*
apk update
apk add luci-app-yandex-internetometer
```

## Безопасность и приватность

Тест обращается только к Yandex probe, upload, download и latency endpoints, нужным для замера. Пакет не использует сторонние IP/geolocation-сервисы, аналитику, VPS, Ookla или speedtest.net.

Runtime-состояние хранится в `/tmp/yandex-internetometer/`. Большие upload/download payloads не пишутся во flash. Upload-данные идут потоком из `/dev/zero`.

## Ручная проверка

Сценарии проверки описаны в `TESTING.md`.
