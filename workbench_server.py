"""Loopback-only UI for the existing free radar. No third-party dependencies."""
import argparse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import uuid
from urllib.parse import parse_qs, urlsplit
import urllib.request
import webbrowser
from workbench_config import ensure_config

ROOT = Path(__file__).resolve().parent
WEB = ROOT / 'workbench'
STATE = ROOT / 'state'
LOCK = threading.RLock()
JOB = {'running': False, 'message': '准备就绪', 'started': None, 'finished': None}


def research_records():
    return read(STATE / 'intent-research.json', []) + read(WEB / 'research-seed.json', [])


def validate_research(body):
    record = {}
    for key, limit in [('query', 200), ('brand', 200), ('engine', 40), ('date', 10), ('market', 200), ('scope', 1000)]:
        value = body.get(key, '')
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(f'{key} 不能为空或超长')
        record[key] = value.strip()
    try:
        observed = datetime.strptime(record['date'], '%Y-%m-%d').date()
        if observed > datetime.fromisoformat(now()).date():
            raise ValueError()
    except ValueError:
        raise ValueError('请填写有效的观察日期，不能晚于今天')
    results = body.get('results')
    if not isinstance(results, list) or not 1 <= len(results) <= 20:
        raise ValueError('请录入 1–20 条实际搜索结果')
    record['results'] = []
    for result in results:
        if not isinstance(result, dict):
            raise ValueError('结果格式无效')
        clean = {}
        for key, limit in [('title', 300), ('url', 2000), ('snippet', 2000), ('reason', 1000)]:
            value = result.get(key)
            if not isinstance(value, str) or not value.strip() or len(value) > limit:
                raise ValueError('每条结果需填写标题、链接、摘要和身份判断理由')
            clean[key] = value.strip()
        parsed = urlsplit(clean['url'])
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('结果链接须为不含登录凭证的 HTTP/HTTPS 地址')
        if result.get('type') not in ['品牌官网', '产品介绍', '公司资料', '使用教程', '价格说明', '对比评测', '下载入口', '招聘信息', '其他']:
            raise ValueError('页面类型无效')
        if result.get('relevance') not in ['match', 'owned', 'excluded', 'uncertain']:
            raise ValueError('请核对每条结果的产品身份')
        clean.update(type=result['type'], relevance=result['relevance'])
        record['results'].append(clean)
    record.update(id=uuid.uuid4().hex, method='人工录入 · 本地规则推断')
    return record


def read(path, default=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def now():
    return datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds')


def reports():
    rows = []
    for path in sorted((ROOT / 'reports').glob('*/report.json'), reverse=True):
        try:
            data = read(path)
            rows.append({'id': path.parent.name, 'count': len(data.get('leads', [])),
                         'errors': error_count(data), 'sites': len(data.get('sitemap', {}).get('sites', {}))})
        except (ValueError, OSError):
            continue
    return rows


def error_count(value):
    if isinstance(value, dict):
        return int(bool(value.get('error'))) + sum(error_count(v) for k, v in value.items() if k != 'error')
    if isinstance(value, list):
        return sum(error_count(v) for v in value)
    return 0


def settings():
    ensure_config(ROOT)
    cfg = read(ROOT / 'config.json')
    local = read(STATE / 'workbench-settings.json', {'sources': ['hf', 'breakout', 'sitemaps']})
    return {'sources': local['sources'], 'breakout': cfg['breakout'],
            'known_terms': cfg.get('known_terms', []), 'sitemaps': cfg['sitemaps'], 'topics': cfg['topics']}


def report_path(report_id, filename='report.json'):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}_\d{6}(?:_\d{6})?', report_id):
        raise ValueError('无效的报告编号')
    path = ROOT / 'reports' / report_id / filename
    if not path.is_file():
        raise ValueError('报告文件不存在')
    return path


