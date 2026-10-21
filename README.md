# Yandex Internetometer for OpenWrt

<p align="center">
  <a href="#english">English</a> · <a href="#русский">Русский</a>
</p>

![Internetometer interface](docs/screenshot-v1.0.14.png)
<p align="center">
  <a href="https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/latest"><img src="https://img.shields.io/github/v/release/sergeylopukhov/luci-app-yandex-internetometer?label=version" alt="Version"></a>
  <a href="https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases"><img src="https://img.shields.io/github/downloads/sergeylopukhov/luci-app-yandex-internetometer/total?label=downloads" alt="Downloads"></a>
  <a href="https://openwrt.org/"><img src="https://img.shields.io/badge/OpenWrt-24.10%2B-blue" alt="OpenWrt"></a>
  <a href="docs/install.sh"><img src="https://img.shields.io/badge/packages-apk%20%2F%20opkg-green" alt="apk / opkg"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/sergeylopukhov/luci-app-yandex-internetometer" alt="License"></a>
</p>

## English

Unofficial LuCI interface for router-side speed testing over the Yandex CDN. The project is not affiliated with Yandex.

### 🚀 Installation

```sh
curl -fsSL https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh -s -- --yes
```

Without `curl`:

```sh
wget -qO- https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh -s -- --yes
```

Open `LuCI → Status → Internetometer`. The installer picks `apk` or `opkg` automatically, verifies the repository signature or the IPK SHA256, and keeps your UCI settings.

### 📊 What it measures

- download and upload speed between the router and the Yandex CDN, plus the peak speed of each stage;
- latency and jitter;
- the actual transport and number of streams.

Stages run one after another: download, upload, latency, with a 0.5 second pause between them. By default each speed stage lasts 10 seconds, and latency is measured over 30 requests. Speed and latency are shown with two decimal places; the "Show decimals" toggle in the settings switches the whole page to whole numbers.

Completed measurements are stored on the router. In LuCI you can view a chart for 7, 30 or 90 days, compare averages with the previous period, and export the selected period to CSV or JSON. In the table, the peak of each test is shown in parentheses next to the average speed. History is limited to 200 entries and does not include the public IP.

The app picks the nearest server from the probe server list: it polls each server for latency and measures speed and latency against the fastest one. The probe server list and the router IP are always fetched over HTTPS. In `auto` mode, synthetic download/upload runs over HTTP after a CDN check; if HTTP is unavailable, the app falls back to HTTPS and warns about a possible CPU/TLS bottleneck. No user data is sent over HTTP: the upload contains only zeros. An intermediate node could in theory tamper with the test data or the result.

HTTP tests are run by the native `transfer-native` module: a single process, persistent connections and fixed-size buffers. Upload speed is counted from the bytes received by the Yandex server, not from writes to the router's socket. The first second of a test is a warm-up and is excluded from the result. In HTTPS mode and on ARMv4/ARMv5 a `curl`-based engine with TLS verification is used.

Packages are built separately for each OpenWrt architecture. On upgrade to 2.0.0, the streams and protocol settings are switched to "Auto" once; the previous values are kept in `uci show yandex-internetometer.previous`.

### 🔄 Updating

The same command updates an installed package. LuCI checks `version.json` over HTTPS every six hours and shows a link to the new release. Transport modes: `auto`, `http` and `https`; HTTPS is useful for diagnostics and as a quick fallback.

### 🛟 Troubleshooting

Check DNS, the router clock, and that `curl` and `jq` are installed. On low-end routers the router-side result depends on CPU, memory and the number of streams. For legacy `opkg`, the package targets OpenWrt 24.10; the APK branch has better coverage.

Version history: [RELEASE_NOTES.md](RELEASE_NOTES.md).

## Русский

Неофициальный LuCI-интерфейс для router-side замера скорости через CDN Яндекса. Проект не связан с Яндексом.

### 🚀 Установка

```sh
curl -fsSL https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh -s -- --yes
```

Без `curl`:

```sh
wget -qO- https://sergeylopukhov.github.io/luci-app-yandex-internetometer/install.sh | sh -s -- --yes
```

Откройте `LuCI → Статус → Интернетометр`. Установщик сам выбирает `apk` или `opkg`, проверяет подпись репозитория либо SHA256 IPK и сохраняет UCI-настройки.

### 📊 Что измеряет

- входящую и исходящую скорость между роутером и CDN Яндекса, а также пиковую скорость каждого этапа;
- задержку и джиттер;
- фактический транспорт и число потоков.

Этапы идут по очереди: входящая скорость, исходящая скорость, задержка, с паузой 0,5 секунды между ними. По умолчанию каждый этап скорости длится 10 секунд, задержка измеряется по 30 запросам. Скорость и задержка выводятся с двумя знаками после точки; переключатель «Дробные значения» в настройках переводит всю страницу на целые числа.

Завершённые измерения сохраняются на роутере. В LuCI можно посмотреть график за 7, 30 или 90 дней, сравнить средние показатели с предыдущим периодом и выгрузить выбранный период в CSV или JSON. В таблице рядом со средней скоростью в скобках указан пик замера. История ограничена 200 записями и не содержит публичный IP.

Из списка probe-серверов приложение выбирает ближайший: опрашивает каждый сервер для замера задержки и меряет скорость и задержку до самого быстрого. Список probe-серверов и IP роутера всегда запрашиваются по HTTPS. В режиме `auto` синтетический download/upload идёт по HTTP после проверки CDN; если HTTP недоступен, приложение переключается на HTTPS и предупреждает о возможном ограничении CPU/TLS. Пользовательские данные по HTTP не передаются: upload содержит только нули. Промежуточный узел теоретически может повлиять на тестовые данные или результат.

Замер по HTTP выполняет нативный модуль `transfer-native`: один процесс, постоянные соединения и буферы фиксированного размера. Исходящая скорость считается по счётчику принятых байтов на сервере Яндекса, а не по записи в сокет роутера. Первая секунда замера — разгон, она в результат не входит. В режиме HTTPS и на ARMv4/ARMv5 используется движок на `curl` с проверкой TLS.

Пакеты собираются отдельно для каждой архитектуры OpenWrt. При обновлении до 2.0.0 настройки потоков и протокола однократно переводятся в режим «Авто», прежние значения сохраняются в `uci show yandex-internetometer.previous`.

### 🔄 Обновление

Та же команда обновляет установленный пакет. LuCI проверяет `version.json` по HTTPS раз в шесть часов и показывает ссылку на новый выпуск. Режимы транспорта: `auto`, `http` и `https`; HTTPS подходит для диагностики и быстрого отката.

### 🛟 Если не работает

Проверьте DNS, время роутера и наличие `curl`, `jq`. На слабых роутерах router-side результат зависит от CPU, памяти и числа потоков. Для legacy `opkg` пакет рассчитан на OpenWrt 24.10; APK-ветка покрыта полнее.

История версий: [RELEASE_NOTES.md](RELEASE_NOTES.md).
