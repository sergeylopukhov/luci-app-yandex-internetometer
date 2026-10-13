include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-yandex-internetometer
PKG_VERSION:=2.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=Sergey Lopukhov <sergey.lopukhov@gmail.com>
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for Yandex Internetometer-compatible speed test
LUCI_DEPENDS:=+curl +jq
LUCI_PKGARCH:=$(ARCH)

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache.* 2>/dev/null || true
if [ -x /usr/libexec/yandex-internetometer/migrate-settings ]; then
	/usr/libexec/yandex-internetometer/migrate-settings || echo 'yandex-internetometer: settings migration will be retried on the next upgrade' >&2
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
