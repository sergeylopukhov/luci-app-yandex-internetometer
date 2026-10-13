"""Package contents: real architecture labels, matching static native binaries, migration hooks.

usage: python3 tests/test-packages.py [native-dir] [arch...]
Without native-dir the native engine is built with zig for the listed (or a default) set.
"""
import io
import pathlib
import struct
import subprocess
import sys
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = (ROOT / 'root/usr/share/yandex-internetometer/version').read_text().strip()
# OpenWrt package architecture -> (ELF e_machine, ELF class bits, little endian)
ELF = {
    'aarch64': (183, 64, True), 'arm': (40, 32, True), 'mips': (8, 32, False), 'mipsel': (8, 32, True),
    'mips64': (8, 64, False), 'mips64el': (8, 64, True), 'powerpc': (20, 32, False),
    'powerpc64': (21, 64, False), 'ppc64le': (21, 64, True), 'riscv64': (243, 64, True),
    'x86': (3, 32, True), 'i386': (3, 32, True), 'x86_64': (62, 64, True),
}
NO_NATIVE = {'arm_fa526', 'arm_arm926ej-s', 'arm_xscale', 'armeb_xscale'}

def family(arch):
    for prefix in ('mips64el', 'mips64', 'mipsel', 'mips', 'aarch64', 'x86_64', 'ppc64le', 'powerpc64', 'powerpc', 'riscv64', 'i386', 'x86'):
        if arch == prefix or arch.startswith(prefix + '_'):
            return prefix
    if arch.startswith('arm'):
        return 'arm'
    raise SystemExit(f'unknown arch {arch}')

def elf_info(data):
    assert data[:4] == b'\x7fELF', 'not an ELF file'
    bits = 64 if data[4] == 2 else 32
    little = data[5] == 1
    e = '<' if little else '>'
    machine = struct.unpack(e + 'H', data[18:20])[0]
    if bits == 64:
        phoff, = struct.unpack(e + 'Q', data[32:40]); phentsize, phnum = struct.unpack(e + 'HH', data[54:58])
    else:
        phoff, = struct.unpack(e + 'I', data[28:32]); phentsize, phnum = struct.unpack(e + 'HH', data[42:46])
    types = [struct.unpack(e + 'I', data[phoff + i * phentsize: phoff + i * phentsize + 4])[0] for i in range(phnum)]
    return machine, bits, little, 3 in types  # PT_INTERP = 3

def members(ipk):
    outer = tarfile.open(ipk)
    get = lambda name: tarfile.open(fileobj=io.BytesIO(outer.extractfile('./' + name).read()))
    return outer.getnames(), get('control.tar.gz'), get('data.tar.gz')

def main():
    args = sys.argv[1:]
    native = pathlib.Path(args.pop(0)) if args and not args[0].startswith(('aarch64', 'arm', 'mips', 'x86', 'i386', 'powerpc', 'ppc', 'riscv')) else None
    arches = args or ['aarch64_cortex-a53', 'arm_cortex-a7_neon-vfpv4', 'mipsel_24kc', 'mips_24kc', 'x86_64', 'arm_arm926ej-s']
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        subprocess.run(['sh', str(ROOT / 'scripts/stage-root.sh'), str(tmp / 'root')], check=True)
        if native is None:
            native = tmp / 'native'
            subprocess.run(['sh', str(ROOT / 'scripts/build-native.sh'), str(native)] + arches, check=True, stdout=subprocess.DEVNULL)
        for arch in arches:
            ipk = tmp / f'luci-app-yandex-internetometer-{VERSION}-openwrt-24.10-{arch}.ipk'
            subprocess.run(['sh', str(ROOT / 'scripts/build-ipk.sh'), str(tmp / 'root'), str(native), arch, VERSION + '-r1', str(ipk)], check=True)
            outer, control, data = members(ipk)
            def check(cond, msg):
                if not cond: failures.append(f'{arch}: {msg}')
            fields = dict(line.split(': ', 1) for line in control.extractfile('./control').read().decode().splitlines() if ': ' in line)
            check(fields.get('Architecture') == arch, f"Architecture is {fields.get('Architecture')}")
            check(fields.get('Version') == VERSION + '-r1', 'version')
            check('migrate-settings' in control.extractfile('./postinst').read().decode(), 'postinst does not migrate settings')
            names = set(data.getnames())
            for path in ('./usr/bin/yandex-internetometer', './usr/libexec/yandex-internetometer/transfer',
                         './usr/libexec/yandex-internetometer/migrate-settings', './etc/config/yandex-internetometer',
                         './www/luci-static/resources/view/status/yandex-internetometer-live.js',
                         './usr/lib/lua/luci/i18n/yandex-internetometer.ru.lmo', './usr/share/yandex-internetometer/version'):
                check(path in names, f'missing {path}')
            check(not any(n.endswith('.DS_Store') for n in names), '.DS_Store in package')
            check(data.extractfile('./usr/share/yandex-internetometer/version').read().decode().strip() == VERSION, 'version file')
            check("option settings_version '2'" in data.extractfile('./etc/config/yandex-internetometer').read().decode(), 'config marker')
            native_path = './usr/libexec/yandex-internetometer/transfer-native'
            if arch in NO_NATIVE:
                check(native_path not in names, 'ARMv4/v5 package must fall back to the curl engine')
                continue
            check(native_path in names, 'native engine missing')
            if native_path in names:
                member = data.getmember(native_path)
                check(member.mode & 0o111, 'native engine not executable')
                machine, bits, little, interp = elf_info(data.extractfile(native_path).read())
                want = ELF[family(arch)]
                check((machine, bits, little) == want, f'ELF {machine}/{bits}/{"LE" if little else "BE"} does not match {want}')
                check(not interp, 'native engine is dynamically linked')
            print(f'{arch}: Architecture={fields.get("Architecture")} files={len(names)} native={"no" if arch in NO_NATIVE else "static ELF ok"}')
    if failures:
        raise SystemExit('package tests failed:\n' + '\n'.join(failures))
    print('package tests: ok')

if __name__ == '__main__':
    main()
