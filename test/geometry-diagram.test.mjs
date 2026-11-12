import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { cleanGeometryDiagram as clean, geometrySchema, geometryInstruction, selectGuideGeometry, inspectGeometryDiagram } from '../lib/geometry-diagram.js';
for (const path of ['../src/template.html', '../index.html']) {
  const page = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.ok(page.indexOf('src="geometry_diagram.js') >= 0, 'The deployed page must load the geometry renderer');
  assert.ok(page.indexOf('src="geometry_diagram.js') < page.indexOf('src="ai_guide_engine.js'), 'The renderer must load before the guide engine');
}

const triangle = {
  isGeometry: true, caption: 'Tam giác ABC, M là trung điểm BC; AH vuông góc BC.',
  points: [{ id:'A',x:0,y:3,auxiliary:false }, { id:'B',x:-2,y:0,auxiliary:false }, { id:'C',x:4,y:0,auxiliary:false }, { id:'M',x:1,y:0,auxiliary:false }, { id:'H',x:0,y:0,auxiliary:true }, { id:'O',x:1,y:1/6,auxiliary:true }],
  segments: [['A','B'],['B','C'],['C','A'],['A','M'],['A','H']].map(([from,to],i)=>({from,to,auxiliary:i>2})),
  circles: [{center:'O',through:'A',auxiliary:true}],
  constraints: [{type:'midpoint',points:['M','B','C']},{type:'perpendicular',points:['A','H','B','C']},{type:'collinear',points:['B','H','C']}, ...['B','C'].map(id=>({type:'onCircle',points:[id,'O','A']}))]
};
assert.ok(clean(triangle));
const mutate = fn => { const value = structuredClone(triangle); fn(value); return value; };
for (const value of [null, {}, mutate(v=>v.points[0].x=NaN), mutate(v=>v.points[0].x=Infinity), mutate(v=>v.points[0].id='<svg onload=x>'), mutate(v=>v.points.push(v.points[0])), mutate(v=>v.segments[0].to='X'), mutate(v=>v.segments[0].to='A'), mutate(v=>v.circles[0].through='O'), mutate(v=>v.constraints[0].points[0]='A'), mutate(v=>v.constraints[1].points=['A','B','B','C']), mutate(v=>v.constraints[3].points=['M','O','A']), mutate(v=>v.constraints=[]), mutate(v=>v.constraints[0].type='__proto__'), mutate(v=>v.points=Array(41).fill(v.points[0]))]) assert.equal(clean(value),null);
const scaled = mutate(v=>v.points.forEach(p=>{ p.x=p.x*10+100; p.y=p.y*10-200; })); assert.ok(clean(scaled), 'Translation and uniform scale preserve relations');
const extras = mutate(v=>{v.rawSvg='<script>alert(1)</script>'; v.points[0].onclick='alert(1)';});
assert.equal(clean(extras).rawSvg, undefined); assert.equal(clean(extras).points[0].onclick,undefined);
for (const [type, points, expected] of [['equalLength',['A','H','B','M'],true], ['parallel',['B','M','M','C'],true], ['equalLength',['A','B','A','C'],false], ['parallel',['A','B','B','C'],false]]) {
  const value=mutate(v=>v.constraints.push({type,points})); assert.equal(Boolean(clean(value)),expected,type);
}
assert.ok(selectGuideGeometry({geometry:triangle},{geometryApproved:true},false).geometry);
assert.equal(selectGuideGeometry({geometry:triangle},{geometryApproved:false},false).geometry,null);
assert.equal(selectGuideGeometry({geometry:triangle},{geometryApproved:true,correctedGeometryApproved:false},true).geometry,null,'A repaired proof cannot inherit the old diagram');
assert.ok(selectGuideGeometry({geometry:triangle},{correctedGeometry:triangle,correctedGeometryApproved:true},true).geometry);
const assertStrict = schema => { if(schema.type==='object'){assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,Object.keys(schema.properties));Object.values(schema.properties).forEach(assertStrict);} if(schema.items)assertStrict(schema.items);}; assertStrict(geometrySchema);
// The actual persistence sanitizer must round-trip validated diagrams and reject forged data.
const api = fs.readFileSync(new URL('../api/data.js',import.meta.url),'utf8');
const sanitizer = api.slice(api.indexOf('function cleanText'),api.indexOf('function cleanStringList'));
const cleanGuide = new Function('cleanGeometryDiagram',sanitizer+';return cleanAiGuide;')(clean);
assert.deepEqual(cleanGuide({solution:'Proof',geometry:triangle,geometryRequested:true}).geometry,clean(triangle));
assert.equal(cleanGuide({solution:'Proof',geometry:mutate(v=>v.constraints=[])}).geometry,null);
assert.equal(cleanGuide({solution:'Legacy'}).geometry,null);
const doc = new JSDOM('<!doctype html>').window.document;
const figure = globalThis.MathAppGeometry.figure(doc,mutate(v=>v.caption='<img src=x onerror=alert(1)>'));
assert.equal(figure.querySelectorAll('line').length,5); assert.equal(figure.querySelectorAll('svg text').length,6);
assert.equal(figure.querySelectorAll('script,img,a,foreignObject').length,0);
assert.ok(figure.textContent.includes('<img'));assert.equal(figure.querySelector('svg').getAttribute('role'),'img');
assert.equal(figure.querySelectorAll('svg line[stroke="#dc2626"]').length, 2);
assert.equal(figure.querySelector('svg circle[fill="none"]').getAttribute('stroke'), '#dc2626');
assert.equal(figure.querySelectorAll('svg circle[r="3"][fill="#dc2626"]').length, 2);
const pointLabel = id => [...figure.querySelectorAll('svg text')].find(label => label.textContent === id);
assert.equal(pointLabel('H').getAttribute('fill'), '#dc2626');
assert.equal(pointLabel('M').getAttribute('fill'), '#0f172a', 'A point given in the statement stays dark even when joined by an auxiliary segment');
assert.match(figure.querySelector('.ai-geometry-legend').textContent, /dựng thêm/);
for(const el of figure.querySelectorAll('line,circle,text'))for(const attr of el.attributes)assert.doesNotMatch(attr.value,/NaN|Infinity/);

