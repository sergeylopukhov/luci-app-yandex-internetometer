#!/bin/sh

set -eu

PKG="luci-app-yandex-internetometer"
BASE_URL="https://sergeylopukhov.github.io/luci-app-yandex-internetometer"
RELEASE_URL="https://github.com/sergeylopukhov/luci-app-yandex-internetometer/releases/download/v0.0.1"
KEY_URL="$BASE_URL/keys/yandex-internetometer.rsa.pub"
IPK_URL="$RELEASE_URL/luci-app-yandex-internetometer-0.0.1-openwrt-24.10-all.ipk"

log() {
	printf '%s\n' "$*"
}

fail() {
	printf 'Ошибка: %s\n' "$*" >&2
	exit 1
}

need_root() {
	if [ "$(id -u)" != "0" ]; then
		fail "запустите установщик от root"
	fi
}

download() {
	url="$1"
	out="$2"

	if command -v curl >/dev/null 2>&1; then
		curl -fsSL -o "$out" "$url"
	elif command -v wget >/dev/null 2>&1; then
		wget -q -O "$out" "$url"
	else
		fail "нужен curl или wget"
	fi
}

reload_luci() {
	rm -f /tmp/luci-indexcache.* 2>/dev/null || true
	if [ -x /etc/init.d/rpcd ]; then
		/etc/init.d/rpcd reload >/dev/null 2>&1 || /etc/init.d/rpcd restart >/dev/null 2>&1 || true
	fi
}

install_with_apk() {
	arch="$(apk --print-arch 2>/dev/null)" || fail "не удалось определить apk-архитектуру"
	repo_url="$BASE_URL/packages/$arch/yandex-internetometer/packages.adb"

	log "Найден apk. Настраиваю репозиторий для архитектуры $arch."

	mkdir -p /etc/apk/keys /etc/apk/repositories.d
	download "$KEY_URL" /etc/apk/keys/yandex-internetometer.rsa.pub
	printf '%s\n' "$repo_url" > /etc/apk/repositories.d/yandex-internetometer.list

	rm -f /var/cache/apk/* 2>/dev/null || true
	apk update

	if apk info -e "$PKG" >/dev/null 2>&1; then
		log "Пакет уже установлен. Проверяю обновление."
		apk add --upgrade "$PKG" || apk upgrade "$PKG"
	else
		log "Устанавливаю пакет."
		apk add "$PKG"
	fi

	reload_luci
	log "Готово. Откройте LuCI: Status -> Internetometer."
}

install_with_opkg() {
	tmp="/tmp/$PKG.ipk"

	log "Найден opkg. Скачиваю IPK из GitHub Release."
	log "Важно: эта ветка установщика собрана для legacy opkg, но проверялась только APK-установка."

	download "$IPK_URL" "$tmp"
	opkg update || true
	opkg install "$tmp"
	rm -f "$tmp"

	reload_luci
	log "Готово. Откройте LuCI: Status -> Internetometer."
}

main() {
	need_root

	if command -v apk >/dev/null 2>&1; then
		install_with_apk
	elif command -v opkg >/dev/null 2>&1; then
		install_with_opkg
	else
		fail "не найден ни apk, ни opkg"
	fi
}

main "$@"
