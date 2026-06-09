#!/usr/bin/env python3

import ast
import struct
import sys


def sfh_hash(data: bytes, init: int) -> int:
    if not data:
        return 0

    h = init & 0xFFFFFFFF
    length = len(data)
    rem = length & 3
    pos = 0
    blocks = length >> 2

    for _ in range(blocks):
        h = (h + (data[pos] | (data[pos + 1] << 8))) & 0xFFFFFFFF
        tmp = (((data[pos + 2] | (data[pos + 3] << 8)) << 11) ^ h) & 0xFFFFFFFF
        h = (((h << 16) & 0xFFFFFFFF) ^ tmp) & 0xFFFFFFFF
        pos += 4
        h = (h + (h >> 11)) & 0xFFFFFFFF

    if rem == 3:
        h = (h + (data[pos] | (data[pos + 1] << 8))) & 0xFFFFFFFF
        h ^= (h << 16) & 0xFFFFFFFF
        h ^= (data[pos + 2] << 18) & 0xFFFFFFFF
        h = (h + (h >> 11)) & 0xFFFFFFFF
    elif rem == 2:
        h = (h + (data[pos] | (data[pos + 1] << 8))) & 0xFFFFFFFF
        h ^= (h << 11) & 0xFFFFFFFF
        h = (h + (h >> 17)) & 0xFFFFFFFF
    elif rem == 1:
        h = (h + data[pos]) & 0xFFFFFFFF
        h ^= (h << 10) & 0xFFFFFFFF
        h = (h + (h >> 1)) & 0xFFFFFFFF

    h ^= (h << 3) & 0xFFFFFFFF
    h = (h + (h >> 5)) & 0xFFFFFFFF
    h ^= (h << 4) & 0xFFFFFFFF
    h = (h + (h >> 17)) & 0xFFFFFFFF
    h ^= (h << 25) & 0xFFFFFFFF
    h = (h + (h >> 6)) & 0xFFFFFFFF
    return h & 0xFFFFFFFF


def parse_po(path: str):
    entries = []
    current = None
    active = None

    def flush():
        nonlocal current
        if current is not None:
            entries.append(current)
        current = {
            "msgctxt": None,
            "msgid": "",
            "msgid_plural": None,
            "msgstr": {},
        }

    def parse_quoted(line: str) -> str:
        return ast.literal_eval(line[line.index('"'):])

    flush()
    with open(path, "r", encoding="utf-8") as src:
        for raw in src:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue

            if line.startswith("msgctxt "):
                current["msgctxt"] = parse_quoted(line)
                active = ("msgctxt", None)
            elif line.startswith("msgid_plural "):
                current["msgid_plural"] = parse_quoted(line)
                active = ("msgid_plural", None)
            elif line.startswith("msgid "):
                if current["msgid"] or current["msgstr"]:
                    flush()
                current["msgid"] = parse_quoted(line)
                active = ("msgid", None)
            elif line.startswith("msgstr["):
                idx = int(line.split("]", 1)[0][7:])
                current["msgstr"][idx] = parse_quoted(line)
                active = ("msgstr", idx)
            elif line.startswith("msgstr "):
                current["msgstr"][0] = parse_quoted(line)
                active = ("msgstr", 0)
            elif line.startswith('"') and active:
                value = parse_quoted(line)
                field, idx = active
                if field == "msgstr":
                    current[field][idx] = current[field].get(idx, "") + value
                else:
                    current[field] = (current[field] or "") + value

    flush()
    return entries


def write_lmo(entries, path: str):
    values = bytearray()
    index = []

    for entry in entries:
        msgid = entry["msgid"]
        msgstr = entry["msgstr"].get(0, "")
        if not msgid or not msgstr or msgid == msgstr:
            continue

        key = msgid
        if entry["msgctxt"]:
            key = entry["msgctxt"] + "\x01" + key

        key_bytes = key.encode("utf-8")
        val_bytes = msgstr.encode("utf-8")
        offset = len(values)
        values.extend(val_bytes)
        while len(values) % 4:
            values.append(0)

        index.append((
            sfh_hash(key_bytes, len(key_bytes)),
            0,
            offset,
            len(val_bytes),
        ))

    index.sort(key=lambda item: item[0])
    index_offset = len(values)

    with open(path, "wb") as out:
        out.write(values)
        for item in index:
            out.write(struct.pack(">IIII", *item))
        out.write(struct.pack(">I", index_offset))


def main(argv):
    if len(argv) != 3:
        print("Usage: po2lmo.py input.po output.lmo", file=sys.stderr)
        return 1
    write_lmo(parse_po(argv[1]), argv[2])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
