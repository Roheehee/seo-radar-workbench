/* Evidence stays scoped to the exact query, engine and dated observation. */
(function(root){
 const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 function find(records,query){return records.find(r=>normalize(r.query)===normalize(query));}
 function analyze(record){
  const eligible=record.results.filter(r=>r.relevance==='match'||r.relevance==='owned');
  const excluded=record.results.filter(r=>r.relevance==='excluded');
  const uncertain=record.results.filter(r=>r.relevance==='uncertain');
  const counts={};eligible.forEach(r=>counts[r.type]=(counts[r.type]||0)+1);
  const facts=[`记录 ${record.results.length} 条结果；同一产品 ${eligible.length} 条，排除 ${excluded.length} 条，身份待核对 ${uncertain.length} 条。`,...Object.entries(counts).map(([k,n])=>`${k}：${n} 条相关结果。`)];
  if(record.assessment)return {...record.assessment,facts,eligible,excluded,uncertain};
  const rule=(typeof RadarIntent!=='undefined'?RadarIntent:require('./intent.js')).analyze({term:record.query});
  let label=rule.label,task=rule.task,pages=rule.pages.map(title=>({title,path:'按网站结构确定',sections:rule.sections,reason:'来自查询词面；需与下方实际结果交叉核对。'}));
  if(!eligible.length){label='证据不足，暂不确定页面';task='先确认结果中的产品身份，再判断用户任务';pages=[];}
  else if(['unknown','brand'].includes(rule.key)){
   const primary=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
   const mapping={
    '品牌官网':['确认产品身份与官方入口','确认品牌是什么、官方入口在哪里','品牌首页 / 产品介绍'],
    '公司资料':['核对公司主体与可信度','核对运营公司及品牌关系','关于我们 / 公司主体说明'],
    '使用教程':['完成首次使用或具体操作','按教程完成实际任务','新手指南 / 任务教程'],
    '价格说明':['确认费用与使用限制','了解免费范围、收费条件和续费','价格与费用 FAQ'],
    '对比评测':['比较方案是否适合自己','按共同任务比较候选产品','场景对比 / 选型指南'],
    '下载入口':['找到可信安装渠道','确认平台兼容性并安装','官方下载与安装指南'],
    '招聘信息':['了解岗位与任职条件','了解雇主及招聘职位','招聘页（与产品获客分开）']
   };
   if(mapping[primary]){[label,task]=mapping[primary];pages=[{title:mapping[primary][2],path:'按网站结构确定',sections:['先回答用户任务','提供真实证据、适用条件与更新时间'],reason:`样本中“${primary}”较多；这是页面分布推断，不是用户占比。`}];}
  }
  const owned=eligible.filter(r=>r.relevance==='owned').length;
  return {label,task,confidence:eligible.length>=3&&owned<eligible.length?'中':'低',reason:'人工录入搜索结果 + 本地规则初判；未自动读取落地页，需人工确认主次。',facts,eligible,excluded,uncertain,pages,
   observations:eligible.length?[`相关结果包含：${Object.keys(counts).join('、')}。`]:['目前没有身份已核对的相关结果。'],
   caveats:['样本数量及类型分布不等于搜索量或用户占比。',...(owned?['品牌自发文章不能独立证明用户需求或产品能力。']:[]),'规则不能验证产品功能、价格和落地页内容；发布前需核对。']};
 }
 const api={normalize,find,analyze};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RadarResearch=api;
})(typeof window!=='undefined'?window:globalThis);
