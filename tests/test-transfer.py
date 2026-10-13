"""Tests for the native engine (src/transfer.c) against a local HTTP/1.1 server.

The server emulates the Yandex CDN behaviour verified on the real service:
keep-alive downloads, upload-http POSTs answered with a non-empty "OK" body, and a
statsUrl SSE stream (chunked) reporting bytes the server actually read, in 50 ms ticks.
"""
import http.server
import json
import os
import pathlib
import resource
import re
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.parse

ENGINE = str(pathlib.Path(sys.argv.pop(1)).resolve())
CHUNK = 65536

class Counters:
    def __init__(self):
        self.lock = threading.Lock()
        self.reset()
    def reset(self):
        with getattr(self, 'lock', threading.Lock()):
            self.pending = {}
            self.total = {}
            self.ticks = []          # (server_ms, sid, bytes) as reported to the client
            self.drops = 0
    def add(self, sid, n):
        with self.lock:
            self.pending[sid] = self.pending.get(sid, 0) + n
            self.total[sid] = self.total.get(sid, 0) + n
    def take(self, sid):
        with self.lock:
            n = self.pending.get(sid, 0); self.pending[sid] = 0
            return n

C = Counters()

class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    def handle_error(self, request, address):
        pass

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def setup(self):
        super().setup()
        # Headers and the tiny OK body are separate writes in this fixture.
        # Disable Nagle so Linux delayed ACKs do not add 40 ms to every POST.
        self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    def log_message(self, *args):
        pass
    def params(self):
        q = urllib.parse.urlparse(self.path)
        return q.path, dict(urllib.parse.parse_qsl(q.query))
    def throttle(self, started, sent, rate):
        if rate:
            delay = started + sent * 8 / rate - time.monotonic()
            if delay > 0:
                time.sleep(delay)

    def do_GET(self):
        path, q = self.params()
        if path == '/stats':
            return self.stats(q)
        if path != '/dl':
            self.send_error(404); return
        mode = q.get('mode', '')
        if mode == 'fail':
            self.send_response(503); self.send_header('Content-Length', '0'); self.end_headers(); return
        size = 4 * 1024 * 1024
        self.send_response(200)
        self.send_header('Content-Length', str(size))
        self.end_headers()
        rate = float(q.get('rate', 0)); started = time.monotonic(); sent = 0
        with C.lock:
            drop = mode == 'drop' and C.drops < 2
            if drop: C.drops += 1
        while sent < size:
            if drop and sent >= size // 4:
                self.close_connection = True
                self.connection.shutdown(2)
                return
            n = min(CHUNK, size - sent)
            self.wfile.write(b'\0' * n); sent += n
            self.throttle(started, sent, rate)

    def stats(self, q):
        sid = q.get('sid', ''); life = float(q.get('life', 0)); born = time.monotonic()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Transfer-Encoding', 'chunked')
        self.end_headers()
        try:
            while not life or time.monotonic() - born < life:
                b = C.take(sid); t = int(time.time() * 1000)
                if q.get('freeze'):
                    t = int((time.time() - max(0, time.monotonic() - born - 1.8)) * 1000)
                with C.lock:
                    C.ticks.append((t, sid, b))
                event = f'data: {{"k":"u","b":{b},"i":50,"t":{t}}}\n\n'.encode()
                # Split every event across two chunks to exercise the de-chunker.
                for part in (event[:17], event[17:]):
                    self.wfile.write(b'%x\r\n' % len(part) + part + b'\r\n')
                self.wfile.flush()
                time.sleep(.05)
            self.connection.shutdown(2)
        except OSError:
            pass

    def do_POST(self):
        path, q = self.params()
        sid = q.get('sid', ''); mode = q.get('mode', ''); rate = float(q.get('rate', 0))
        size = int(self.headers['Content-Length'])
        if mode == 'fail':
            self.send_response(503); self.send_header('Content-Length', '0'); self.end_headers()
            self.close_connection = True; return
        if mode == 'stall':
            # Accept the connection but never read: send() still succeeds into kernel buffers.
            time.sleep(8); self.close_connection = True; return
        started = time.monotonic(); got = 0
        while got < size:
            data = self.rfile.read(min(CHUNK, size - got))
            if not data:
                return
            got += len(data); C.add(sid, len(data))
            self.throttle(started, got, rate)
        body = b'OK'
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server(('127.0.0.1', 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close()
    def setUp(self):
        C.reset()

    def run_engine(self, kind, lines, seconds=2, streams=2, size=1048576, stop_after=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); urls = root / 'urls'; sample = root / 'sample'
            urls.write_text(''.join(line + '\n' for line in lines))
            before = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
            started = time.monotonic()
            proc = subprocess.Popen([ENGINE, kind, str(seconds), str(streams), str(size), str(urls), str(sample)],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if stop_after is not None:
                time.sleep(stop_after); proc.send_signal(signal.SIGTERM)
            out, err = proc.communicate(timeout=seconds + 15)
            elapsed = time.monotonic() - started
            rss = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
            rss_kb = rss // 1024 if sys.platform == 'darwin' else rss
            if sys.platform == 'linux':
                # wait4 includes Python's RSS inherited by fork before exec.
                # VmHWM is the native process's own high-water mark after exec.
                peak = re.search(r'peak_rss_kb=(\d+)', err)
                rss_kb = int(peak.group(1)) if peak else None
            result = json.loads(sample.read_text()) if sample.exists() else None
            leftovers = [p.name for p in root.iterdir() if p.name not in ('urls', 'sample')]
            return proc.returncode, out, err, result, elapsed, rss_kb if sys.platform == 'linux' or rss > before else None, leftovers

    def up(self, sid='a', mode='', rate=0, life=0):
        extra = (f'&mode={mode}' if mode else '') + (f'&rate={rate}' if rate else '')
        return f'{self.base}/up?sid={sid}{extra}\t{self.base}/stats?sid={sid}' + (f'&life={life}' if life else '')

    # Upload: the result is the server's own count, not what send() accepted.
    def test_upload_matches_server_counter_with_ok_response(self):
        rate = 40e6
        code, out, err, sample, _, _, leftovers = self.run_engine('upload', [self.up('a', rate=rate), self.up('b', rate=rate)], seconds=3)
        self.assertEqual(code, 0, err)
        self.assertAlmostEqual(float(out), 2 * rate / 1e6, delta=2 * rate / 1e6 * 0.08)
        self.assertTrue(sample['final']); self.assertEqual(sample['errors'], 0)
        self.assertEqual(leftovers, [])

    def test_upload_reuses_connections(self):
        code, out, err, sample, _, rss_kb, _ = self.run_engine('upload', [self.up('a'), self.up('b')], seconds=2, size=262144)
        self.assertEqual(code, 0, err)
        self.assertGreater(sample['responses'], 6)          # many POSTs ...
        self.assertEqual(sample['connections'], 4)          # ... over 2 data + 2 counter connections
        if rss_kb is not None:
            self.assertLess(rss_kb, 8192, 'bounded memory')

    def test_socket_writes_without_server_reads_are_not_throughput(self):
        code, out, err, sample, _, _, _ = self.run_engine('upload', [self.up('a', mode='stall')], seconds=2, streams=1)
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertEqual(sample['average_mbps'], 0)

    def test_upload_http_error_is_not_success(self):
        code, out, err, sample, _, _, _ = self.run_engine('upload', [self.up('a', mode='fail')], seconds=2, streams=1)
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertGreater(sample['errors'], 0)

    def test_counter_lost_inside_window_is_not_success(self):
        code, out, err, sample, _, _, _ = self.run_engine('upload', [self.up('a', life=1.6)], seconds=3, streams=1)
        self.assertNotEqual(code, 0, out)
        self.assertIn('counter', err)

    def test_slow_upload(self):
        code, out, err, _, _, _, _ = self.run_engine('upload', [self.up('a', rate=4e6)], seconds=3, streams=1, size=65536)
        self.assertEqual(code, 0, err)
        self.assertAlmostEqual(float(out), 4.0, delta=0.4)

    def test_frozen_counter_cannot_finish_a_partial_window(self):
        code, out, err, _, _, _, _ = self.run_engine('upload', [self.up('a') + '&freeze=1'], seconds=3, streams=1)
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertIn('covered', err)

    # Download: bytes are counted on arrival inside [warm-up end, deadline].
    def test_download_rate_and_keep_alive(self):
        code, out, err, sample, _, _, leftovers = self.run_engine('download', [f'{self.base}/dl?rate=80e6'], seconds=3)
        self.assertEqual(code, 0, err)
        self.assertAlmostEqual(float(out), 160, delta=160 * 0.08)
        self.assertEqual(sample['connections'], 2)
        self.assertGreater(sample['responses'], 2)
        self.assertEqual(leftovers, [])

    def test_download_dropped_connection_is_retried(self):
        code, out, err, sample, _, _, _ = self.run_engine('download', [f'{self.base}/dl?mode=drop&rate=80e6'], seconds=2, streams=1)
        self.assertEqual(code, 0, err)
        self.assertEqual(sample['errors'], 2)
        self.assertGreater(float(out), 40)

    def test_download_http_error_is_not_success(self):
        code, out, err, sample, _, _, _ = self.run_engine('download', [f'{self.base}/dl?mode=fail'], seconds=2)
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertGreater(sample['errors'], 0)

    def test_unreachable_server_fails_quickly(self):
        code, out, err, _, elapsed, _, _ = self.run_engine('download', ['http://127.0.0.1:9/dl'], seconds=5, streams=1)
        self.assertNotEqual(code, 0)
        self.assertLess(elapsed, 4)

    def test_stop_ends_promptly(self):
        code, out, err, sample, elapsed, _, leftovers = self.run_engine('upload', [self.up('a')], seconds=20, streams=2, stop_after=1.5)
        self.assertEqual(code, 130)
        self.assertEqual(out, '')
        self.assertLess(elapsed, 3)
        self.assertTrue(sample['final'])
        self.assertEqual(leftovers, [])

    def test_rejects_https_and_bad_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            urls = pathlib.Path(tmp) / 'urls'
            for text in ('https://example.cdn.yandex.net/x\n', '', 'http://h/x\n'):
                urls.write_text(text)
                kind = 'upload' if text.startswith('http://h') else 'download'
                r = subprocess.run([ENGINE, kind, '2', '1', '1024', str(urls), str(pathlib.Path(tmp) / 's')], capture_output=True, timeout=3)
                self.assertEqual(r.returncode, 2, text)
        self.assertEqual(subprocess.run([ENGINE, '--probe'], capture_output=True).returncode, 0)

if __name__ == '__main__':
    unittest.main()
