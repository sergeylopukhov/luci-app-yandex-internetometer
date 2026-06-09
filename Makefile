include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-yandex-internetometer
PKG_VERSION:=0.0.1
PKG_RELEASE:=1

PKG_MAINTAINER:=OpenWrt community
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for Yandex Internetometer-compatible speed test
LUCI_DEPENDS:=+luci-base +curl +rpcd +uci +jq
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot emits .apk on apk-based targets.
