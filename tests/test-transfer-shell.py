"""Regression tests for the portable engine actually shipped in release packages.

The local server emulates the upload-http protocol observed on the Yandex CDN:
a POST body (chunked, as curl sends a stream from stdin) and a statsUrl SSE stream
that reports bytes the server has received, in 50 ms ticks, as field "b".
"""
import http.server
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ENGINE = str(pathlib.Path(sys.argv.pop(1)).resolve())

class Counter:
    """Server-side truth: bytes received per sid and bytes not yet reported."""
    def __init__(self):
        self.lock = threading.Lock()
        self.total = 0
        self.pending = 0
        self.expect_headers = []
        self.stats_requests = 0
    def add(self, n):
        with self.lock:
            self.total += n
            self.pending += n
    def take(self):
        with self.lock:
            n, self.pending = self.pending, 0
            return n

COUNTER = Counter()

class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    def handle_error(self, request, address):
        pass

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *args):
        pass
    def do_GET(self):
        if self.path.startswith('/upload-http?type=stats&sid=missing'):
            self.send_error(503)
            return
        if self.path.startswith('/upload-http?type=stats'):
            return self.stats()
        if self.path.startswith('/fail'):
            self.send_error(503)
            return
        if self.path == '/empty':
            data = b''
        else:
            data = b'0' * 262144
        self.send_response(200)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        time.sleep(.01)
    def stats(self):
        COUNTER.stats_requests += 1
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Connection', 'close')
        self.end_headers()
        try:
            while True:
                b = COUNTER.take()
                self.wfile.write(f'data: {{"k":"u","b":{b},"i":50,"t":{int(time.time()*1000)}}}\n\n'.encode())
                self.wfile.flush()
                time.sleep(.05)
        except (BrokenPipeError, ConnectionResetError):
            pass
    def do_POST(self):
        COUNTER.expect_headers.append(self.headers.get('Expect'))
        if self.path.startswith('/fail'):
            self.send_error(503)
            return
        if 'chunked' in self.headers.get('Transfer-Encoding', ''):
            try:
                while True:
                    size = int(self.rfile.readline().strip().split(b';')[0], 16)
                    if size == 0:
                        self.rfile.readline()
                        break
                    data = self.rfile.read(size)
                    self.rfile.readline()
                    COUNTER.add(len(data))
            except (ValueError, ConnectionResetError, BrokenPipeError):
                return
        else:
            size = int(self.headers['Content-Length'])
            COUNTER.add(len(self.rfile.read(size)))
        body = b'OK'  # The response is never counted as upload bytes.
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server(('127.0.0.1', 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
    def base(self):
        return f'http://127.0.0.1:{self.server.server_port}'
    def invoke(self, kind, post='/upload-http?type=upload&sid=ok', stats='/upload-http?type=stats&sid=ok', duration=2, streams=2, cancel=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            urls = root / 'urls'; sample = root / 'sample'
            if kind == 'upload':
                urls.write_text(f'{self.base()}{post}\t{self.base()}{stats}\n')
            else:
                urls.write_text(f'{self.base()}{post}\n')
            started = time.monotonic()
            proc = subprocess.Popen(['sh', ENGINE, kind, str(duration), str(streams), '1048576', str(urls), str(sample)],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if cancel:
                for _ in range(200):
                    if sample.exists():
                        break
                    time.sleep(.01)
                proc.terminate()
            out, err = proc.communicate(timeout=duration + 10)
            result = json.loads(sample.read_text()) if sample.exists() else None
            leftovers = [p.name for p in root.iterdir() if p.name not in ('urls', 'sample')]
            return proc.returncode, out, err, result, time.monotonic() - started, leftovers

    def test_upload_average_matches_server_counter(self):
        before = COUNTER.total
        code, out, err, sample, elapsed, leftovers = self.invoke('upload', duration=3)
        received = COUNTER.total - before
        self.assertEqual(code, 0, err)
        rate = float(out)
        self.assertGreater(rate, 1)
        self.assertTrue(sample['final'])
        self.assertEqual(sample['errors'], 0)
        self.assertGreater(sample['responses'], 0)
        # Server bytes over the 3 s window, minus the 1 s warm-up, must match the reported average.
        expected = received * 8 / 3 / 1e6
        self.assertLess(abs(rate - expected) / expected, 0.35, (rate, expected))
        self.assertEqual(leftovers, [])
        self.assertLess(elapsed, 6)

    def test_upload_body_is_streamed_without_expect_wait(self):
        COUNTER.expect_headers.clear()
        COUNTER.stats_requests = 0
        code, out, err, sample, _, _ = self.invoke('upload', duration=2)
        self.assertEqual(code, 0, err)
        self.assertTrue(COUNTER.expect_headers)
        self.assertTrue(all(h in (None, '') for h in COUNTER.expect_headers), COUNTER.expect_headers)
        self.assertEqual(COUNTER.stats_requests, 1, 'one counter per probe even with multiple streams')

    def test_upload_http_error_is_not_success(self):
        code, out, err, sample, _, _ = self.invoke('upload', post='/fail?type=upload&sid=x')
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertGreater(sample['errors'], 0)

    def test_upload_without_server_counter_is_not_success(self):
        code, out, err, sample, _, _ = self.invoke('upload', stats='/upload-http?type=stats&sid=missing')
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertTrue(sample['final'])

    def test_download(self):
        code, out, err, sample, _, leftovers = self.invoke('download', post='/down')
        self.assertEqual(code, 0, err)
        self.assertGreater(float(out), 1)
        self.assertTrue(sample['final'])
        self.assertEqual(leftovers, [])

    def test_download_http_failure_is_not_success(self):
        code, out, err, sample, _, _ = self.invoke('download', post='/fail')
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertGreater(sample['errors'], 0)

    def test_zero_bytes_download_is_not_success(self):
        code, out, err, sample, _, _ = self.invoke('download', post='/empty')
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertEqual(sample['average_mbps'], 0)
        self.assertTrue(sample['final'])

    def test_cancellation_stops_workers(self):
        code, out, err, sample, elapsed, leftovers = self.invoke('upload', duration=10, cancel=True)
        self.assertEqual(code, 130, err)
        self.assertEqual(out, '')
        self.assertLess(elapsed, 4)
        self.assertEqual(leftovers, [])

    def test_empty_urls_is_not_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); urls = root / 'urls'; urls.touch()
            result = subprocess.run(['sh', ENGINE, 'upload', '2', '2', '1024', str(urls), str(root/'sample')],
                                    capture_output=True, timeout=3)
            self.assertEqual(result.returncode, 2)

if __name__ == '__main__':
    unittest.main()
