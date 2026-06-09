# Manual testing

1. Build the package with an apk-based OpenWrt SDK/buildroot.
2. Install it on the router:

```sh
apk add --allow-untrusted ./luci-app-yandex-internetometer-*.apk
```

3. Confirm CLI JSON output:

```sh
yandex-internetometer run --json
```

4. Confirm the LuCI menu item appears under:

```text
Status -> Yandex Internetometer
```

5. Start a test from LuCI and confirm the running indicator appears.
6. Confirm result cards update after the test finishes.
7. Switch LuCI language to Russian and confirm Russian UI strings.
8. Switch LuCI language to English and confirm English UI strings.
9. Simulate endpoint failure by blocking `yandex.ru` or Yandex CDN DNS and confirm the backend returns clean JSON with `ok=false`.
10. Start two tests at once:

```sh
yandex-internetometer start
yandex-internetometer run --json
```

Confirm the second command reports `running=true` instead of starting another measurement.

11. Reboot the router and confirm no stale running state remains:

```sh
yandex-internetometer status
```

The status should return valid JSON and `running=false` unless a new test is active.
