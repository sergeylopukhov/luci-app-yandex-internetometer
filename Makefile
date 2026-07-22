include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-yandex-internetometer
PKG_VERSION:=1.0.0
PKG_RELEASE:=22

PKG_MAINTAINER:=OpenWrt community
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for Yandex Internetometer-compatible speed test
LUCI_DEPENDS:=+curl +jq
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache.* 2>/dev/null || true
if command -v uci >/dev/null 2>&1; then
	streams="$$(uci -q get yandex-internetometer.main.streams 2>/dev/null || true)"
	if [ -z "$$streams" ]; then
		uci -q set yandex-internetometer.main.streams='6' 2>/dev/null || true
	fi
	upload_streams="$$(uci -q get yandex-internetometer.main.upload_streams 2>/dev/null || true)"
	if [ -z "$$upload_streams" ]; then
		uci -q set yandex-internetometer.main.upload_streams='6' 2>/dev/null || true
	fi
	protocol="$$(uci -q get yandex-internetometer.main.transfer_protocol 2>/dev/null || true)"
	[ -n "$$protocol" ] || uci -q set yandex-internetometer.main.transfer_protocol='http' 2>/dev/null || true
	download_time="$$(uci -q get yandex-internetometer.main.download_time 2>/dev/null || true)"
	[ -n "$$download_time" ] || uci -q set yandex-internetometer.main.download_time='15' 2>/dev/null || true
	upload_time="$$(uci -q get yandex-internetometer.main.upload_time 2>/dev/null || true)"
	[ -n "$$upload_time" ] || uci -q set yandex-internetometer.main.upload_time='25' 2>/dev/null || true
	latency_samples="$$(uci -q get yandex-internetometer.main.latency_samples 2>/dev/null || true)"
	[ -n "$$latency_samples" ] || uci -q set yandex-internetometer.main.latency_samples='60' 2>/dev/null || true
	upload_size="$$(uci -q get yandex-internetometer.main.upload_size 2>/dev/null || true)"
	if [ -z "$$upload_size" ]; then
		uci -q set yandex-internetometer.main.upload_size='8000000' 2>/dev/null || true
	fi
	upload_enabled="$$(uci -q get yandex-internetometer.main.upload_enabled 2>/dev/null || true)"
	[ -n "$$upload_enabled" ] || uci -q set yandex-internetometer.main.upload_enabled='1' 2>/dev/null || true
	debug="$$(uci -q get yandex-internetometer.main.debug 2>/dev/null || true)"
	[ -n "$$debug" ] || uci -q set yandex-internetometer.main.debug='0' 2>/dev/null || true
	uci -q commit yandex-internetometer 2>/dev/null || true
fi
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache.* 2>/dev/null || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot emits .apk on apk-based targets.
