const assert = require('node:assert/strict');
const {analyze} = require('../workbench/intent.js');

// Query cues should be classified in Chinese and English.
for (const [term, key] of [
  ['什么是 AI 视频剪辑','learn'], ['PhotoCraft 官网','navigate'],
  ['PhotoCraft alternatives','compare'], ['PhotoCraft pricing','price'],
  ['如何安装 PhotoCraft','how'], ['PhotoCraft not working','fix'],
  ['免费在线视频转换器','do'], ['What is semantic search','learn']
]) {
  const a=analyze({term});
  assert.equal(a.key,key,term);
  assert(a.evidence.some(e=>term.includes(e.quote)),term+' must cite literal query evidence');
  assert(a.pages.length>0);
  assert.notEqual(a.confidence,'高');
}

// Project prose is context, never a proxy for a user's query.
const named=analyze({term:'strata',repo:'person/Strata',kinds:['breakout'],description:'Best free tool. Download now. How to install.'});
assert.equal(named.key,'brand');
assert.equal(named.confidence,'低');
assert(named.evidence.some(e=>e.kind==='项目上下文'));
assert.equal(analyze({term:'Free-Download',repo:'person/Free-Download'}).key,'brand');
assert.equal(analyze({term:'best agent',repo:'person/best-agent'}).key,'brand');
assert.equal(analyze({term:'Qwen3',kinds:['hf']}).key,'brand');
assert.equal(analyze({term:'research',examples:['AI generator download free']}).key,'unknown');

// Ambiguous queries keep all competing signals and a low confidence rating.
const mixed=analyze({term:'best free online image generator'});
assert.equal(mixed.key,'compare');
assert(mixed.secondary.includes('直接完成任务'));
assert.equal(mixed.confidence,'低');
assert(mixed.constraints.some(s=>s.startsWith('免费')));
assert.equal(analyze({term:'free'}).key,'unknown');
assert.equal(analyze({term:'preview'}).key,'unknown'); // not a substring match for "review"
assert.equal(analyze({}).key,'unknown');
console.log('Intent classification: 18 cases passed (cues, ambiguity, provenance, name collisions).');
