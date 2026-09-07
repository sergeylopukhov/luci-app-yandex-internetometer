"""Local deterministic HTTP fixtures; no public speed-test traffic."""
import http.server
import json
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
    def handle_error(self, request, address): pass
class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    connections = set()
    bad_payload = False
    def log_message(self, *a): pass
    def do_GET(self):
        self.connections.add(self.client_address)
        if self.path == '/fail':
            self.send_error(503); return
        self.send_response(200); self.send_header('Content-Length', str(1024*1024)); self.end_headers()
        for _ in range(64):
            self.wfile.write(b'0'*16384); time.sleep(.001)
    def do_POST(self):
        self.connections.add(self.client_address)
        left = int(self.headers['Content-Length'])
        while left:
            data = self.rfile.read(min(left,16384))
            if not data: return
            if data.strip(b'\0'): Handler.bad_payload = True
            left -= len(data)
            time.sleep(.001)
        self.send_response(200); self.send_header('Content-Length','0'); self.end_headers()

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server(('127.0.0.1',0), Handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.server.shutdown()
    def invoke(self, kind, path='/', cancel=False):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp); urls=root/'urls'; sample=root/'sample'
            urls.write_text(f'http://127.0.0.1:{self.server.server_port}{path}\n')
            started=time.monotonic()
            proc=subprocess.Popen([ENGINE,kind,'1','2','262144',str(urls),str(sample)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            if cancel:
                
                for _ in range(100):
                    if sample.exists(): break
                    time.sleep(.01)
                time.sleep(.1); proc.terminate()
            out,err=proc.communicate(timeout=5)
            return proc.returncode,out,err,json.loads(sample.read_text()),time.monotonic()-started
    def test_download_reuses_connections_and_deadline(self):
        Handler.connections=set()
        code,out,err,sample,elapsed=self.invoke('download')
        self.assertEqual(code,0,err)
        self.assertGreater(float(out),1)
        self.assertGreater(sample['responses'],2)
        self.assertLessEqual(len(Handler.connections),2)
        self.assertGreater(elapsed,1.9); self.assertLess(elapsed,2.5)
        self.assertTrue(sample['final'])
    def test_upload_streams_zeros_and_reuses_connections(self):
        Handler.connections=set(); Handler.bad_payload=False
        code,out,err,sample,_=self.invoke('upload')
        self.assertEqual(code,0,err); self.assertGreater(float(out),1)
        self.assertFalse(Handler.bad_payload)
        self.assertLessEqual(len(Handler.connections),2)
    def test_http_failure_is_not_success(self):
        code,out,err,sample,_=self.invoke('download','/fail')
        self.assertNotEqual(code,0); self.assertEqual(out,''); self.assertGreater(sample['errors'],0)
    def test_cancellation(self):
        code,out,err,sample,elapsed=self.invoke('upload',cancel=True)
        self.assertEqual(code,130); self.assertEqual(out,''); self.assertLess(elapsed,2)

if __name__ == '__main__': unittest.main()
