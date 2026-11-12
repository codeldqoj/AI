import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { getUniversityMaterials, universityMaterialCatalog, updateUniversityTheory } from '../lib/university-materials.js';
import { filterAppShell } from '../lib/app-shell.js';
import { canAccessProblem } from '../lib/problem-access.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const catalog=await universityMaterialCatalog();
assert.equal(catalog.courses.length,10);assert.equal(catalog.courses.reduce((n,c)=>n+c.sectionCount,0),80);assert.equal(catalog.courses.reduce((n,c)=>n+c.exampleCount,0),400);
const ids=new Set(catalog.sources.map(source=>source.id));assert.equal(catalog.sources.filter(s=>s.kind==='uploaded').length,20);
const stores=new Map();
const matches=(row,q)=>Object.entries(q).every(([k,v])=>String(row[k])===String(v));
const db={collection(name){if(!stores.has(name))stores.set(name,[]);const rows=stores.get(name);return{
 async findOne(q){const row=rows.find(row=>matches(row,q));return row?{...row}:null;},
 async findOneAndUpdate(q,update,options){let row=rows.find(row=>matches(row,q));if(!row){if(!options?.upsert)return null;row={...q,...update.$setOnInsert};rows.push(row);}Object.assign(row,update.$set);if(update.$push?.revisions){const push=update.$push.revisions;row.revisions=[...(row.revisions||[]),...push.$each].slice(push.$slice);}return {...row};},
 find(q){return{sort(){return this;},limit(){return this;},async toArray(){return rows.filter(row=>matches(row,q)).map(row=>({...row}));}};}
};}};
const user={role:'student',username:'uni',sub:'uni-id',educationLevels:['university']};
for(const course of catalog.courses){
 const data=await getUniversityMaterials(db,user,course.id);assert.equal(data.book.sections.length,8);assert.equal(data.problems.length,40);assert.equal(data.theories.length,8);
 for(const theory of data.theories){assert.ok(theory.references.length);for(const ref of theory.references){const source=catalog.sources.find(s=>s.id===ref.sourceId);assert.ok(source.pdfUrl.startsWith('https://'));assert.ok(ref.pdfPage>=1&&ref.pdfPage<=source.pdfPages);assert.match(source.pdfSha256,/^[a-f0-9]{64}$/);}}
 for(const section of data.book.sections){assert.equal(section.examples.length,5);assert.ok(section.theory.length>=2);assert.ok(section.method.length>=3);
  for(const ref of section.references)assert.ok(ids.has(ref.sourceId));
  for(const example of section.examples){assert.ok(example.steps.length>=3);assert.ok(example.result);assert.ok(example.insight);}
 }
 for(const problem of data.problems){assert.equal(problem.referenceSolutionVerified,false);assert.equal(canAccessProblem(problem,{role:'student',educationLevels:['upper_secondary']}),false);assert.equal(canAccessProblem(problem,user),true);}
}
assert.equal(stores.get('problems').length,400);
const key=stores.get('problems')[0].contentKey;stores.get('problems')[0].content='Admin edited statement';
await Promise.all([getUniversityMaterials(db,user,'mth-141'),getUniversityMaterials(db,user,'mth-141')]);
assert.equal(stores.get('problems').length,400);assert.equal(stores.get('problems').find(p=>p.contentKey===key).content,'Admin edited statement');
await assert.rejects(()=>getUniversityMaterials(db,{...user,educationLevels:['upper_secondary']},'mth-141'),/Đại học/);
await assert.rejects(()=>getUniversityMaterials(db,user,'../sources'),/Học phần/);
const teacher={...user,role:'teacher'};
const sample=(await getUniversityMaterials(db,user,'mth-141')).theories[0];
const theoryPayload={courseId:'mth-141',sectionId:sample.materialSectionId,expectedVersion:1,theory:'Edited theory $f(x)=x^2$.',references:sample.references};
for(const account of [user,{...teacher,educationLevels:['upper_secondary']}])await assert.rejects(()=>updateUniversityTheory(db,account,theoryPayload),e=>e.status===403);
for(const references of [[null],[],[{sourceId:'javascript:alert(1)',pdfPage:1}],[{...sample.references[0],pdfPage:0}],[{...sample.references[0],pdfPage:999999}],[{...sample.references[0],pdfPage:1.5}]])await assert.rejects(()=>updateUniversityTheory(db,teacher,{...theoryPayload,references}),e=>e.status===400);
await assert.rejects(()=>updateUniversityTheory(db,teacher,{...theoryPayload,theory:''}),e=>e.status===400);
await assert.rejects(()=>updateUniversityTheory(db,teacher,{...theoryPayload,sectionId:'../sources'}),e=>e.status===404);
const simultaneous=await Promise.allSettled([updateUniversityTheory(db,teacher,theoryPayload),updateUniversityTheory(db,teacher,theoryPayload)]);
assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);assert.equal(simultaneous.find(r=>r.status==='rejected').reason.status,409);
let savedTheory=(await getUniversityMaterials(db,user,'mth-141')).theories[0];assert.equal(savedTheory.theory[0],theoryPayload.theory);assert.equal(savedTheory.revisions,undefined);const history=stores.get('content_blocks').find(b=>b.blockKey===sample.blockKey).revisions;assert.equal(history.length,1);assert.equal(history[0].version,1);
assert.equal(stores.get('content_blocks').filter(b=>b.blockKey.startsWith('university-theory:')).length,80);
const dom=new JSDOM(filterAppShell(read('index.html'),user),{url:'https://example.test/',runScripts:'outside-only'});const {window}=dom;
window.eval(read('education_access.js'));let activeUser=user;window.VMOAuth={getSession:()=>activeUser};
window.CSS ||= {};window.CSS.escape ||= value=>String(value);
window.MathJax={typesetClear(){},typesetPromise:async()=>{}};
window.safeRenderMathJaxToElement=(el,text)=>{el.textContent=text;};window.reinitDatabaseUI=()=>{};window.reinitAIGuide=()=>{};
window.fetch=async url=>{const id=new URL(url,'https://example.test').searchParams.get('courseId');return{ok:true,json:async()=>({success:true,item:id?await getUniversityMaterials(db,user,id):catalog})};};
window.VMODataService={getCatalogProblems:async()=>[],getContentSets:async()=>[],getEvents:async()=>[]};
window.eval(read('vmo_db_ui.js'));window.eval(read('ai_guide_engine.js'));
window.scrollTo=()=>{};window.eval(read('app.js'));
window.eval(read('university_materials.js'));await window.loadUniversityMaterials();
assert.equal(window.document.querySelectorAll('#universityMaterialsCourse option').length,10);
for(const course of catalog.courses){window.document.getElementById('universityMaterialsCourse').value=course.id;await window.loadUniversityMaterials();assert.equal(window.document.querySelectorAll('#universityMaterialsContent .theorybox').length,8);assert.equal(window.document.querySelectorAll('#universityMaterialsContent .problem-item').length,40);}
assert.equal(window.document.querySelectorAll('#universityMaterialsContent .btn-ai-guide').length,40);
assert.equal(window.document.querySelectorAll('#universityMaterialsContent .btn-submit-solution').length,40);
activeUser={...user,role:'teacher'};window.reinitDatabaseUI(window.document.getElementById('universityMaterialsContent'));
assert.equal(window.document.querySelectorAll('#universityMaterialsContent .btn-manage-reference-links').length,40);
// Exercise actual click handlers and the actual data service, not just button counts.
const tick=()=>new Promise(resolve=>window.setTimeout(resolve,0));
const uiErrors=[];window.addEventListener('error',event=>{uiErrors.push(event.error?.message||event.message);event.preventDefault();});
const requests=[];let submitted=null,updated=null,guideFailure=false;
const response=(body,ok=true,status=503)=>({ok,status:ok?200:status,headers:{get:()=> 'application/json'},json:async()=>body});
window.fetch=async(url,options={})=>{
 const parsed=new URL(url,'https://example.test');const body=options.body?JSON.parse(options.body):null;requests.push({url:parsed,body});
 if(parsed.pathname==='/api/ai-guide')return guideFailure?response({error:'AI temporarily unavailable'},false):response({success:true,data:{knowledge:'Use the definition.',intuition:'Apply the hypothesis.',solution:'Detailed solution: $x=1$.',pitfalls:'Check the domain.'}});
 if(body?.action==='update_university_theory'){try{return response({success:true,item:await updateUniversityTheory(db,activeUser,body.payload)});}catch(error){return response({success:false,error:error.message},false,error.status||500);}}
 if(body?.action==='submit_solution'){submitted=body.payload;return response({success:true,item:{_id:'submission-test',...submitted}});}
 if(body?.action==='update_catalog_content'){
  updated=body.payload;const problem=stores.get('problems').find(p=>String(p._id)===updated.id);Object.assign(problem,{content:updated.content,referenceSolution:updated.referenceSolution,referenceLinks:updated.referenceLinks,version:problem.version+1});return response({success:true,item:{...problem,_id:String(problem._id)}});
 }
 if(parsed.searchParams.get('resource')==='university_materials')return response({success:true,item:parsed.searchParams.get('courseId')?await getUniversityMaterials(db,user,parsed.searchParams.get('courseId')):await universityMaterialCatalog(db,user)});
 if(parsed.searchParams.get('resource')==='problems')return response({success:true,items:stores.get('problems').filter(p=>p.contentKey===parsed.searchParams.get('contentKey')).map(p=>({...p,_id:String(p._id),setId:String(p.setId)}))});
 return response({success:true,items:[]});
};
window.eval(read('vmo_data_service.js').replace(/^export /gm,''));
let copied='',fallbackText='';Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
window.confirm=()=>true;window.prompt=(_,text)=>{fallbackText=text;};
for(const course of catalog.courses){
 window.document.getElementById('universityMaterialsCourse').value=course.id;await window.loadUniversityMaterials();
 assert.equal(window.document.querySelectorAll('#universityMaterialsContent .btn-manage-university-theory').length,8);
 const theoryBox=window.document.querySelector('#universityMaterialsContent .theorybox');
 const deepLink=theoryBox.querySelector('.btn-citation-open');assert.ok(/#page=\d+$/.test(deepLink.href));assert.equal(deepLink.target,'_blank');
 theoryBox.querySelector('.btn-manage-university-theory').click();const input=window.document.getElementById('universityTheoryText');
 assert.ok(input.value);const revised=input.value+' New formula $a^2+b^2=c^2$.';input.value=revised;
 await window.document.getElementById('universityTheorySave').onclick();assert.equal(window.document.getElementById('universityTheoryEditor'),null);
 assert.ok(window.document.querySelector('#universityMaterialsContent .theorybox').textContent.includes('New formula $a^2+b^2=c^2$'));
 window.document.querySelector('#universityMaterialsContent .btn-manage-university-theory').click();assert.equal(window.document.getElementById('universityTheoryText').value,revised);
 const pageInput=window.document.querySelector('#universityTheoryReferences input[type=number]');pageInput.value='0';await window.document.getElementById('universityTheorySave').onclick();assert.ok(window.document.getElementById('universityTheoryError').textContent);assert.equal(window.document.getElementById('universityTheoryText').value,revised);
 window.document.getElementById('universityTheoryEditor').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(window.document.getElementById('universityTheoryEditor'),null);
 const card=window.document.querySelector('#universityMaterialsContent .problem-item');
 assert.equal(card.querySelector('.university-example-actions').previousElementSibling,card.querySelector('.problem-content'));
 const problem=stores.get('problems').find(p=>p.contentKey===card.dataset.contentKey);
 // Simulate a MathJax-rendered statement whose text no longer contains original TeX.
 card.querySelector('.problem-content').innerHTML='<mjx-container>typeset display only</mjx-container>';
 card.querySelector('.btn-copy').click();await tick();assert.equal(copied,`${problem.shortLabel}:\n${problem.content}`);
 card.querySelector('.btn-submit-solution').click();
 // Verify BEFORE the asynchronous catalog refresh: initial modal must have the full statement.
 assert.equal(window.currentSubmissionData.problemContent,problem.content);
 assert.equal(window.currentSubmissionData.topic,problem.topic);assert.equal(window.currentSubmissionData.examTitle,problem.setTitle);
 assert.equal(window.document.getElementById('submissionModal').style.display,'flex');await tick();
 window.document.getElementById('subSolutionText').value='My solution: $x=1$';await window.document.getElementById('btnConfirmSubmit').onclick();
 assert.equal(submitted.problemKey,problem.contentKey);assert.equal(submitted.problemContent,problem.content);assert.equal(submitted.sourceGroup,'university_materials');
 assert.equal(submitted.solutionContent,'My solution: $x=1$');window.closeSubmissionModal();
 card.querySelector('.btn-ai-guide').click();await tick();
 const guide=requests.filter(r=>r.url.pathname==='/api/ai-guide').at(-1).body;
 assert.equal(guide.contentKey,problem.contentKey);assert.equal(guide.problemTitle,problem.shortLabel);assert.equal(guide.problemContent,problem.content);
 assert.equal(guide.examTitle,problem.setTitle);assert.equal(guide.topic,problem.topic);
 assert.ok(card.querySelector('.ai-guide-panel').textContent.includes('Detailed solution'));
 card.querySelector('.btn-ai-guide').click();await tick();assert.equal(card.querySelector('.ai-guide-panel').style.display,'none');
 card.querySelector('.btn-ai-guide').click();await tick();assert.equal(card.querySelector('.ai-guide-panel').style.display,'block');
 card.querySelector('.btn-manage-reference-links').click();await tick();
 const modal=window.document.getElementById('referenceLinksAdminModal');assert.equal(modal.style.display,'flex');assert.equal(modal.dataset.problemId,String(problem._id));
 const edit=window.document.getElementById('referenceManagerProblemContent');assert.equal(edit.disabled,false);assert.equal(edit.value,problem.content);
 const changed=problem.content+' Updated $y=2$';edit.value=changed;
 const revisedSolution='Lời giải đã sửa: $x=2$.';window.document.getElementById('referenceManagerSolution').value=revisedSolution;
 const row=window.document.querySelector('#referenceLinksRows .reference-link-edit-row');row.querySelector('.reference-link-label').value='Reference';row.querySelector('.reference-link-url').value='https://example.test/reference';
 await window.saveReferenceLinksManager();assert.equal(updated.id,String(problem._id));assert.equal(updated.expectedVersion,1);assert.equal(updated.referenceSolution,revisedSolution);assert.equal(updated.referenceSolutionVerified,false);assert.equal(card.querySelector('.example-solution').textContent,revisedSolution);
 assert.equal(card.querySelector('.problem-content').getAttribute('data-raw-math'),changed);assert.ok(card.querySelector('.source-solution-box a'));
 card.querySelector('.btn-copy').click();await tick();assert.equal(copied,`${problem.shortLabel}:\n${changed}`);
}
const last=window.document.querySelector('#universityMaterialsContent .problem-item');
Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}}});last.querySelector('.btn-copy').click();await tick();assert.ok(fallbackText.includes('Updated $y=2$'));
Object.defineProperty(window.navigator,'clipboard',{value:undefined});fallbackText='';last.querySelector('.btn-copy').click();await tick();assert.ok(fallbackText.includes('Updated $y=2$'));
last.querySelector('.ai-guide-panel').remove();guideFailure=true;last.querySelector('.btn-ai-guide').click();await tick();assert.equal(last.querySelector('.ai-guide-panel').dataset.guideError,'true');
guideFailure=false;last.querySelector('.btn-ai-guide').click();await tick();assert.ok(last.querySelector('.ai-guide-panel').textContent.includes('Detailed solution'));
activeUser=user;last.querySelector('.btn-manage-reference-links').remove();window.reinitDatabaseUI(last.parentElement);assert.equal(last.querySelector('.btn-manage-reference-links'),null);
await window.loadUniversityMaterials(true);assert.equal(window.document.querySelector('#universityMaterialsContent .btn-manage-university-theory'),null);assert.ok(window.document.querySelector('#universityMaterialsContent .theorybox').textContent.includes('New formula'));
assert.deepEqual(uiErrors,[]);
const search=window.document.getElementById('universityMaterialsSearch');search.value='zzzz-no-match';search.dispatchEvent(new window.Event('input'));assert.equal(window.document.querySelectorAll('.university-material-section[hidden]').length,8);
search.value='';search.dispatchEvent(new window.Event('input'));assert.equal(window.document.querySelectorAll('.university-material-section[hidden]').length,0);
window.document.getElementById('universityMaterialsSolutions').click();assert.equal(window.document.querySelectorAll('#universityMaterialsContent .example-solution.is-collapsed').length,40);
let prints=0;window.print=()=>{prints++;window.dispatchEvent(new window.Event('afterprint'));};window.document.getElementById('universityMaterialsPrint').click();await new Promise(resolve=>window.setTimeout(resolve,0));assert.equal(prints,1);assert.equal(window.document.querySelectorAll('#universityMaterialsContent .example-solution.is-collapsed').length,40);
window.close();console.log('University textbook: 10 courses / 80 theory sections / 400 worked examples; source integrity, DB initialization, permissions, preserved edits, search, solutions and print: OK');