def collect():
    STATE.mkdir(exist_ok=True)
    try:
        with (STATE / 'workbench-run.log').open('w', encoding='utf-8') as log:
            result = subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'run_free.py'), '--no-open'],
                                    cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=1800)
        history = reports()
        message = '采集完成' if result.returncode == 0 else '采集失败，请查看运行日志'
        if result.returncode == 0 and history and history[0]['errors']:
            message = '采集完成，部分数据源读取失败'
    except subprocess.TimeoutExpired:
        message = '采集超过 30 分钟，已停止；请检查网络后重试'
    except Exception:
        message = '采集未能启动，请检查 Python 和文件权限'
    with LOCK:
        JOB.update(running=False, message=message, finished=now())


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, payload, code=200, content_type='application/json; charset=utf-8'):
        if not isinstance(payload, bytes):
            payload = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(payload)

    def valid_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def do_GET(self):
        if not self.valid_host():
            return self.respond({'error': '无效主机'}, 403)
        url = urlsplit(self.path)
        query = parse_qs(url.query)
        try:
            if url.path == '/api/health':
                return self.respond({'app': 'new-term-radar-workbench'})
            if url.path == '/api/state':
                with LOCK:
                    history = reports()
                    latest = read(report_path(history[0]['id'])) if history else {}
                    return self.respond({'reports': history, 'latest': latest, 'settings': settings(),
                                         'saved': read(STATE / 'workbench-saved.json', {}), 'job': dict(JOB)})
            if url.path == '/api/report':
                return self.respond(read(report_path(query.get('id', [''])[0])))
            if url.path == '/api/research':
                with LOCK:
                    return self.respond(research_records())
            if url.path == '/api/job':
                with LOCK:
                    return self.respond(dict(JOB))
            if url.path == '/api/log':
                path = STATE / 'workbench-run.log'
                return self.respond({'text': path.read_text(encoding='utf-8', errors='replace')[-20000:] if path.exists() else '尚未从工作台启动采集。'})
            if url.path == '/download':
                kind = query.get('format', ['md'])[0]
                if kind not in ('md', 'json'):
                    raise ValueError('不支持的格式')
                path = report_path(query.get('id', [''])[0], 'report.' + kind)
                return self.respond(path.read_bytes(), content_type='text/plain; charset=utf-8')
            files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'), '/intent.js': ('intent.js', 'text/javascript'), '/research.js': ('research.js', 'text/javascript'), '/research-ui.js': ('research-ui.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}
            if url.path in files:
                name, mime = files[url.path]
                return self.respond((WEB / name).read_bytes(), content_type=mime + '; charset=utf-8')
            self.respond({'error': '页面不存在'}, 404)
        except (ValueError, OSError) as exc:
            self.respond({'error': str(exc)}, 400)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if not self.valid_host() or origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
            return self.respond({'error': '只接受来自本机工作台的操作'}, 403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 65536 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError('无效请求')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('无效请求内容')
            with LOCK:
                if self.path == '/api/research':
                    record = validate_research(body)
                    records = read(STATE / 'intent-research.json', [])
                    records.insert(0, record)
                    save(STATE / 'intent-research.json', records)
                    return self.respond(research_records(), 201)
                if self.path == '/api/run':
                    if JOB['running']:
                        return self.respond({'error': '已有采集任务正在运行'}, 409)
                    JOB.update(running=True, message='正在采集免费数据，通常需要 1–5 分钟', started=now(), finished=None)
                    threading.Thread(target=collect, daemon=True).start()
                    return self.respond(dict(JOB), 202)
                if self.path == '/api/settings':
                    if JOB['running']:
                        return self.respond({'error': '采集期间暂不能修改配置'}, 409)
                    sources = body.get('sources')
                    if not isinstance(sources, list) or not sources or any(x not in ['hf', 'breakout', 'sitemaps'] for x in sources):
                        raise ValueError('请至少启用一个免费数据源')
                    cfg = read(ROOT / 'config.json')
                    bounds = {'window_days': (1, 90), 'min_stars': (1, 100000), 'velocity_min': (1, 50000), 'delta_min': (1, 100000)}
                    values = body.get('breakout', {})
                    for key, (low, high) in bounds.items():
                        value = values.get(key)
                        if type(value) is not int or not low <= value <= high:
                            raise ValueError(f'{key} 需在 {low}–{high} 之间')
                    known = body.get('known_terms', [])
                    if not isinstance(known, list) or len(known) > 200 or any(not isinstance(x, str) or len(x) > 120 for x in known):
                        raise ValueError('已覆盖词格式无效')
                    cfg['breakout'].update({key: values[key] for key in bounds})
                    cfg['known_terms'] = known
                    save(ROOT / 'config.json', cfg)
                    save(STATE / 'workbench-settings.json', {'sources': list(dict.fromkeys(sources))})
                    return self.respond(settings())
                if self.path == '/api/saved':
                    term = body.get('term', '')
                    if not isinstance(term, str) or not term.strip() or len(term) > 200:
                        raise ValueError('无效关键词')
                    records = read(STATE / 'workbench-saved.json', {})
                    if body.get('remove') is True:
                        records.pop(term, None)
                    else:
                        note, status = body.get('note', ''), body.get('status', '待评估')
                        if not isinstance(note, str) or len(note) > 4000 or status not in ['待评估', '准备写作', '已发布', '暂不跟进']:
                            raise ValueError('备注或状态无效')
                        records[term] = {'term': term, 'note': note, 'status': status, 'updated': now()}
                    save(STATE / 'workbench-saved.json', records)
                    return self.respond(records)
            self.respond({'error': '接口不存在'}, 404)
        except (ValueError, TypeError, OSError) as exc:
            self.respond({'error': str(exc)}, 400)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    url = f'http://127.0.0.1:{args.port}'
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError:
        try:
            with urllib.request.urlopen(url + '/api/health', timeout=2) as response:
                if json.load(response).get('app') != 'new-term-radar-workbench':
                    raise ValueError('端口被其他程序占用')
            if not args.no_open:
                webbrowser.open(url)
            return
        except Exception:
            raise SystemExit('端口 8765 被其他程序占用，请使用 --port 8766 启动。')
    print(f'新词雷达工作台：{url}', flush=True)
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
