include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-yandex-internetometer
PKG_VERSION:=0.0.1
PKG_RELEASE:=4

PKG_MAINTAINER:=OpenWrt community
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for Yandex Internetometer-compatible speed test
LUCI_DEPENDS:=+curl +jq
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache.* 2>/dev/null || true
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
