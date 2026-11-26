const assert=require('node:assert/strict');
const research=require('../workbench/research.js');
const records=['示例产品','示例产品 怎么用','示例产品 收费'].map((query,i)=>({id:'fixture-'+i,query,results:[{title:'示例产品首页',url:'https://example.com',type:'品牌官网',relevance:'match'}]}));
assert.deepEqual(require('../workbench/research-seed.json'),[], 'Public release must not include customer research');
assert.equal(records.length,3);
assert.equal(research.find(records,'示例产品怎么用'),undefined,'No fuzzy borrowing of SERP evidence');
assert.equal(research.find(records,'示例产品 官网'),undefined);
assert.equal(research.find(records,' 示例产品  ').id,records[0].id);
assert.equal(new Set(records.map(r=>research.analyze(r).label)).size,3);
for(const r of records){
 const a=research.analyze(r);
 assert(a.pages.length>0);
 assert(a.excluded.every(x=>!a.eligible.includes(x)));
 assert(a.uncertain.every(x=>!a.eligible.includes(x)));
 assert(a.confidence!=='高');
 assert(r.results.every(x=>new URL(x.url).protocol.startsWith('http')));
}
const seed={query:'产品X',results:[{type:'使用教程',relevance:'excluded'}]};
assert.equal(research.analyze(seed).pages.length,0,'Unrelated tutorials must never drive a page recommendation');
seed.results=[{type:'品牌官网',relevance:'uncertain'}];
assert.equal(research.analyze(seed).pages.length,0);
seed.results=[{type:'对比评测',relevance:'owned'}];
const a=research.analyze(seed);
assert.equal(a.confidence,'低');
assert(a.caveats.some(x=>x.includes('不能独立证明')));
seed.query='产品X 收费';
assert.equal(research.analyze(seed).label,'了解价格 / 购买');
assert(!research.analyze(seed).observations.join('').includes('免费'));
console.log('Search evidence tests passed: exact query scope, exclusions, provenance, differentiated seeds.');
