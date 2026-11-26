"""Local free-only launcher. Run from any working directory."""
import argparse
from datetime import datetime, timedelta, timezone
import html
import json
from pathlib import Path
import subprocess
import sys
import webbrowser
from workbench_config import ensure_config

ROOT = Path(__file__).resolve().parent
SKIP = 'x,newsites,revenue,asks,sellers,builders,feeds,money,sidelights,gsc,review,judge,usecases,tutorials'


def main():
    ensure_config(ROOT)
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    stamp = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d_%H%M%S_%f')
    out = ROOT / 'reports' / stamp
    out.mkdir(parents=True, exist_ok=True)
    report = out / 'report.md'
    print('正在采集免费数据，首次运行会建立历史基线。请等待报告生成。', flush=True)
    settings_path = ROOT / 'state' / 'workbench-settings.json'
    sources = json.loads(settings_path.read_text(encoding='utf-8')).get('sources', []) if settings_path.exists() else ['hf', 'breakout', 'sitemaps']
    skip = SKIP + ''.join(',' + s for s in ['hf', 'breakout', 'sitemaps'] if s not in sources)
    command = [sys.executable, '-X', 'utf8', '-m', 'radar', 'daily',
               '--config', str(ROOT / 'config.json'), '--state', str(ROOT / 'state'),
               '--skip', skip, '--out', str(report)]
    with (out / 'run.log').open('w', encoding='utf-8') as log:
        result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode or not report.exists():
        print(f'运行失败，请查看日志：{out / "run.log"}', flush=True)
        return result.returncode or 1
    data = json.loads(report.with_suffix('.json').read_text(encoding='utf-8'))
    errors = []
    def collect(value, path=''):
        if isinstance(value, dict):
            if value.get('error'):
                errors.append(f'{path}: {value["error"]}')
            for key, child in value.items():
                collect(child, f'{path}/{key}')
        elif isinstance(value, list):
            for child in value:
                collect(child, path)
    collect(data)
    status = '部分数据源读取失败，详见报告。' if errors else '本次启用的数据源采集完成。'
    content = report.read_text(encoding='utf-8')
    labels = {'hf': 'Hugging Face', 'breakout': 'GitHub', 'sitemaps': '工具站 sitemap'}
    enabled = '、'.join(labels[s] for s in labels if s in sources)
    page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新词雷达 · 免费日报</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;background:#f5f7fb;color:#182235;font:16px/1.8 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:24px;border-radius:12px;font:14px/1.8 system-ui}.note{color:#506080}</style><h1>新词雷达 · 免费日报</h1><p class="note">' + html.escape(stamp + ' · ' + status) + '</p><p class="note">本次启用：' + html.escape(enabled) + '。未启用付费关键词分析；首次快照没有昨日对比，空结果不代表没有新产品。</p><pre>' + html.escape(content) + '</pre></html>'
    view = out / 'report.html'
    view.write_text(page, encoding='utf-8')
    (ROOT / 'latest-report.html').write_text(page, encoding='utf-8')
    print(status, flush=True)
    for error in errors:
        print(error, flush=True)
    print(f'报告：{view}', flush=True)
    if not args.no_open:
        webbrowser.open(view.as_uri())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
