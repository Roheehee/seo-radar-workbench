'use strict';
let researchRecords=[], selectedResearch='';
const relevanceLabels={match:'同一产品',owned:'品牌自发内容',excluded:'已排除',uncertain:'身份待核对'};
function analyzeIntent(item){
 const record=RadarResearch.find(researchRecords,item.term);
 if(!record)return RadarIntent.analyze(item);
 const a=RadarResearch.analyze(record);
 return {...RadarIntent.analyze(item),label:a.label,confidence:a.confidence,confidenceReason:a.reason,task:a.task,pages:a.pages.map(p=>p.title),sections:a.pages.flatMap(p=>p.sections),evidence:record.results.filter(r=>['match','owned'].includes(r.relevance)).map(r=>({kind:r.type,quote:r.title,reason:r.snippet+' '+r.reason})).concat([{kind:'样本限制',quote:record.scope,reason:a.caveats.join(' ')}]),validations:a.caveats,method:`${record.engine} · ${record.date} · ${record.method}`,version:'2.0',researchId:record.id};
}
function renderResearch(){
 const current=researchRecords.find(r=>r.id===selectedResearch)||researchRecords[0];
 if(current)selectedResearch=current.id;
 $('#research').innerHTML=`<div class="note"><strong>先看真实结果，再决定页面。</strong> 这里保存有日期的搜索证据。点击“研究新关键词”，打开百度并录入实际结果。当前未接自动搜索接口，不会实时抓取或产生 API 费用。</div>
 <div class="panel"><div class="panel-head"><div><h2>搜索意图研究 <span class="count-pill">${researchRecords.length}</span></h2><p>精确查询独立分析 · 同名结果剔除 · 品牌自发内容单独标记</p></div><div class="actions"><button class="secondary" data-research="export">导出研究 CSV</button><button class="primary" data-research="new">研究新关键词</button></div></div>
 <div class="table-wrap"><table><thead><tr><th>实际查询词</th><th>具体用户任务（推断）</th><th>优先承接页面</th><th>证据日期</th></tr></thead><tbody>${researchRecords.map(r=>{const a=RadarResearch.analyze(r);return `<tr class="${r.id===selectedResearch?'research-selected':''}"><td><button class="term-btn" data-research="select" data-id="${esc(r.id)}">${esc(r.query)}</button><span class="subline">${esc(r.engine)} · ${esc(r.method)}</span></td><td>${esc(a.label)}<span class="subline">${esc(a.confidence)}置信度 · ${a.eligible.length} 条相关样本</span></td><td>${esc(a.pages[0]?.title||'证据不足，暂不建议建页')}</td><td>${esc(r.date)}</td></tr>`;}).join('')}</tbody></table></div></div>
 ${current?researchDetail(current):empty('还没有研究记录','录入真实搜索结果后再分析。')}`;
}
function researchDetail(r){
 const a=RadarResearch.analyze(r);
 return `<article class="panel research-detail"><div class="panel-head"><div><p class="eyebrow">SEARCH EVIDENCE → PAGE PLAN</p><h2>${esc(r.query)}</h2><p>${esc(r.engine)} · ${esc(r.date)} · ${esc(r.market)}</p></div><a class="secondary" href="https://www.baidu.com/s?wd=${encodeURIComponent(r.query)}" target="_blank" rel="noopener noreferrer">重新查看百度</a></div><div class="panel-body">
 <div class="research-verdict"><span class="tag teal">${esc(a.confidence)}置信度 · 意图推断</span><h3>${esc(a.label)}</h3><p>${esc(a.task)}</p><p class="muted">${esc(a.reason)}</p></div>
 <div class="research-columns"><div><h3>实际观察到什么</h3><ul>${a.observations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="muted">${esc(r.scope)}</p><div class="chips">${a.facts.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div></div><div><h3>判断边界</h3><ul>${a.caveats.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>
 <h3>适合做什么页面</h3><div class="research-pages">${a.pages.map((p,i)=>`<div class="research-page"><span class="tag teal">建议 ${i+1}</span><h4>${esc(p.title)}</h4><p class="research-path">${esc(p.path)}</p><p>${esc(p.reason)}</p><ol>${p.sections.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></div>`).join('')||'<p>先补充身份已核对的结果；暂不建议创建页面。</p>'}</div>
 <h3>可追溯的搜索证据 <span class="muted">${r.results.length} 条精选样本，不是用户占比</span></h3><div class="evidence-list">${r.results.map((e,i)=>`<section class="evidence-row ${e.relevance==='excluded'?'evidence-excluded':''}"><span class="evidence-index">${i+1}</span><div><div class="chips"><span class="tag ${e.relevance==='excluded'||e.relevance==='uncertain'?'orange':'teal'}">${relevanceLabels[e.relevance]}</span><span class="tag">${esc(e.type)}</span></div><h4><a class="link" href="${safeLink(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)} ↗</a></h4><p>${esc(e.snippet)}</p><p class="muted">判断理由：${esc(e.reason)}</p></div></section>`).join('')}</div>
 <p class="muted">证据链接可能为百度跳转链接，后续可能变化；标题与观察摘要已留存。建议路径是规划，不代表网页已经创建。</p>
 <button class="secondary" data-research="new" data-query="${esc(r.query)}">记录新一轮搜索结果</button></div></article>`;
}
function resultFields(index){return `<fieldset class="research-result"><legend>搜索结果 ${index}</legend><div class="field"><label>结果标题<input name="result-title" required maxlength="300"></label></div><div class="field"><label>结果链接<input name="result-url" type="url" required maxlength="2000" placeholder="https://…"></label></div><div class="field"><label>实际看到的摘要 / 页面内容<textarea name="result-snippet" required maxlength="2000"></textarea></label></div><div class="field-grid"><div class="field"><label>页面类型<select name="result-type">${['品牌官网','产品介绍','公司资料','使用教程','价格说明','对比评测','下载入口','招聘信息','其他'].map(t=>`<option>${t}</option>`).join('')}</select></label></div><div class="field"><label>产品身份<select name="result-relevance">${['uncertain','match','owned','excluded'].map(k=>`<option value="${k}">${relevanceLabels[k]}</option>`).join('')}</select></label></div></div><div class="field"><label>为什么属于 / 不属于这个品牌<input name="result-reason" required maxlength="1000" placeholder="例如：运营公司一致；仅名称相似，未核对"></label></div></fieldset>`;}
function openResearchForm(query=''){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 openDialog('录入实际搜索结果',`<p class="muted">先打开搜索页，记录同一次查询的结果。建议至少 5–10 条；少量样本只能提供初步判断。不会自动获取搜索结果。</p><form id="research-form"><div class="field-grid"><div class="field"><label>完整查询词<input name="query" value="${esc(query)}" required maxlength="200"></label></div><div class="field"><label>要核对的品牌 / 产品<input name="brand" required maxlength="200" placeholder="品牌全称、别名或运营公司"></label></div></div><div class="actions"><a id="research-search-link" class="secondary" href="https://www.baidu.com/s?wd=${encodeURIComponent(query)}" target="_blank" rel="noopener noreferrer">打开百度搜索此词</a></div><div class="field-grid"><div class="field"><label>搜索引擎<input name="engine" value="百度" required maxlength="40"></label></div><div class="field"><label>观察日期<input name="date" type="date" value="${date}" required></label></div></div><div class="field"><label>市场 / 语言 / 设备<input name="market" value="中文桌面端；地区未固定" required maxlength="200"></label></div><div class="field"><label>样本范围与限制<input name="scope" required maxlength="1000" placeholder="例如：第一页 8 条非广告结果，仅查看标题摘要"></label></div><div id="research-results">${resultFields(1)}</div><div class="actions"><button type="button" class="secondary" id="add-result">添加一条结果</button><button class="primary" type="submit">保存证据并分析</button></div><p id="research-error" role="alert" class="error-box" hidden></p></form>`);
 const form=$('#research-form');
 form.elements.query.oninput=()=>$('#research-search-link').href='https://www.baidu.com/s?wd='+encodeURIComponent(form.elements.query.value);
 $('#add-result').onclick=()=>{const count=form.querySelectorAll('fieldset').length;if(count>=20)return;$('#research-results').insertAdjacentHTML('beforeend',resultFields(count+1));};
 form.onsubmit=async event=>{event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;try{
  const data={};['query','brand','engine','date','market','scope'].forEach(k=>data[k]=form.elements[k].value);
  data.results=Array.from(form.querySelectorAll('fieldset')).map(f=>Object.fromEntries(['title','url','snippet','type','relevance','reason'].map(k=>[k,f.querySelector(`[name="result-${k}"]`).value])));
  researchRecords=await api('/api/research',data);selectedResearch=researchRecords[0].id;$('#detail').close();await refresh(true);location.hash='research';toast('搜索证据已保存在本机，规则分析已生成');
 }catch(e){$('#research-error').hidden=false;$('#research-error').textContent=e.message;}finally{submit.disabled=false;}};
}
function exportResearch(){
 const head=['查询词','品牌','引擎','观察日期','市场','样本范围','具体意图','置信度','判断依据','页面建议','页面内容','证据标题与链接','限制'];
 const data=researchRecords.map(r=>{const a=RadarResearch.analyze(r);return [r.query,r.brand,r.engine,r.date,r.market,r.scope,a.label,a.confidence,a.reason+' '+a.observations.join('；'),a.pages.map(p=>p.title+' '+p.path).join('\n'),a.pages.map(p=>p.sections.join('；')).join('\n'),r.results.map(e=>`[${relevanceLabels[e.relevance]}] ${e.title}\n${e.url}\n${e.snippet}\n${e.reason}`).join('\n\n'),a.caveats.join('；')];});
 const csv=[head,...data].map(row=>row.map(v=>{let s=String(v??'');if(/^[=+\-@\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='搜索意图研究.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${data.length} 份研究及搜索证据`);
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-research]');if(!el)return;const action=el.dataset.research;if(action==='new')openResearchForm(el.dataset.query||'');if(action==='select'){selectedResearch=el.dataset.id;renderResearch();}if(action==='export')exportResearch();});
