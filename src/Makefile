# Native engine, built by the OpenWrt buildroot through luci.mk (compile/install targets).
# It needs only libc: the binary speaks plain HTTP and is installed next to the
# portable curl engine (transfer), which the CLI keeps for HTTPS.
CC ?= cc
CFLAGS ?= -Os
PREFIX ?= /usr

.PHONY: all compile clean install
all: compile
compile: transfer-native
transfer-native: transfer.c
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c99 -Wall -Wextra $< $(LDFLAGS) -o $@
install: transfer-native
	install -d $(DESTDIR)$(PREFIX)/libexec/yandex-internetometer
	install -m 0755 transfer-native $(DESTDIR)$(PREFIX)/libexec/yandex-internetometer/transfer-native
clean:
	rm -f transfer-native
