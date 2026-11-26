import copy
import json
from pathlib import Path
import sys
import tempfile
import shutil
import threading
import unittest
from unittest.mock import patch
import urllib.request
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import workbench_server as server


class ResearchTests(unittest.TestCase):
    def test_fresh_checkout_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            fresh = Path(directory)
            shutil.copy(server.ROOT / 'config.free.example.json', fresh)
            with patch.object(server, 'ROOT', fresh), patch.object(server, 'STATE', fresh / 'state'):
                config = server.settings()
                self.assertEqual(config['known_terms'], [])
                self.assertEqual(config['sources'], ['hf', 'breakout', 'sitemaps'])
                self.assertEqual(server.read(fresh / 'config.json')['lang'], 'zh')
                before = (fresh / 'config.json').read_bytes()
                server.settings()
                self.assertEqual((fresh / 'config.json').read_bytes(), before)

    def setUp(self):
        self.record = dict(query='产品测试 怎么用', brand='产品测试', engine='百度', date='2026-11-26',
                           market='中文桌面', scope='手动录入一条摘要', results=[dict(title='产品教程',
                           url='https://example.com/help', snippet='教程摘要', type='使用教程',
                           relevance='match', reason='运营主体一致')])

    def test_validation_and_untrusted_assessment(self):
        self.record['assessment'] = {'confidence': '高'}
        clean = server.validate_research(self.record)
        self.assertNotIn('assessment', clean)
        self.assertEqual(clean['method'], '人工录入 · 本地规则推断')

    def test_invalid_evidence(self):
        for url in ['javascript:alert(1)', 'file:///c:/secret', 'https://user:password@example.com']:
            bad = copy.deepcopy(self.record)
            bad['results'][0]['url'] = url
            with self.assertRaises(ValueError):
                server.validate_research(bad)
        self.record['results'][0]['relevance'] = 'guessed'
        with self.assertRaises(ValueError):
            server.validate_research(self.record)

    def test_persistence_api_and_seed_preservation(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'STATE', Path(directory)):
            http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{http.server_port}'
            try:
                req = urllib.request.Request(base+'/api/research', json.dumps(self.record).encode(),
                                             {'Content-Type':'application/json', 'Origin':base})
                with urllib.request.urlopen(req) as res:
                    self.assertEqual(res.status, 201)
                    saved = json.load(res)
                self.assertEqual(len(saved), 1)
                self.assertEqual(saved[0]['query'], self.record['query'])
                with urllib.request.urlopen(base+'/api/research') as res:
                    self.assertEqual(json.load(res), saved)
                self.assertEqual(len(server.read(Path(directory)/'intent-research.json')), 1)
                bad = urllib.request.Request(base+'/api/research', b'{}',
                                             {'Content-Type':'application/json','Origin':'https://example.com'})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(bad)
                self.assertEqual(error.exception.code,403)
            finally:
                http.shutdown()
                http.server_close()
                thread.join()

if __name__ == '__main__':
    unittest.main()
