include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-yandex-internetometer
PKG_VERSION:=0.0.1
PKG_RELEASE:=18

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
	if [ -z "$$streams" ] || [ "$$streams" = "3" ]; then
		uci -q set yandex-internetometer.main.streams='8' 2>/dev/null || true
	fi
	upload_size="$$(uci -q get yandex-internetometer.main.upload_size 2>/dev/null || true)"
	if [ -z "$$upload_size" ] || [ "$$upload_size" = "12000000" ]; then
		uci -q set yandex-internetometer.main.upload_size='30720000' 2>/dev/null || true
	fi
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
