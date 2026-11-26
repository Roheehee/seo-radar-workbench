/* Local, deterministic hypotheses. No SERP requests or model calls. */
(function (root) {
  const catalog = {
    learn: {label:'了解信息', task:'了解概念、能力或适用场景', pages:['概念解释页 / 产品介绍'], sections:['先回答它是什么、能做什么','展示真实使用场景与适用边界']},
    navigate: {label:'寻找官网 / 入口', task:'到达指定产品、官网或登录入口', pages:['官方网站 / 入口页'], sections:['优先给出可核验的官方入口','说明登录或访问方式；第三方站不要冒充官网']},
    compare: {label:'比较与选型', task:'比较可选方案，判断哪一种适合自己', pages:['实测对比页 / 替代品清单'], sections:['按相同任务和条件比较','列出价格、限制、优缺点及适用人群']},
    price: {label:'了解价格 / 购买', task:'确认费用、套餐或购买条件', pages:['价格说明页 / 套餐对比页'], sections:['核对当前价格与计费周期','注明免费额度、限制和更新日期']},
    how: {label:'学习使用方法', task:'按步骤完成安装、配置或使用任务', pages:['操作教程 / 安装指南'], sections:['列出前置条件与实际操作步骤','给出成功结果和常见失败处理']},
    fix: {label:'解决故障', task:'定位并解决使用中的具体问题', pages:['故障排查页 / 帮助文档'], sections:['确认错误表现与适用版本','按原因提供可验证的解决步骤']},
    do: {label:'直接完成任务', task:'直接使用工具或获取可用文件', pages:['可用工具页 / 下载页'], sections:['尽快提供任务入口或可信下载来源','说明输入要求、输出结果及使用限制']},
    unknown: {label:'意图待确认', task:'现有词面不足以确定用户想完成的任务', pages:['先确认需求，再决定页面'], sections:['补充完整搜索词及目标市场','确认结果页主要满足什么任务']},
    brand: {label:'待核验（仅项目名）', task:'当前只有项目名称，尚不能确定用户任务', pages:['补充搜索证据后再选页面'], sections:['进入搜索意图研究，记录同一查询的实际结果','核对同名产品、页面类型和来源，再决定内容形式']}
  };
  const rules = [
    ['fix', /报错|无法|失败|故障|不工作|打不开|\b(?:error|troubleshoot(?:ing)?|not working|failed|fix)\b/i],
    ['how', /怎么(?:用|做|安装|配置|使用)|如何|教程|安装教程|使用方法|\b(?:how to|tutorial|setup|installation|guide)\b/i],
    ['compare', /哪个好|哪种好|对比|比较|评测|推荐|替代|\b(?:vs\.?|versus|alternatives?|best|reviews?|comparison|compare)\b/i],
    ['price', /多少钱|价格|收费|套餐|购买|订阅费用|\b(?:pricing|price|cost|buy|purchase|subscription)\b/i],
    ['navigate', /官网|官方网站|登录|登陆|官方入口|\b(?:official(?: site| website)?|login|log in|sign in)\b/i],
    ['do', /在线|下载|转换器|生成器|计算器|\b(?:online|download|converter|generator|calculator)\b/i],
    ['learn', /是什么|什么是|什么意思|作用|定义|\b(?:what is|what are|meaning|definition|explained)\b/i]
  ];
  function analyze(row, query) {
    const term=String(query ?? row.term ?? '').trim();
    const normalize=s=>s.toLowerCase().replace(/[-_.]+/g,' ').replace(/\s+/g,' ').trim();
    const repoName=String(row.repo||'').split('/').pop();
    const exactProject=Boolean(row.repo && normalize(term)===normalize(repoName));
    const original=normalize(term)===normalize(String(row.term||''));
    // A project called "Free-Download" or "Best-Agent" is not a search modifier.
    const hits=exactProject?[]:rules.flatMap(([key,re])=>{const match=term.match(re);return match?[{key,quote:match[0]}]:[];});
    const named=original && ((row.kinds||[]).some(k=>['breakout','hf'].includes(k)) || Boolean(row.repo));
    const keys=hits.length?hits.map(h=>h.key):[named?'brand':'unknown'];
    const main=keys[0], secondary=keys.slice(1).map(key=>catalog[key].label);
    const evidence=hits.map(h=>({kind:'词面证据',quote:h.quote,reason:`搜索写法中出现「${h.quote}」，与“${catalog[h.key].label}”的规则匹配。`}));
    if(exactProject)evidence.push({kind:'名称证据',quote:row.repo,reason:'这个词与仓库名一致；名称中的普通词不自动视为用户的操作要求。'});
    else if(!hits.length)evidence.push({kind:named?'来源证据':'证据不足',quote:term,reason:named?'来源将它作为项目或模型名称；词中没有清晰的搜索动作。':'没有识别出明确的任务修饰词，不能仅凭主题判断意图。'});
    const description=String(row.description || (row.examples||[])[0] || '').trim();
    if(description)evidence.push({kind:'项目上下文',quote:description.slice(0,450),reason:'这是采集到的项目描述，不是搜索用户原话；仅用于理解对象，不据此确认搜索意图。'});
    const constraints=[];
    if(/免费|\bfree\b/i.test(term)&&!exactProject)constraints.push('免费：需核验免费额度与限制');
    if(/中文|\bchinese\b/i.test(term)&&!exactProject)constraints.push('中文：需核验界面、输入或输出支持');
    if(/无水印|without watermark|no watermark/i.test(term)&&!exactProject)constraints.push('无水印：需实际验证导出结果');
    if(/本地|离线|\boffline\b|\blocal\b/i.test(term)&&!exactProject)constraints.push('本地 / 离线：需核验运行条件');
    const candidates=keys.flatMap(k=>catalog[k].pages);
    const validations=['在目标国家、语言及搜索引擎查看前 10 个自然结果，记录主要页面类型。', '查找用户咨询或评论中的实际任务和限制条件。', '确认自己能提供额外价值；名称导航词通常应由官方入口承接。'];
    if(secondary.length)validations.unshift('检测到多个意图信号，需用搜索结果确认主次，不能直接按规则顺序决定页面。');
    return {term,key:main,label:catalog[main].label,secondary,confidence:hits.length===1?'中':'低',
      confidenceReason:hits.length===1?'有明确词面信号，但尚未核验搜索结果和真实用户需求。':secondary.length?'多个任务信号并存，主次尚未验证。':'只有名称或模糊词面，当前只能提出假设。',
      task:catalog[main].task, pages:[...new Set(candidates)],sections:catalog[main].sections,
      evidence,constraints,validations,method:'本地规则初判 · 未核验搜索结果',version:'1.0'};
  }
  const api={analyze,catalog};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.RadarIntent=api;
})(typeof window!=='undefined'?window:globalThis);
