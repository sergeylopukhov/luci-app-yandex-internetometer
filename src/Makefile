CC ?= cc
CFLAGS ?= -O2
PREFIX ?= /usr

.PHONY: all compile clean install
all: compile
compile: transfer
transfer: transfer.c
	$(CC) $(CPPFLAGS) $(CFLAGS) -Wall -Wextra $< $(LDFLAGS) -lcurl -o $@
install: transfer
	install -d $(DESTDIR)$(PREFIX)/libexec/yandex-internetometer
	install -m 0755 transfer $(DESTDIR)$(PREFIX)/libexec/yandex-internetometer/transfer
clean:
	rm -f transfer
