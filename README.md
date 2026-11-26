# SEO Radar Workbench · 免费 SEO 工作台

基于 [new-term-radar](https://github.com/zhuyansen/new-term-radar) 的本地 SEO 线索与搜索意图研究工作台。支持中文界面、免费信号采集、选题管理和可追溯的页面建议。

## 快速开始

需要 Python 3.10 或更高版本，并将 `python` 加入 PATH。工作台与免费采集入口使用 Python 标准库，不要求付费 API Key。

```bash
git clone https://github.com/Roheehee/seo-radar-workbench.git
cd seo-radar-workbench
python workbench_server.py
```

浏览器打开 <http://127.0.0.1:8765>。Windows 也可双击 `打开工作台.bat`。
首次读取工作台配置时，会从 `config.free.example.json` 创建本机 `config.json`，不会覆盖已有配置。

## 功能

- 免费采集 GitHub 爆发项目、Hugging Face 热门变化和工具站 sitemap 新增页面。
- 线索筛选、历史报告、收藏、备注、写作状态和 CSV 导出。
- 词面意图初判；仅有项目名时明确显示待核验，不把项目描述当用户搜索证据。
- 搜索意图研究：人工录入实际搜索结果，区分同一产品、品牌自发内容、同名误匹配和身份待核对结果。
- 根据查询词和相关页面类型生成意图假设、依据与页面建议，保留观察日期及证据链接。

**当前没有自动实时搜索接口。** “打开百度”用于手动研究；搜索结果需自行录入。样本页面分布不等于搜索量或用户占比，品牌自发文章不等于独立需求证据。

## 默认行为与数据

工作台只监听 `127.0.0.1`，适合个人本机使用；没有登录系统，不应直接暴露到公网。
采集需手动启动。免费入口明确跳过付费模块，即使本机设置了付费服务密钥也不会自动启用。
不要同时运行工作台采集和旧的 `run_free.py` 采集入口。

以下本机数据不会提交到仓库：

| 路径 | 内容 |
| --- | --- |
| `config.json` | 本机设置 |
| `state/` | 采集快照、选题备注、搜索研究、日志 |
| `reports/`、`latest-report.html` | 生成的报告 |
| `.env`、`.env.*` | 环境配置与凭据 |

公开版本的 `workbench/research-seed.json` 为空，不包含客户品牌、真实研究样本或用户业务数据。测试使用虚构产品和 `example.com`。

## 验证

```bash
python -m unittest discover -s tests -p test_research_server.py -v
node tests/test_intent.cjs
node tests/test_research.cjs
```

Node.js 仅用于前端逻辑测试，日常运行工作台不需要安装 Node.js。

## 上游与许可

核心雷达来自 [zhuyansen/new-term-radar](https://github.com/zhuyansen/new-term-radar)，保留其 MIT 许可证及版权声明。此仓库新增本地工作台、免费启动入口和搜索证据研究流程。

原项目完整文档见 [README.upstream.md](README.upstream.md) 和 [README.zh-CN.md](README.zh-CN.md)。其中部分深度分析模块需要第三方服务，不属于工作台默认免费模式。