// Exercise the actual route with provider doubles: permissions precede generation,
// the database statement wins over client text, and only audited coordinates return.
const routeSource=fs.readFileSync(new URL('../api/ai-guide.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function','function').replace('export default async function','async function');
const { mathematicalAuditInstruction, auditEvidence }=await import('../lib/math-audit.js');
let signedIn=true, blocked=false, approval=true, diagram=triangle;
const calls=[];
const { generateGuideDiagram } = await import('../lib/guide-diagram.js');
let bookAssetKeys=[];
const route=new Function('readBookProblemImages','generateGuideDiagram', 'inspectGeometryDiagram', 'geometrySchema','geometryInstruction','selectGuideGeometry','cleanGeometryDiagram','mathematicalAuditInstruction','auditEvidence','retrieveVerifiedContext','getSession','checkRateLimit','generateJson','generateWithOpenAIFallback','parseBody','prepare','text','generateOpenAIJson',routeSource+';return handler;')(
  async()=>['data:image/png;base64,cG5n'],generateGuideDiagram,inspectGeometryDiagram,geometrySchema,geometryInstruction,selectGuideGeometry,clean,mathematicalAuditInstruction,auditEvidence,
  async()=>({blocked,bookAssetKeys,statement:'CANONICAL triangle ABC',topic:'Hình học phẳng',block:'No reference'}),()=>signedIn?{username:'student'}:null,()=>true,
  async args=>{calls.push(args);return{data:triangle,model:'solver'}},async primary=>({ ...await primary(), provider:'google' }), req=>req.body,()=>{},(v,max=50000)=>String(v??'').slice(0,max),
  async args=>{calls.push(args);return{data:{approved:approval,geometry:diagram},model:'reviewer'}}
);
const request=async(body={mode:'diagram',problemContent:'CLIENT text',solution:'AH perpendicular BC'})=>{const res={status(code){this.code=code;return this;},json(value){this.value=value;return this;}};await route({method:'POST',body},res);return res;};
assert.equal((await request()).code,200);assert.match(calls[0].contents,/CANONICAL triangle ABC/);assert.doesNotMatch(calls[0].contents,/CLIENT text/);assertStrict(calls[1].schema);
signedIn=false;const count=calls.length;assert.equal((await request()).code,401);assert.equal(calls.length,count);signedIn=true;
blocked=true;assert.equal((await request()).code,403);assert.equal(calls.length,count);blocked=false;
assert.equal((await request({mode:'diagram',problemContent:'x'})).code,400);
approval=false;assert.equal((await request()).code,422);approval=true;
diagram=mutate(v=>v.points[0].x=NaN);assert.equal((await request()).code,422);

bookAssetKeys=['stewart-1-1-47c33e6c/e03.png'];calls.length=0;
await request({problemContent:'graph',contentKey:'books:section:exercise-3'});
assert.equal(calls[0].contents.parts[1].inlineData.data,'cG5n');assert.deepEqual(calls[1].imageDataUrls,['data:image/png;base64,cG5n']);
bookAssetKeys=[];
const { createHarness } = await import('./ai-guide-editor.test.mjs');
const guide={branch:'Hình học phẳng',knowledge:'Tam giác',intuition:'Dựng H',solution:'Lời giải với $AH \\perp BC$.',pitfalls:'Các trường hợp suy biến.',geometry:triangle,geometryRequested:true};
for(const persisted of [false,true])for(const support of [false,true]){
  const h=await createHarness({persisted,support,guide});
  assert.equal(h.panel.querySelectorAll('[data-guide-field="solution"] .ai-geometry-figure').length,1);
  assert.equal(h.panel.querySelector('.ai-geometry-generate').textContent, 'Vẽ lại hình');
  assert.equal(await h.window.generateAIGuideDiagram(h.problemId), true, 'Existing diagrams can be redrawn to refresh auxiliary classifications');
  assert.equal(h.updateCalls.length + h.submitCalls.length, 0, 'Redrawing requires an explicit save to persist');
  h.window.currentLang = 'en'; h.window.dispatchEvent(new h.window.CustomEvent('langchange', { detail: { lang: 'en' } }));
  assert.equal(h.panel.querySelector('.ai-geometry-generate').textContent, 'Redraw diagram');
  assert.match(h.panel.querySelector('.ai-geometry-legend').textContent, /auxiliary elements/);
  h.window.currentLang = 'vi'; h.window.dispatchEvent(new h.window.CustomEvent('langchange', { detail: { lang: 'vi' } }));
  const popup=new JSDOM('<!doctype html>');h.window.open=()=>popup.window;popup.window.focus=()=>{};popup.window.print=()=>{};
  assert.equal(await h.window.printAIGuide(h.problemId),true);
  assert.equal(popup.window.document.querySelectorAll('svg line').length,5,'PDF/print retains vector diagram');
  assert.equal(popup.window.document.querySelectorAll('svg line[stroke="#dc2626"]').length, 2, 'PDF/print preserves red auxiliary lines');
  assert.equal(popup.window.document.querySelectorAll('svg circle[r="3"][fill="#dc2626"]').length, 2, 'PDF/print preserves red auxiliary points');
  assert.equal(popup.window.document.querySelectorAll('.ai-geometry-generate').length,0);
  await h.window.saveAIGuideToDatabase(h.problemId,'Hình học phẳng');
  const stored=h.updateCalls[0]?.[1] || h.submitCalls[0][5].aiGuide;
  assert.deepEqual(JSON.parse(JSON.stringify(stored.geometry)),clean(triangle),'UI saves diagram with guide');
  const savedText=h.updateCalls[0]?.[2] || h.submitCalls[0][2];
  assert.ok(savedText.includes(guide.solution)); assert.ok(!savedText.includes(triangle.caption),'Diagram UI does not pollute searchable solution text');
  h.window.editAIGuideContent(h.problemId);h.panel.querySelector('[data-guide-editor="solution"]').value='Lời giải mới';
  assert.equal(await h.window.printAIGuide(h.problemId),true);
  assert.equal(popup.window.document.querySelectorAll('svg').length,0,'Draft proof changes cannot print a stale diagram');
  h.window.applyAIGuideEdits(h.problemId);
  assert.equal(h.panel.querySelectorAll('svg').length,0,'Edited proof invalidates its auxiliary diagram');
  assert.ok(h.panel.querySelector('.ai-geometry-generate'));
  popup.window.close();h.window.close();
}
const old=await createHarness({guide:{...guide,geometry:null}});
assert.ok(old.panel.querySelector('.ai-geometry-generate'));
let requested;
old.window.fetch=async(url,options)=>{requested=JSON.parse(options.body);return{ok:true,json:async()=>({success:true,data:{geometry:triangle}})}};
assert.equal(await old.window.generateAIGuideDiagram(old.problemId),true);
assert.equal(requested.mode,'diagram');assert.equal(requested.solution,guide.solution);assert.equal(old.panel.querySelectorAll('svg').length,1);
assert.equal(old.updateCalls.length,0,'Diagram generation does not silently update the saved guide');old.window.close();
for (const support of [false, true]) {
  const legacy = await createHarness({ support, topic: 'Hình học phẳng', guide: { knowledge: 'K', intuition: 'I', solution: 'S', pitfalls: 'P' } });
  assert.ok(legacy.panel.querySelector('.ai-geometry-generate'), 'A legacy saved guide without branch/geometry must use the question topic');
  legacy.window.close();
}
const invalid=await createHarness({guide:{...guide,geometry:mutate(v=>v.constraints=[])}});
assert.equal(invalid.panel.querySelectorAll('svg').length,0);
invalid.window.fetch=async()=>({ok:false,json:async()=>({success:false,error:'Hình không hợp lệ',code:'GEOMETRY_CONSTRAINT_MISMATCH',reason:'Cần dựng lại hình chiếu.',details:[{message:'perpendicular(P, X, B, C)'}]})});
assert.equal(await invalid.window.generateAIGuideDiagram(invalid.problemId),false);
assert.match(invalid.panel.textContent,/Hình không hợp lệ/);assert.match(invalid.panel.textContent,/GEOMETRY_CONSTRAINT_MISMATCH/);assert.match(invalid.panel.textContent,/Cần dựng lại hình chiếu/);assert.equal(invalid.panel.querySelector('.ai-geometry-generate').disabled,false);invalid.window.close();
const racing=await createHarness({guide:{...guide,geometry:null}});
let releaseDiagram;const gate=new Promise(resolve=>{releaseDiagram=resolve});
racing.window.fetch=async()=>{await gate;return{ok:true,json:async()=>({success:true,data:{geometry:triangle}})}};
const pending=racing.window.generateAIGuideDiagram(racing.problemId);
assert.equal(await racing.window.generateAIGuideDiagram(racing.problemId),false,'Duplicate diagram requests are suppressed');
racing.window.editAIGuideContent(racing.problemId);racing.panel.querySelector('[data-guide-editor="intuition"]').value='Dựng đường phụ khác';racing.window.applyAIGuideEdits(racing.problemId);
releaseDiagram();assert.equal(await pending,false,'Late results cannot attach to a changed proof');assert.equal(racing.panel.querySelectorAll('svg').length,0);racing.window.close();
const algebra=await createHarness({guide:{...guide,branch:'Đại số',geometry:null,geometryRequested:false}});
assert.equal(algebra.panel.querySelector('.ai-geometry-generate'),null);algebra.window.close();
console.log('Geometry validation, SVG safety, persistence, legacy guides and print/PDF: OK');
