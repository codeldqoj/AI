import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {normalizedStatement,statementFingerprint,functionalMethodMatch} from '../lib/rag-statement-match.js';
import {retrieveVerifiedContext} from '../lib/rag-retrieval.js';
import {mathText,contentHash,mathTags,topicOf,constraints,sourceFresh} from '../lib/rag-core.js';
import {queueSource,processRagJobs} from '../lib/rag-store.js';
import {fixtures,FakeDb,embedStub} from './fixtures/rag-fixtures.mjs';

const hcm=String.raw`Gọi $S$ là tập hợp tất cả các hàm $f:\mathbb{R}\to\mathbb{R}$ khác hằng thỏa $f(2)\ne1$ và
$$f(xf(y)-x+y)+f(xy)=f(2026x)+f(y),\quad\forall x,y\in\mathbb{R}.$$
a) Với $f\in S$, gọi $A=\{a\in\mathbb{R}\mid f(a)=1\}$. Chứng minh rằng $0\notin A$ và $2026\in A$.
b) Chứng minh rằng $A=\{2026\}$.
c) Tìm $S$.`;
const hcmOcr=hcm.replace(/\$\$([\s\S]*?)\$\$/g,'\\[$1\\] (1)').replace(/Chứng minh rằng/g,'Chứng minh').replace(/\\to\b/g,'\\rightarrow');
const danang=String.raw`Xét hàm số $f:\mathbb{N}^*\to\mathbb{N}^*$ thỏa mãn đồng thời các điều kiện sau với mọi số nguyên dương $m,n,a$:
(i) $f(f(m)f(n))=mn$;
(ii) $f(2027a+1)=2027a+1$.
a) Tính $f(1)$.
b) Tìm tất cả hàm số $f$ thỏa mãn điều kiện bài toán.
(Cho biết 2027 là một số nguyên tố)`;
const danangOcr=danang.replace(/\n\(Cho biết[^\n]+/,'').replace('a) Tính','1. Tính').replace('b) Tìm','2. Tìm');
assert.equal(statementFingerprint(hcm),statementFingerprint(hcmOcr));
assert.equal(statementFingerprint('$$x=1.$$'),statementFingerprint('\\[x=1\\]'));
assert.notEqual(statementFingerprint('$x=1...$'),statementFingerprint('$x=1$'));
assert.equal(statementFingerprint(danang),statementFingerprint(danangOcr));
assert.equal(statementFingerprint('<p>a) Tính $f(1)$.</p>'),statementFingerprint('1. Tính \\(f(1)\\).'));
assert.notEqual(statementFingerprint(hcm),statementFingerprint(hcm.replaceAll('2026','2027')));
assert.notEqual(statementFingerprint(hcm),statementFingerprint(hcm.replace('\\ne1','=1')));
assert.notEqual(statementFingerprint(hcm),statementFingerprint(hcm.replaceAll('\\mathbb{R}','\\mathbb{N}')));
assert.notEqual(statementFingerprint('$a_{2727}$'),statementFingerprint('$a_{27^{27}}$'));
assert.notEqual(statementFingerprint('$f(1)$'),statementFingerprint('$f$'));
assert.notEqual(statementFingerprint('Số 0.5'),statementFingerprint('Số 0, 5'));
assert.notEqual(statementFingerprint('Số 15 (Cho biết 15 là một số nguyên tố)'),statementFingerprint('Số 15'));
assert.notEqual(statementFingerprint('$$\n1. 5x\n$$'),statementFingerprint('$$\n5x\n$$'));
assert.notEqual(statementFingerprint('$p>0$'),statementFingerprint('$p<0$'));
assert.equal(functionalMethodMatch(hcm,hcm.replace('Gọi $S$ là tập hợp tất cả','Xét tập $S$ gồm')),true);
assert.equal(functionalMethodMatch(hcm,hcm.replaceAll('2026','2027')),false);
assert.equal(functionalMethodMatch(hcm,hcm.replace('khác hằng','liên tục')),false);

function records(sourceText,queryText){
 const data=fixtures(),p=data.problems[0],s=data.submissions[0],k=data.verified_knowledge[0],query=data.problems[3];
 Object.assign(p,{content:sourceText,topic:'Phương trình hàm',sourceGroup:'tst',contentKey:'tst:hcm-2026:question-6'});
 Object.assign(s,{problemKey:p.contentKey,problemSnapshot:{content:sourceText}});
 Object.assign(k,{problemKey:p.contentKey,statementFingerprint:statementFingerprint(sourceText),problemContentHash:contentHash(sourceText),topic:topicOf(p.topic),mathTags:mathTags(sourceText+' '+p.topic),constraints:constraints(sourceText)});
 Object.assign(query,{content:queryText,topic:p.topic,sourceGroup:'math_support',ownerId:'audit',contentKey:'math_support:upload:question-1'});
 assert.ok(sourceFresh(k,s,p));return {data,p,s,k,query};
}
const oldMode=process.env.RAG_MODE;delete process.env.RAG_MODE;
try{
 for(const purpose of ['guide','evaluation']){
  for(const [source,queryText] of [[hcm,hcm],[hcm,hcmOcr],[danang,danangOcr]]){
   const {data,query}=records(source,queryText);let paid=0;
   const result=await retrieveVerifiedContext({problemRef:query.contentKey,session:{role:'admin',username:'audit'},purpose},{db:new FakeDb(data),embed:async()=>{paid++;throw Error('exact must not embed');}});
   assert.equal(result.mode,'exact');assert.equal(result.sources[0].crossCatalog,true);assert.equal(paid,0);assert.equal(result.statement,queryText);
   assert.match(result.sources[0].problemKey,/^tst:/);assert.ok(result.block.includes('EXACT'));assert.equal(data.rag_retrieval_logs.at(-1).purpose,purpose);
  }
 }
 // Direct verified snapshots are usable before the queue/index has been processed.
 const beforeIndex=records(hcm,hcmOcr);beforeIndex.data.verified_knowledge=[];
 assert.equal((await retrieveVerifiedContext({problemRef:beforeIndex.query.contentKey,session:{role:'admin'}},{db:new FakeDb(beforeIndex.data),embed:embedStub})).mode,'exact');
 for(const state of ['revoked','deleted','stale-statement','draft','private','private-support','wrong-owner','wrong-grade','unverified','changed-solution']){
  const {data,p,s,query}=records(hcm,hcmOcr);let session={role:'admin',sub:'audit',educationLevels:['upper_secondary']};
  if(state==='revoked'||state==='unverified')s.adminVerified=false;
  if(state==='deleted')s.deletedAt=new Date();
  if(state==='changed-solution')s.solutionContent+=' Edited but not reverified.';
  if(state==='stale-statement')p.content+=' New hypothesis.';
  if(state==='draft')p.status='draft';
  if(state==='private')p.isPrivate=true;
  if(state==='private-support'){p.sourceGroup='math_support';p.ownerId='other';}
  if(state==='wrong-owner'){query.ownerId='other';session={role:'student',sub:'audit',educationLevels:['upper_secondary']};}
  if(state==='wrong-grade'){p.educationLevel='university';session={role:'teacher',sub:'audit',educationLevels:['upper_secondary']};}
  const result=await retrieveVerifiedContext({problemRef:query.contentKey,session},{db:new FakeDb(data),embed:embedStub});
  assert.ok(result.blocked||result.sources.length===0,state);
 }
 // Same coefficients/domain/formula, different prose => method-only, not EXACT.
 const similar=records(hcm,hcm.replace('Gọi $S$ là tập hợp tất cả','Xét tập $S$ gồm'));
 let vectorCalls=0;const db=new FakeDb(similar.data),originalCollection=db.collection.bind(db);
 db.collection=name=>{const col=originalCollection(name);if(name==='verified_knowledge'){const original=col.aggregate;col.aggregate=pipeline=>{if(pipeline[0].$vectorSearch)vectorCalls++;return original(pipeline);};}return col;};
 const method=await retrieveVerifiedContext({problemRef:similar.query.contentKey,session:{role:'admin'}},{db,embed:embedStub});
 assert.equal(method.mode,'hybrid');assert.equal(method.sources[0].permittedUse,'method-only');assert.equal(vectorCalls,1);
 const unrelated=records(hcm,hcm.replaceAll('2026','2027'));
 assert.equal((await retrieveVerifiedContext({problemRef:unrelated.query.contentKey,session:{role:'admin'}},{db:new FakeDb(unrelated.data),embed:embedStub})).sources.length,0);
 // Fingerprint lookup reaches an older indexed source beyond the legacy scan budget.
 const large=records(hcm,hcmOcr);large.data.submissions.unshift(...Array.from({length:210},()=>({_id:new ObjectId(),adminVerified:true,adminVerifiedAt:'2027-01-01',problemSnapshot:{content:'Other statement'}})));
 assert.equal((await retrieveVerifiedContext({problemRef:large.query.contentKey,session:{role:'admin'}},{db:new FakeDb(large.data),embed:embedStub})).mode,'exact');
 const upgrade=records(hcm,hcmOcr);delete upgrade.k.statementFingerprint;
 upgrade.k.searchText=`${mathText(upgrade.p.content).slice(0,3500)}\n${upgrade.p.topic}\n${mathText(upgrade.s.solutionContent).slice(0,6000)}`;
 const upgradeDb=new FakeDb(upgrade.data);await queueSource(upgradeDb,upgrade.s._id);assert.equal(upgrade.k.status,'active');
 const upgraded=await processRagJobs(upgradeDb,1,async()=>{throw Error('metadata-only backfill must reuse embedding');});
 assert.equal(upgraded.results[0].status,'ready');assert.equal(upgraded.results[0].reusedEmbedding,true);
 assert.equal(upgrade.k.statementFingerprint,statementFingerprint(hcm));
 process.env.RAG_MODE='exact';
 const exactOnly=records(hcm,hcmOcr);
 assert.equal((await retrieveVerifiedContext({problemRef:exactOnly.query.contentKey,session:{role:'admin'}},{db:new FakeDb(exactOnly.data),embed:embedStub})).mode,'exact');
}finally{if(oldMode===undefined)delete process.env.RAG_MODE;else process.env.RAG_MODE=oldMode;}
console.log('Cross-catalog RAG: HCM Q6 / Da Nang Q2, normalized statements, verified-only/permissions, old records, broad functional fallback and exact-only mode: OK');
