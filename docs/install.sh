#!/bin/sh
# luci-app-yandex-internetometer installer 1.0.1
set -eu
PKG=luci-app-yandex-internetometer; BASE=https://sergeylopukhov.github.io/luci-app-yandex-internetometer; VERSION_URL=$BASE/version.json; YES=0; FORCE=0
case "${INSTALLER_LANG:-${LANG:-ru}}" in *ru*|*RU*) RU=1;; *) RU=0;; esac
say() { [ "$RU" = 1 ] && printf '%s\n' "$1" || printf '%s\n' "$2"; }
die() { say "Ошибка: $1" "Error: $1" >&2; exit 1; }
help() { printf '%s\n' "Использование: sh install.sh [--yes] [--force] [--version] [--help]" "--yes: безопасные значения без вопросов; --force: переустановка или downgrade."; }
while [ "$#" -gt 0 ]; do case "$1" in --yes) YES=1;; --force) FORCE=1;; --version) printf '1.0.1\n'; exit 0;; --help) help; exit 0;; *) die "неизвестный аргумент: $1";; esac; shift; done
[ "$(id -u)" = 0 ] || die 'запустите установщик от root'; [ -r /etc/openwrt_release ] || [ -r /etc/os-release ] || die 'нужен OpenWrt'
command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || die 'нужен curl или wget с HTTPS'
TMP="$(mktemp -d /tmp/yandex-internetometer.XXXXXX)" || die 'не удалось создать временный каталог'; trap 'rm -rf "$TMP"' EXIT INT TERM
get() { case "$1" in https://sergeylopukhov.github.io/luci-app-yandex-internetometer/*|https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/download/*) ;; *) die 'недоверенный URL';; esac; command -v curl >/dev/null 2>&1 && curl -fsSL --connect-timeout 8 --max-time 45 -o "$2" "$1" || wget -q -T 45 -O "$2" "$1"; }
get "$VERSION_URL" "$TMP/version.json"
VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$TMP/version.json" | head -1)"; TAG="$(sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\(v[0-9][0-9.]*\)".*/\1/p' "$TMP/version.json" | head -1)"
case "$VERSION:$TAG" in [0-9]*.[0-9]*.[0-9]*:v[0-9]*.[0-9]*.[0-9]*) ;; *) die 'некорректный version.json';; esac
installed_version() { if command -v apk >/dev/null 2>&1; then apk info -e "$PKG" >/dev/null 2>&1 && apk info -a "$PKG" 2>/dev/null | sed -n 's/^version: \([0-9][^ ]*\).*/\1/p' | head -1; elif command -v opkg >/dev/null 2>&1; then opkg status "$PKG" 2>/dev/null | sed -n 's/^Version: \([0-9][^ ]*\).*/\1/p' | head -1; fi; }
OLD="$(installed_version || true)"
if [ -n "$OLD" ] && [ "$OLD" = "$VERSION-r1" ] && [ "$FORCE" = 0 ]; then say "Уже установлена версия $OLD." "Version $OLD is already installed."; exit 0; fi
[ -z "$OLD" ] || [ "$FORCE" = 1 ] || awk -v a="$VERSION" -v b="${OLD%-r*}" 'BEGIN{split(a,x,".");split(b,y,".");for(i=1;i<=3;i++){if(x[i]>y[i])exit 0;if(x[i]<y[i])exit 1}exit 0}' || die "отказ от downgrade $OLD → $VERSION; используйте --force"
[ ! -f /etc/config/yandex-internetometer ] || cp /etc/config/yandex-internetometer "$TMP/yandex-internetometer.backup.$(date +%Y%m%d%H%M%S)"
if command -v apk >/dev/null 2>&1; then
 ARCH="$(apk --print-arch 2>/dev/null)" || die 'не удалось определить apk-архитектуру'; say "Найден apk ($ARCH)." "Found apk ($ARCH)."; get "$BASE/keys/yandex-internetometer.rsa.pub" "$TMP/key"; mkdir -p /etc/apk/keys /etc/apk/repositories.d; cmp -s "$TMP/key" /etc/apk/keys/yandex-internetometer.rsa.pub 2>/dev/null || cp "$TMP/key" /etc/apk/keys/yandex-internetometer.rsa.pub; printf '%s\n' "$BASE/packages/$ARCH/yandex-internetometer/packages.adb" > /etc/apk/repositories.d/yandex-internetometer.list; say 'Обновляем список пакетов.' 'Updating package indexes.'; apk update; say "Устанавливаем версию $VERSION." "Installing version $VERSION."; apk add --upgrade "$PKG"
elif command -v opkg >/dev/null 2>&1; then
 say 'Найден opkg.' 'Found opkg.'; IPK="$PKG-$VERSION-openwrt-24.10-all.ipk"; RELEASE="https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/download/$TAG"; get "$RELEASE/SHA256SUMS" "$TMP/SHA256SUMS"; get "$RELEASE/$IPK" "$TMP/$IPK"; expected="$(awk -v f="$IPK" '$2==f || $2=="*"f{print $1}' "$TMP/SHA256SUMS" | head -1)"; actual="$(sha256sum "$TMP/$IPK" 2>/dev/null | awk '{print $1}')"; [ -n "$expected" ] && [ "$expected" = "$actual" ] || die 'не совпала SHA256-сумма IPK'; opkg install "$TMP/$IPK"
else die 'не найден apk или opkg'; fi
rm -f /tmp/luci-indexcache.* 2>/dev/null || true; [ ! -x /etc/init.d/rpcd ] || /etc/init.d/rpcd reload >/dev/null 2>&1 || true; [ -x /usr/bin/yandex-internetometer ] || die 'backend не установлен'; /usr/bin/yandex-internetometer status | grep -q '"ok"' || die 'backend status не вернул JSON'; say "Установлена версия $VERSION. LuCI → Статус → Интернетометр." "Installed version $VERSION. LuCI → Status → Internetometer."
