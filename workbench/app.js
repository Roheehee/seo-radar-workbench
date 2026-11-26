'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => value == null ? '—' : Number(value).toLocaleString('zh-CN');
const sourceNames = {breakout:'GitHub',hf:'Hugging Face',sitemap:'工具站',sitemaps:'工具站',x:'X'};
const titles = {research:['搜索意图研究','把搜索证据，变成页面计划','核对产品身份，区分观察与推断，为每个实际查询选择承接页面。'],overview:['监测总览','发现值得关注的下一个名字','从公开信号中寻找线索，把灵感变成下一篇内容。'],leads:['线索发现','从新名字，找到新选题','搜索、筛选和查看原始证据，把值得研究的线索加入选题库。'],saved:['我的选题','让每条好线索有个去处','收藏值得关注的名字，记录判断，跟进内容进度。'],history:['历史报告','每一次发现，都有记录','保留每次采集的原始报告，随时回看、下载与比较。'],settings:['监测设置','按你的节奏，调整雷达','选择免费数据源，设置 GitHub 爆发门槛和已覆盖关键词。'],capabilities:['功能与数据源','你可以用雷达做什么','免费发现新线索，按需扩展更深入的关键词研究。']};
let state, activeData, activeReport, rows=[], allRows=[], page='overview', filters={q:'',source:'all',topic:'all',intent:'all',sort:'velocity'}, pollTimer, busy=false;

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败，请稍后重试');
  return data;
}
function toast(message) {$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,3200);}
function timeLabel(id) { if(!id)return '暂无报告';const [date,time]=id.split('_');return `${date} ${time.slice(0,2)}:${time.slice(2,4)}`; }
function sourceLabel(kinds) {return (kinds||[]).map(x=>sourceNames[x]||x).join(' / ')||'其他';}
function safeLink(url) {try {const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?esc(parsed.href):'#';}catch{return '#';}}
function normalized(data) {
 const repos = new Map((data.breakout?.repos||[]).map(r=>[r.repo,r]));
 return (data.leads||[]).map(r=>{
   const repo=repos.get(r.repo)||{};
   const text=[r.term,r.repo,...(r.examples||[])].join(' ');
   const topics=Object.entries(state.settings.topics||{}).filter(([,regex])=>{try{return new RegExp(regex,'i').test(text);}catch{return false;}}).map(([name])=>name);
   const item={...r,...repo,term:r.term,kinds:r.kinds,topics};
   return {...item,intent:analyzeIntent(item)};
 });
}
async function refresh(preserve=false) {
 const previous=activeReport;
 [state,researchRecords]=await Promise.all([api('/api/state'),api('/api/research')]);
 activeReport=preserve&&state.reports.some(r=>r.id===previous)?previous:state.reports[0]?.id;
 activeData=activeReport&&activeReport!==state.reports[0]?.id?await api('/api/report?id='+encodeURIComponent(activeReport)):state.latest;
 rows=normalized(activeData);
 const historical=await Promise.all(state.reports.map(r=>r.id===activeReport?activeData:api('/api/report?id='+encodeURIComponent(r.id))));
 const unique=new Map();
 historical.forEach(d=>normalized(d).forEach(r=>{if(!unique.has(r.term))unique.set(r.term,r);}));
 allRows=[...unique.values()];
 render();setJob(state.job);
}
function setJob(job) {
 state.job=job;
 $('#run').disabled=job.running;
 const settingsSubmit=$('#settings-form button[type="submit"]');if(settingsSubmit)settingsSubmit.disabled=job.running;
 $('#run').innerHTML=job.running?'正在采集…':'<span>◉</span> 开始免费采集';
 const banner=$('#job-banner');
 banner.hidden=!job.running&&!job.finished;
 banner.classList.toggle('error',/失败|停止/.test(job.message));
 banner.innerHTML=`<span>${esc(job.message)}${job.started?' · '+esc(job.started.slice(11,16))+' 开始':''}</span><button class="quiet" data-action="log">运行日志</button>`;
 if(job.running&&!pollTimer)pollTimer=setInterval(checkJob,2500);
}
async function checkJob() {
 try {const job=await api('/api/job');setJob(job);if(!job.running){clearInterval(pollTimer);pollTimer=null;await refresh();toast(job.message);}}catch(e){clearInterval(pollTimer);pollTimer=null;toast('与本地服务断开，请重新打开工作台');}
}
function route() {
 page=location.hash.slice(1)||'overview';if(!titles[page])page='overview';
 if(state)render();
}
function render() {
 const [crumb,title,subtitle]=titles[page];$('#crumb').textContent=crumb;$('#page-title').textContent=title;$('#page-subtitle').textContent=subtitle;
 document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==page);
 document.querySelectorAll('nav a').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
 $('#nav-count').textContent=state.latest.leads?.length||0;$('#saved-count').textContent=Object.keys(state.saved).length;
 ({research:renderResearch,overview:renderOverview,leads:renderLeads,saved:renderSaved,history:renderHistory,settings:renderSettings,capabilities:renderCapabilities}[page])();
}
function statusTag(block) {return block?.error?'<span class="tag orange">读取失败</span>':block?.skipped?'<span class="tag gray">未启用</span>':block?.first_run?'<span class="tag">首次基线</span>':'<span class="tag teal">已采集</span>';}
function sourcesPanel(data) {
 const gh=data.breakout||{},hf=data.hf||{},sites=data.sitemap?.sites||{};
 return `<div class="panel"><div class="panel-head"><h2>数据源状态</h2><a class="quiet" href="#settings">设置</a></div><div class="panel-body">
 <div class="source"><div class="source-title"><span><span class="source-letter">GH</span>GitHub</span>${statusTag(gh)}</div><p>${esc(gh.error|| (gh.skipped?'已暂停此来源':`检索 ${num(gh.searched)} 个仓库 · ${num(gh.repos?.length||0)} 个达到爆发条件`))}</p></div>
 <div class="source"><div class="source-title"><span><span class="source-letter">HF</span>Hugging Face</span>${statusTag(hf)}</div><p>${esc(hf.error||(hf.skipped?'已暂停此来源':`读取 ${num(hf.models)} 个模型 / ${num(hf.spaces)} 个 Spaces`))}</p></div>
 <div class="source"><div class="source-title"><span><span class="source-letter">SM</span>工具站 sitemap</span>${data.sitemap?.skipped?'<span class="tag gray">未启用</span>':`<span class="tag teal">${Object.values(sites).filter(s=>!s.error).length} / ${Object.keys(sites).length} 成功</span>`}</div><p>${Object.entries(sites).map(([name,s])=>`${esc(name)} · ${s.error?'读取失败':s.first_run?'基线已建立':`${num(s.new)} 个新页面`}`).join('<br>')||'本次没有工具站数据'}</p></div>
 </div></div>`;
}
function renderOverview() {
 const d=state.latest,list=normalized(d),sites=Object.values(d.sitemap?.sites||{}),urls=sites.reduce((n,s)=>n+(s.urls||0),0);
 const newest=state.reports[0];const sorted=[...list].sort((a,b)=>(b.velocity||0)-(a.velocity||0));
 const counts={};list.forEach(r=>(r.kinds||[]).forEach(k=>counts[k]=(counts[k]||0)+1));
 $('#overview').innerHTML=`<div class="stats">
 ${stat('本次候选线索',list.length,'原始候选，尚未做付费语义判断','⌕')}
 ${stat('GitHub 爆发仓库',d.breakout?.repos?.length||0,'按星数与增长速度筛选','↗')}
 ${stat('工具站页面基线',urls,`${sites.filter(s=>!s.error).length} 个工具站已成功读取`,'▤')}
 ${stat('我的选题',Object.keys(state.saved).length,'收藏与备注已保存在本机','☆')}
 </div><div class="overview-grid"><div><div class="panel"><div class="panel-head"><div><h2>值得进一步查看的线索 <span class="count-pill">${list.length}</span></h2><p>按 GitHub 日均增星排列 · 不代表搜索量或推荐结论</p></div><a href="#leads" class="quiet">全部线索</a></div>${list.length?table(sorted.slice(0,6),true):empty('等待新的发现','点击“开始免费采集”获取数据；已有基线时，未发现新增也会正常生成报告。')}<div class="table-bottom"><span>最近采集 · ${esc(timeLabel(newest?.id))}</span><span>${newest?.errors?'存在来源错误':'免费数据源'}</span></div></div>
 <div class="note"><strong>先判断相关性，再决定写什么。</strong> GitHub 监测覆盖全站，可能包含非 AI 项目；你可以在「线索发现」按主题筛选。首次采集主要建立基线，Hugging Face 和工具站的新增变化需后续对比。</div>
 <div class="panel"><div class="panel-head"><h2>本次线索来源</h2><span class="recent-label">同一线索可包含多个信号</span></div><div class="panel-body"><ul class="mini-list">${['breakout','hf','sitemap'].map(k=>`<li><span>${sourceNames[k]}</span><b>${counts[k]||0} 条</b></li>`).join('')}</ul></div></div></div>
 <div class="overview-side">${sourcesPanel(d)}<div class="workflow"><span class="tag teal">你的日常工作流</span><h3 style="margin-top:17px">从发现，到选题</h3><p>运行采集，查看新的名字。<br>打开原始来源，判断是否相关。<br>收藏候选，写下内容切入点。<br>把准备好的选题标记为「准备写作」。</p><a class="quiet" href="#saved" style="display:inline-block;margin-top:15px;padding-left:0">管理我的选题</a></div></div></div>`;
}
function stat(label,value,hint,glyph){return `<div class="stat"><span class="label">${label}</span><span class="glyph">${glyph}</span><strong>${num(value)}</strong><small>${esc(hint)}</small></div>`;}
function empty(title,text){return `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`;}
function table(items,compact=false) {
 return `<div class="table-wrap"><table class="${compact?'':'intent-table'}"><thead><tr><th>关键词 / 项目</th><th>可能的用户意图</th>${compact?'<th>日均增星</th>':'<th>判断依据</th><th>适合的页面</th><th>热度信号</th>'}<th>收藏</th></tr></thead><tbody>${items.map(r=>{const a=r.intent;return `<tr><td><button class="term-btn" data-action="detail" data-term="${esc(r.term)}">${esc(r.term)}</button><span class="subline">${esc(r.repo||sourceLabel(r.kinds))}</span>${compact?'':`<div class="chips">${r.topics.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${r.known?'<span class="tag orange">已覆盖</span>':''}</div>`}</td><td class="intent-label"><span class="tag teal">${esc(a.label)}</span><span class="subline">${a.confidence}置信度 · ${a.researchId?'有搜索证据':a.secondary.length?'混合意图待核验':'未搜索核验'}</span></td>${compact?`<td class="number velocity">${r.velocity?`+${num(r.velocity)}`:'—'}</td>`:`<td class="intent-reason">${esc(a.evidence[0].reason)}<button class="quiet" data-action="detail" data-term="${esc(r.term)}">查看依据</button></td><td class="intent-page">${a.pages.map(p=>esc(p)).join('<br>')}<span class="subline">${a.researchId?esc(a.method):'需核验搜索结果'}</span></td><td class="number">${num(r.stars)} Stars<span class="subline">日均增星 ${num(r.velocity)}</span></td>`}<td><button class="star-btn ${state.saved[r.term]?'on':''}" aria-label="${state.saved[r.term]?'取消收藏':'收藏'} ${esc(r.term)}" data-action="star" data-term="${esc(r.term)}">${state.saved[r.term]?'★':'☆'}</button></td></tr>`;}).join('')}</tbody></table></div>`;
}
function filtered() {
 let result=rows.filter(r=>!filters.q||[r.term,r.repo,...r.examples||[],...r.variants||[]].join(' ').toLowerCase().includes(filters.q.toLowerCase()));
 if(filters.source!=='all')result=result.filter(r=>r.kinds?.includes(filters.source));
 if(filters.intent!=='all')result=result.filter(r=>filters.intent==='mixed'?r.intent.secondary.length>0:r.intent.key===filters.intent);
 if(filters.topic==='unmatched')result=result.filter(r=>!r.topics.length);else if(filters.topic!=='all')result=result.filter(r=>r.topics.includes(filters.topic));
 return result.sort((a,b)=>filters.sort==='name'?a.term.localeCompare(b.term):(b[filters.sort]||0)-(a[filters.sort]||0));
}
function renderLeads() {
 $('#leads').innerHTML=`<div class="note">只有项目名的线索标记为待核验，不直接推荐页面。录入同一查询的实际搜索证据后，可显示更具体的任务和建议。<a class="link" href="#research">查看搜索意图研究 →</a></div><div class="panel"><div class="panel-head"><h2>候选线索</h2><button class="secondary" data-action="export">导出当前筛选 CSV</button></div><div class="toolbar"><input class="search" id="search" aria-label="搜索线索" placeholder="搜索关键词、项目或描述…" value="${esc(filters.q)}"><select id="source-filter" aria-label="筛选来源"><option value="all">全部来源</option>${['breakout','hf','sitemap'].map(k=>`<option value="${k}" ${filters.source===k?'selected':''}>${sourceNames[k]}</option>`).join('')}</select><select id="topic-filter" aria-label="筛选主题"><option value="all">全部主题</option>${Object.keys(state.settings.topics).map(t=>`<option ${filters.topic===t?'selected':''}>${esc(t)}</option>`).join('')}<option value="unmatched" ${filters.topic==='unmatched'?'selected':''}>未匹配主题</option></select><select id="intent-filter" aria-label="筛选意图"><option value="all">全部意图</option>${Object.entries(RadarIntent.catalog).map(([k,v])=>`<option value="${k}" ${filters.intent===k?'selected':''}>${esc(v.label)}</option>`).join('')}<option value="mixed" ${filters.intent==='mixed'?'selected':''}>混合意图</option></select><select id="sort" aria-label="排序">${[['velocity','日均增星优先'],['stars','Stars 优先'],['name','名称排序']].map(([v,l])=>`<option value="${v}" ${filters.sort===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="toolbar"><label for="report-select" class="muted">采集批次</label><select id="report-select">${state.reports.map(r=>`<option value="${r.id}" ${r.id===activeReport?'selected':''}>${timeLabel(r.id)} · ${r.count} 条线索</option>`).join('')}</select><button class="quiet" data-action="clear-filter">重置筛选</button></div><div id="lead-table"></div></div>`;
 renderLeadTable();
 $('#search').oninput=e=>{filters.q=e.target.value;renderLeadTable();};
 [['#source-filter','source'],['#topic-filter','topic'],['#intent-filter','intent'],['#sort','sort']].forEach(([id,key])=>$(id).onchange=e=>{filters[key]=e.target.value;renderLeadTable();});
 $('#report-select').onchange=async e=>{try{activeReport=e.target.value;activeData=await api('/api/report?id='+encodeURIComponent(activeReport));rows=normalized(activeData);renderLeadTable();}catch(e){toast(e.message);}};
}
function renderLeadTable(){const list=filtered();$('#lead-table').innerHTML=(list.length?table(list):empty('没有符合条件的线索','试试其他关键词、主题或采集批次。'))+`<div class="table-bottom"><span>显示 ${list.length} / ${rows.length} 条</span><span>点击名称查看证据与备注</span></div>`;}
function renderSaved() {
 const list=Object.values(state.saved).sort((a,b)=>b.updated.localeCompare(a.updated));
 $('#saved').innerHTML=`<div class="saved-filter"><span class="tag teal">${list.length} 个选题</span><span class="tag">${list.filter(r=>r.status==='准备写作').length} 个准备写作</span><span class="tag">${list.filter(r=>r.status==='已发布').length} 个已发布</span><button class="quiet" data-action="export-saved">导出选题 CSV</button></div>${list.length?`<div class="saved-grid">${list.map(r=>`<article class="saved-card"><div class="top"><button class="term-btn" data-action="detail" data-term="${esc(r.term)}">${esc(r.term)}</button><span class="tag ${r.status==='准备写作'?'teal':''}">${esc(r.status)}</span></div><p>${esc(r.note||'还没有备注，写下你的选题方向或判断依据。')}</p><time>更新于 ${esc(r.updated.slice(0,16).replace('T',' '))}</time><button class="secondary" data-action="detail" data-term="${esc(r.term)}">编辑选题</button></article>`).join('')}</div>`:`<div class="panel">${empty('给值得研究的名字，留一个位置','在线索右侧点击星标，即可收藏；在详情中记录备注和写作状态。')}<div style="text-align:center;padding-bottom:30px"><a class="primary" href="#leads">去发现线索</a></div></div>`}`;
}
function renderHistory() {
 $('#history').innerHTML=`<div class="panel"><div class="panel-head"><h2>采集档案</h2><span class="tag">${state.reports.length} 份报告</span></div>${state.reports.length?`<div class="table-wrap"><table><thead><tr><th>采集时间</th><th>候选线索</th><th>工具站数</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.reports.map(r=>`<tr><td>${timeLabel(r.id)}</td><td>${r.count} 条</td><td>${r.sites}</td><td><span class="tag ${r.errors?'orange':'teal'}">${r.errors?`${r.errors} 项来源错误`:'报告已生成'}</span></td><td><div class="report-links"><button class="quiet" data-action="report" data-id="${r.id}">查看</button><button class="quiet" data-action="report-leads" data-id="${r.id}">线索</button><a href="/download?id=${r.id}&format=md" download="radar-${r.id}.md">Markdown</a><a href="/download?id=${r.id}&format=json" download="radar-${r.id}.json">JSON</a></div></td></tr>`).join('')}</tbody></table></div>`:empty('还没有采集报告','运行一次免费采集后，报告会自动出现在这里。')}</div><div class="note">历史报告保存在项目的 reports 文件夹；state 文件夹保存跨批次快照、收藏和备注。备份整个项目文件夹即可保留工作记录。</div>`;
}
function renderSettings() {
 const s=state.settings, b=s.breakout;
 $('#settings').innerHTML=`<form id="settings-form"><div class="settings-grid"><div><div class="panel"><div class="panel-head"><h2>免费数据源</h2><span class="tag teal">无需 API Key</span></div><div class="panel-body">${[['breakout','GitHub 爆发仓库','按仓库年龄、星数和增长速度寻找新项目'],['hf','Hugging Face','观察热门模型与 Spaces 的新进入者'],['sitemaps','工具站 sitemap','对比工具目录的页面变化']].map(([k,label,desc])=>`<label class="check-row"><input type="checkbox" name="source" value="${k}" ${s.sources.includes(k)?'checked':''}><span>${label}<small>${desc}</small></span></label>`).join('')}</div></div><div class="panel"><div class="panel-head"><h2>GitHub 筛选门槛</h2><span class="recent-label">下次采集生效</span></div><div class="panel-body"><div class="field-grid">${[['window_days','创建时间窗口（天）',1,90],['min_stars','检索最低 Stars',1,100000],['velocity_min','最低日均增星',1,50000],['delta_min','较上次最低增星',1,100000]].map(([key,label,min,max])=>`<div class="field"><label for="${key}">${label}</label><input id="${key}" name="${key}" type="number" min="${min}" max="${max}" step="1" value="${b[key]}" required></div>`).join('')}</div><div class="field"><label for="known">已覆盖关键词（每行一个）</label><textarea id="known" placeholder="填写已有内容覆盖的词，例如：claude code">${esc(s.known_terms.join('\n'))}</textarea></div><p class="subtitle">已覆盖词会在后续报告中标注，不会删除已有报告或收藏。</p></div><div class="form-foot"><button class="primary" type="submit" ${state.job.running?'disabled':''}>保存设置</button><small>免费入口始终跳过付费模块</small></div></div></div><div><div class="panel"><div class="panel-head"><h2>正在监测的工具站</h2></div><div class="panel-body">${Object.entries(s.sitemaps).map(([name,site])=>`<div class="source"><div class="source-title">${esc(name)}</div><p>请求间隔 ${site.pause} 秒</p><a class="link" style="font-size:12px" href="${safeLink(site.index)}" target="_blank" rel="noopener noreferrer">查看 sitemap</a></div>`).join('')}</div></div><div class="workflow"><h3>每天几分钟，保持观察</h3><p>当前为手动采集。打开工作台，点击「开始免费采集」即可。所有来源都使用同一份历史快照。</p></div></div></div></form>`;
 $('#settings-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const form=new FormData(e.target),b={};['window_days','min_stars','velocity_min','delta_min'].forEach(k=>b[k]=Number(form.get(k)));state.settings=await api('/api/settings',{sources:form.getAll('source'),breakout:b,known_terms:$('#known').value.split('\n').map(x=>x.trim()).filter(Boolean)});toast('设置已保存，下次采集生效');}catch(e){toast(e.message);}finally{btn.disabled=false;}};
}
function renderCapabilities() {
 const cards=[['已接入 · 免费','新名字发现','GitHub 爆发项目、Hugging Face 热门变化、工具站新增页面。','当前可以直接运行。'],['已接入 · 免费','意图识别与选题管理','支持实际搜索证据研究、同名排除、具体页面建议；无证据的项目名保留为待核验。支持 CSV 导出。','收藏与备注保存在本机。'],['已接入 · 免费','历史报告','查看不同批次、回看采集结果、下载 Markdown 和 JSON 原始报告。','已有报告已接入工作台。'],['未启用 · 需 AIsa','关键词深度研究','从产品名字挖掘通用需求词，查询搜索规模、趋势和搜索结果竞争。','原项目支持；当前免费入口不会调用。'],['未启用 · 需数据服务','需求与商业信号','X 新名字、用户求助、新卖家、收入线索和广告信号。','不同来源需 AIsa、GoAnyAPI 或 TrustMRR。'],['未启用 · 需 Google 授权','你的网站表现','结合 Search Console 的查询词、展示与排名，判断更新已有页还是创建新页。','需绑定你自己的网站并授权读取。']];
 $('#capabilities').innerHTML=`<div class="note"><strong>当前已选择免费模式。</strong> 以下未启用的能力仅作说明，未接入付费操作。发现候选词后，仍需验证它与你的产品、受众和内容目标是否相关。</div><div class="cap-grid">${cards.map(([status,title,desc,foot],i)=>`<article class="cap-card"><span class="tag ${i<3?'teal':'gray'}">${status}</span><h3>${title}</h3><p>${desc}</p><small>${foot}</small></article>`).join('')}</div>`;
}
function openDialog(title,body) {$('#detail-content').innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close" aria-label="关闭">×</button></div><div class="dialog-body">${body}</div>`;if(!$('#detail').open)$('#detail').showModal();}
function intentCard(a) {
 return `<section class="intent-card"><div class="intent-card-head"><h3>用户意图识别</h3><span class="tag ${a.confidence==='中'?'teal':'orange'}">${a.confidence}置信度</span></div><p class="intent-method">${esc(a.method)} · 分析 v${esc(a.version)}</p><div class="chips"><span class="tag teal">${esc(a.label)}</span>${a.secondary.map(s=>`<span class="tag">也可能：${esc(s)}</span>`).join('')}</div><p><strong>用户可能想：</strong>${esc(a.task)}</p><p class="muted">${esc(a.confidenceReason)}</p><h4>判断依据</h4><ul class="intent-evidence">${a.evidence.map(e=>`<li><span class="tag">${esc(e.kind)}</span><blockquote>${esc(e.quote)}</blockquote><p>${esc(e.reason)}</p></li>`).join('')}</ul><h4>适合做什么页面</h4><div class="chips">${a.pages.map(p=>`<span class="tag teal">${esc(p)}</span>`).join('')}</div><ul>${a.sections.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>${a.constraints.length?`<h4>词中提出的条件</h4><ul>${a.constraints.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:''}<details><summary>发布前还需要验证什么</summary><ul>${a.validations.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details></section>`;
}
function detail(term) {
 const r=rows.find(r=>r.term===term)||allRows.find(r=>r.term===term)||{term,topics:[]};const saved=state.saved[term]||{};
 const sources=r.repo?`<a class="secondary" href="https://github.com/${esc(r.repo.split('/').map(encodeURIComponent).join('/'))}" target="_blank" rel="noopener noreferrer">查看 GitHub 原始项目</a>`:(r.posts||[]).filter(p=>p.url).slice(0,3).map(p=>`<a class="secondary" href="${safeLink(p.url)}" target="_blank" rel="noopener noreferrer">查看原始帖子</a>`).join('');
 openDialog(term,`<div class="chips"><span class="tag">${esc(sourceLabel(r.kinds))}</span>${(r.topics||[]).map(t=>`<span class="tag teal">${esc(t)}</span>`).join('')}<span class="tag gray">尚未验证搜索需求</span></div>${intentCard(r.intent||analyzeIntent(r))}<div class="actions"><button class="primary" data-research="new" data-query="${esc(term)}">为这个词录入搜索证据</button><a class="secondary" href="#research" data-action="close">查看搜索意图研究</a></div><h3>项目信号</h3><div class="detail-metrics"><div><strong>${num(r.stars)}</strong><small>GitHub Stars</small></div><div><strong>${num(r.velocity)}</strong><small>日均增星</small></div><div><strong>${r.age_days??'—'}</strong><small>创建天数</small></div></div><p>${esc(r.description||(r.examples||[]).join('\n')||'该选题的原始线索不在现有报告中。')}</p>${sources}<h3>原始信号</h3><p class="muted">${esc((r.signals||[]).join('；')||'暂无额外信号')}</p><h3>搜索写法</h3><div class="chips">${(r.variants||[term]).map(v=>`<span class="tag">${esc(v)}</span>`).join('')}</div><h3>我的选题备注</h3><textarea id="note-input" aria-label="选题备注" maxlength="4000" placeholder="例如：适合写什么？与我们的产品有什么关系？还需要验证什么？">${esc(saved.note||'')}</textarea><div class="actions"><select id="note-status" aria-label="选题状态">${['待评估','准备写作','已发布','暂不跟进'].map(s=>`<option ${saved.status===s?'selected':''}>${s}</option>`).join('')}</select><button class="primary" data-action="save-note" data-term="${esc(term)}">保存到我的选题</button>${saved.term?`<button class="quiet" data-action="remove-note" data-term="${esc(term)}">取消收藏</button>`:''}</div>`);
}
function downloadCsv(list,saved=false) {
 const extra=['可能意图','其他可能意图','置信度','判断依据','建议页面','验证状态'];
 const header=(saved?['关键词','状态','备注','更新时间']:['关键词','来源','仓库','Stars','日均增星','主题','搜索写法']).concat(extra);
 const data=list.map(r=>{const item=saved?(allRows.find(x=>x.term===r.term)||r):r;const a=item.intent||analyzeIntent(item);return (saved?[r.term,r.status,r.note,r.updated]:[r.term,sourceLabel(r.kinds),r.repo||'',r.stars??'',r.velocity??'',(r.topics||[]).join(' / '),(r.variants||[]).join(' / ')]).concat([a.label,a.secondary.join(' / '),a.confidence,a.evidence.map(e=>`${e.kind}：${e.quote}；${e.reason}`).join('\n'),a.pages.join(' / '),a.method]);});
 const csv=[header,...data].map(row=>row.map(v=>{let s=String(v??'');if(/^[=+\-@\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=saved?'我的选题.csv':'候选线索.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${list.length} 条记录`);
}
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el||busy)return;
 const action=el.dataset.action,term=el.dataset.term;
 try {
  if(action==='close')$('#detail').close();
  if(action==='detail')detail(term);
  if(action==='star'){busy=true;const old=state.saved[term];if(old&&(old.note||old.status!=='待评估')){detail(term);return;}state.saved=await api('/api/saved',{term,remove:!!old});render();toast(old?'已取消收藏':'已加入我的选题');}
  if(action==='save-note'){busy=true;state.saved=await api('/api/saved',{term,note:$('#note-input').value,status:$('#note-status').value});$('#detail').close();render();toast('选题和备注已保存');}
  if(action==='remove-note'){busy=true;state.saved=await api('/api/saved',{term,remove:true});$('#detail').close();render();toast('已取消收藏');}
  if(action==='clear-filter'){filters={q:'',source:'all',topic:'all',intent:'all',sort:'velocity'};renderLeads();}
  if(action==='export')downloadCsv(filtered());
  if(action==='export-saved')downloadCsv(Object.values(state.saved),true);
  if(action==='report'){const res=await fetch('/download?id='+encodeURIComponent(el.dataset.id)+'&format=md');if(!res.ok)throw new Error('报告读取失败');openDialog('采集报告 · '+timeLabel(el.dataset.id),'<pre>'+esc(await res.text())+'</pre>');}
  if(action==='report-leads'){activeReport=el.dataset.id;activeData=await api('/api/report?id='+encodeURIComponent(activeReport));rows=normalized(activeData);location.hash='leads';}
  if(action==='log'){const data=await api('/api/log');openDialog('运行日志','<p class="muted">采集进行中可能暂时没有新的日志，完成后会显示结果。</p><pre>'+esc(data.text||'正在采集，请稍候…')+'</pre>');}
 }catch(error){toast(error.message);}finally{busy=false;}
});
$('#run').onclick=async()=>{if(state.job.running)return;$('#run').disabled=true;try{setJob(await api('/api/run',{}));}catch(e){toast(e.message);$('#run').disabled=false;}};
$('#refresh').onclick=async()=>{try{await refresh(true);toast('数据已刷新');}catch(e){toast(e.message);}};
window.addEventListener('hashchange',route);
route();
refresh().catch(e=>{$('#overview').innerHTML=`<div class="error-box">工作台数据暂时无法加载：${esc(e.message)}<br>请保持本地服务运行，然后刷新页面。</div>`;$('#overview').hidden=false;});
