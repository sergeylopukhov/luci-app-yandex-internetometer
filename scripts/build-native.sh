#!/bin/sh
# Build the static native engine for every package architecture with zig.
# usage: scripts/build-native.sh <output-dir> [arch...]
#        scripts/build-native.sh --list    (every published package architecture)
# Each OpenWrt package architecture maps to a zig target and a baseline CPU of the
# same ISA family; the binary never depends on the router's libc or libcurl.
# ARMv4/ARMv5 have no atomic instructions required by the zig libc: their packages
# ship without the native engine and the CLI uses the portable curl engine.
set -eu
out="${1:?output directory}"; shift
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/src/transfer.c"

target_for() {
  case "$1" in
    aarch64|aarch64_generic|aarch64_cortex-a53|aarch64_cortex-a72|aarch64_cortex-a76) echo 'aarch64-linux-musl generic' ;;
    arm_fa526|arm_arm926ej-s|arm_xscale|armeb_xscale) echo 'none none' ;;
    armhf|armv7|arm_arm1176jzf-s_vfp|arm_cortex-a5_vfpv4|arm_cortex-a7|arm_cortex-a7_neon-vfpv4|arm_cortex-a7_vfpv4|arm_cortex-a8_vfpv3|arm_cortex-a9|arm_cortex-a9_neon|arm_cortex-a9_vfpv3-d16|arm_cortex-a15_neon-vfpv4)
      echo 'arm-linux-musleabi arm1176jz_s' ;;
    mips|mips_24kc|mips_4kec|mips_mips32) echo 'mips-linux-musleabi mips32+soft_float' ;;
    mipsel|mipsel_24kc|mipsel_24kc_24kf|mipsel_74kc|mipsel_mips32) echo 'mipsel-linux-musleabi mips32+soft_float' ;;
    mips64|mips64_mips64r2|mips64_octeonplus) echo 'mips64-linux-muslabi64 mips64r2' ;;
    mips64el|mips64el_mips64r2) echo 'mips64el-linux-muslabi64 mips64r2' ;;
    powerpc_464fp|powerpc_8548) echo 'powerpc-linux-musleabi ppc-hard_float' ;;
    powerpc64_e5500) echo 'powerpc64-linux-musl ppc64' ;;
    ppc64le) echo 'powerpc64le-linux-musl ppc64le' ;;
    riscv64|riscv64_generic|riscv64_riscv64) echo 'riscv64-linux-musl baseline_rv64' ;;
    x86|i386_pentium-mmx|i386_pentium4) echo 'x86-linux-musl i486' ;;
    x86_64) echo 'x86_64-linux-musl x86_64' ;;
    *) return 1 ;;
  esac
}

ALL_ARCHES="aarch64 aarch64_cortex-a53 aarch64_cortex-a72 aarch64_cortex-a76 aarch64_generic armhf armv7
arm_arm1176jzf-s_vfp arm_arm926ej-s arm_cortex-a15_neon-vfpv4 arm_cortex-a5_vfpv4 arm_cortex-a7
arm_cortex-a7_neon-vfpv4 arm_cortex-a7_vfpv4 arm_cortex-a8_vfpv3 arm_cortex-a9 arm_cortex-a9_neon
arm_cortex-a9_vfpv3-d16 arm_fa526 arm_xscale armeb_xscale x86 i386_pentium-mmx i386_pentium4 mips mipsel
mips64 mips64el mips64_mips64r2 mips64_octeonplus mips64el_mips64r2 mips_24kc mips_4kec mips_mips32
mipsel_24kc mipsel_24kc_24kf mipsel_74kc mipsel_mips32 powerpc64_e5500 powerpc_464fp powerpc_8548 ppc64le
riscv64 riscv64_generic riscv64_riscv64 x86_64"
if [ "$out" = --list ]; then printf '%s\n' $ALL_ARCHES; exit 0; fi
[ "$#" -gt 0 ] || set -- $ALL_ARCHES

mkdir -p "$out/.cache"
for arch in "$@"; do
  spec="$(target_for "$arch")" || { echo "unknown architecture: $arch" >&2; exit 1; }
  set -- $spec; target="$1"; cpu="$2"
  if [ "$target" = none ]; then printf '%s none\n' "$arch"; continue; fi
  key="$(printf '%s' "$target-$cpu" | tr '+' '_')"
  if [ ! -f "$out/.cache/$key" ]; then
    zig cc -target "$target" -mcpu="$cpu" -std=c99 -Wall -Wextra -Werror -Wno-error=option-ignored -Wno-option-ignored -Os -static -s \
      -ffunction-sections -fdata-sections -Wl,--gc-sections "$src" -o "$out/.cache/$key"
  fi
  mkdir -p "$out/$arch"
  cp "$out/.cache/$key" "$out/$arch/transfer-native"
  chmod 755 "$out/$arch/transfer-native"
  printf '%s %s %s\n' "$arch" "$target" "$cpu"
done
