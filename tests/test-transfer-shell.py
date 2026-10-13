"""Regression tests for the portable engine actually shipped in release packages."""
import http.server
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ENGINE = str(pathlib.Path(sys.argv.pop(1)).resolve())

class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    def handle_error(self, request, address):
        pass

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    uploads = []
    def log_message(self, *args):
        pass
    def handle_expect_100(self):
        # Reproduce a server that reads the body without sending 100 Continue.
        return True
    def do_GET(self):
        if self.path == '/fail':
            self.send_error(503)
            return
        data = b'' if self.path == '/empty' else b'0' * 262144
        self.send_response(200)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        time.sleep(.01)
    def do_POST(self):
        if self.path == '/fail':
            self.send_error(503)
            return
        size = int(self.headers['Content-Length'])
        data = self.rfile.read(size)
        Handler.uploads.append((size, len(data), bool(data.strip(b'\0')), self.headers.get('Expect')))
        body = b'OK'  # Deliberately no trailing newline: issue #3.
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        time.sleep(.02)

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server(('127.0.0.1', 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
    def invoke(self, kind, path='/', size=262144, cancel=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            urls = root / 'urls'; sample = root / 'sample'
            urls.write_text(f'http://127.0.0.1:{self.server.server_port}{path}\n')
            started = time.monotonic()
            proc = subprocess.Popen(['sh', ENGINE, kind, '2', '2', str(size), str(urls), str(sample)],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if cancel:
                for _ in range(100):
                    if sample.exists():
                        break
                    time.sleep(.01)
                proc.terminate()
            out, err = proc.communicate(timeout=6)
            result = json.loads(sample.read_text()) if sample.exists() else None
            leftovers = list(root.glob('sample.parts')) + list(root.glob('sample.payload'))
            return proc.returncode, out, err, result, time.monotonic()-started, leftovers
    def test_upload_response_body_does_not_corrupt_byte_counter(self):
        code, out, err, sample, elapsed, leftovers = self.invoke('upload')
        self.assertEqual(code, 0, err)
        self.assertGreater(float(out), 1)
        self.assertGreater(sample['responses'], 0)
        self.assertEqual(sample['errors'], 0)
        self.assertTrue(sample['final'])
        self.assertLess(elapsed, 3.2)
        self.assertEqual(leftovers, [])
    def test_upload_streams_exact_zeros_without_expect_wait(self):
        Handler.uploads = []
        code, out, err, sample, _, _ = self.invoke('upload', size=1048577)
        self.assertEqual(code, 0, err)
        self.assertTrue(Handler.uploads)
        self.assertTrue(all(x == (1048577, 1048577, False, None) for x in Handler.uploads))
        self.assertGreater(sample['responses'], 4)
    def test_download(self):
        code, out, err, sample, _, leftovers = self.invoke('download')
        self.assertEqual(code, 0, err)
        self.assertGreater(float(out), 1)
        self.assertTrue(sample['final'])
        self.assertEqual(leftovers, [])
    def test_upload_http_failure_is_not_success(self):
        code, out, err, sample, _, _ = self.invoke('upload', '/fail')
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertGreater(sample['errors'], 0)
    def test_download_http_failure_is_not_success(self):
        code, out, err, sample, _, _ = self.invoke('download', '/fail')
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertGreater(sample['errors'], 0)
    def test_zero_bytes_is_not_success(self):
        code, out, err, sample, _, _ = self.invoke('download', '/empty')
        self.assertNotEqual(code, 0)
        self.assertEqual(out, '')
        self.assertEqual(sample['average_mbps'], 0)
        self.assertTrue(sample['final'])
    def test_cancellation_stops_workers(self):
        code, out, err, sample, elapsed, leftovers = self.invoke('upload', cancel=True)
        self.assertEqual(code, 130, err)
        self.assertEqual(out, '')
        self.assertLess(elapsed, 2)
        self.assertEqual(leftovers, [])
    def test_empty_urls_is_not_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); urls = root / 'urls'; urls.touch()
            result = subprocess.run(['sh', ENGINE, 'upload', '2', '2', '1024', str(urls), str(root/'sample')],
                                    capture_output=True, timeout=3)
            self.assertEqual(result.returncode, 2)

if __name__ == '__main__':
    unittest.main()
