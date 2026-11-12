import { universityCatalog, resolveUniversityCourse, addUniversityCatalogItem, UNIVERSITY_MAX_DAYS, UNIVERSITY_MAX_QUESTIONS } from '../lib/university-catalog.js';
import { UNIVERSITY_COURSES, universityCourse, universitySection, universityExamSection } from '../lib/university-courses.js';
import { educationDb } from '../lib/education-db.js';
import { allows } from '../lib/education-access.js';
import { canAccessProblem, supportVisibility } from '../lib/problem-access.js';
import { handleMathSupport } from '../lib/math-support.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ObjectId } from 'mongodb';
import { JSDOM } from 'jsdom';

// Execute the real route against isolated collections; never connect to Atlas.
const stores = new Map();
let role = 'admin';
let educationLevels;
const problemBulkWriteSizes = [];
const matches = (doc, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$and') return value.every(part => matches(doc, part));
  if (key === '$or') return value.some(part => matches(doc, part));
  if (value && typeof value === 'object' && !(value instanceof ObjectId)) {
    if ('$exists' in value) return (doc[key] !== undefined) === value.$exists;
    if ('$nin' in value) return !value.$nin.some(item => String(item) === String(doc[key]));
    if ('$ne' in value) return String(doc[key]) !== String(value.$ne);
    if ('$in' in value) return value.$in.some(item => String(item) === String(doc[key]));
    return true;
  }
  return String(doc[key]) === String(value);
});
const db = { collection(name) {
  if (!stores.has(name)) stores.set(name, []);
  const rows = stores.get(name);
  return {
    async findOne(query) { return rows.find(row => matches(row, query)); },
    async findOneAndUpdate(query, update) {
      let row = rows.find(row => matches(row, query));
      if (!row) { row = { _id: new ObjectId(), ...update.$setOnInsert, ...query }; rows.push(row); }
      Object.assign(row, update.$set);
      return row;
    },
    async bulkWrite(operations) {
      if (name === 'problems') problemBulkWriteSizes.push(operations.length);
      for (const { updateOne } of operations) {
        const { filter, update, upsert } = updateOne;
        let row = rows.find(item => matches(item, filter));
        if (!row && upsert) {
          row = { _id: new ObjectId(), ...update.$setOnInsert, ...filter };
          rows.push(row);
        }
        if (row) Object.assign(row, update.$set);
      }
      return { ok: 1 };
    },
    async deleteMany() {}, async createIndex() {},
    async updateOne(query, update) { const row=rows.find(row=>matches(row,query));if(row)Object.assign(row,update.$set);return{matchedCount:row?1:0}; },
    async updateMany(query, update) { const selected=rows.filter(row=>matches(row,query));selected.forEach(row=>Object.assign(row,update.$set));return{matchedCount:selected.length}; },
    find(query, options = {}) {
      return { sort() { return this; }, limit() { return this; }, async toArray() {
        return rows.filter(row => matches(row, query)).map(row => options.projection ? Object.fromEntries(Object.entries(row).filter(([key]) => key === '_id' || options.projection[key])) : row);
      } };
    },
    aggregate(pipeline) { return { async toArray() {
      const counts = new Map();
      rows.filter(row => matches(row, pipeline[0].$match)).forEach(row => counts.set(row.examId, (counts.get(row.examId) || 0) + 1));
      return [...counts].map(([_id, count]) => ({ _id, count }));
    } }; }
  };
} };
const source = fs.readFileSync(new URL('../api/data.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async function handler', 'async function handler');
const handler = new Function('universityCatalog','resolveUniversityCourse','addUniversityCatalogItem','UNIVERSITY_MAX_DAYS','UNIVERSITY_MAX_QUESTIONS','universitySection','universityExamSection','universityCourse', 'educationDb', 'allows', 'getDb', 'getSession', 'ObjectId', 'recordActivity', 'canAccessProblem', 'supportVisibility', 'handleMathSupport', `${source}\nreturn handler;`)(
  universityCatalog,resolveUniversityCourse,addUniversityCatalogItem,UNIVERSITY_MAX_DAYS,UNIVERSITY_MAX_QUESTIONS,universitySection,universityExamSection,universityCourse, educationDb, allows,   async () => db, () => ({ role, username: 'tester', ...(educationLevels ? {educationLevels} : {}) }), ObjectId, async () => {}, canAccessProblem, supportVisibility, handleMathSupport);
async function call(payload, query) {
  const res = { code: 0, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: query ? 'GET' : 'POST', query, body: { action: 'create_exam_from_ocr', payload } }, res);
  return res;
}
for (const [destination, category] of [['olympic30', 'olympic-30-4'], ['duyenhai', 'duyen-hai-bac']]) {
  const payload = grade => ({ destination, grade, province: 'Kỳ thi', year: '2026-2027', dayNumber: 1,
    targetAnchor: `${destination}-ky-thi-2026-2027-grade-${grade}`, sourceImageCount: 1,
    questions: [{ questionNumber: 1, content: 'Chứng minh bất đẳng thức.' }] });
  for (const invalid of [undefined, 9, 12, '10abc']) {
    assert.equal((await call(payload(invalid))).code, 400, 'Invalid grade is rejected before writing');
  }
  assert.equal((await call({ ...payload(10), targetAnchor: payload(11).targetAnchor })).code, 400);
  const ten = await call(payload(10)), eleven = await call(payload(11));
  assert.equal(ten.code, 201); assert.equal(eleven.code, 201);
  assert.notEqual(ten.body.item.examKey, eleven.body.item.examKey);
  assert.notEqual(ten.body.item.setKey, eleven.body.item.setKey);
  assert.notEqual(ten.body.item.problems[0].contentKey, eleven.body.item.problems[0].contentKey);
  assert.equal(ten.body.item.problems[0].grade, 10);
  assert.equal(eleven.body.item.problems[0].grade, 11);
  assert.equal((await call(payload(10))).code, 409, 'Same grade duplicate still requires confirmation');
  const summary = await call(null, { resource: 'exam_catalog', view: 'summary', category, grade: '11' });
  assert.equal(summary.code, 200); assert.equal(summary.body.items.length, 1);
  assert.equal(summary.body.items[0].grade, 11);
  assert.equal(summary.body.items[0].problemCount, 1);
  assert.equal((await call(null, { resource: 'exam_catalog', view: 'summary', category, grade: '12' })).code, 400);
  role = 'student';
  assert.equal((await call(payload(10))).code, 403, 'Students cannot create exams');
  role = 'admin';
}
assert.equal(stores.get('exams').length, 4);
assert.equal(stores.get('content_sets').length, 4);
assert.equal(stores.get('problems').length, 4);

// University course identity, question metadata, summaries and education-level boundaries.
assert.equal(UNIVERSITY_COURSES.length,10);
for(const course of UNIVERSITY_COURSES) {
 const book=JSON.parse(fs.readFileSync(new URL(`../data/university-materials/${course.id}.json`,import.meta.url)));
 assert.deepEqual(course.sections.map(({id,title})=>({id,title})),book.sections.map(({id,title})=>({id,title})));
 assert.equal(course.sections.length,8);
 assert.equal(universityExamSection({courseId:course.id,title:`1. ${course.sections[0].title}`})?.id,course.sections[0].id);
 assert.equal(universityExamSection({courseId:course.id,title:'Unknown exam'}),null);
}

const universityResults=[];
for (const course of UNIVERSITY_COURSES) {
 const payload={destination:'university',courseId:course.id,sectionId:course.sections[0].id,province:course.code,year:'2026-2027',dayNumber:1,
  targetAnchor:`university-${course.id}-${course.sections[0].id}-2026-2027`,sourceImageCount:1,questions:[{questionNumber:1,topic:course.nameVi,content:'Prove the stated result.'}]};
 const result=await call(payload);assert.equal(result.code,201);universityResults.push(result.body.item);
 assert.equal(result.body.item.category,'university');assert.equal(result.body.item.courseId,course.id);
 assert.equal(result.body.item.problems[0].educationLevel,'university');assert.equal(result.body.item.problems[0].courseId,course.id);
 assert.equal((await call(payload)).code,409,'Same course/year/paper needs explicit replace confirmation');
 assert.equal((await call({...payload,province:'Forged course'})).code,400);
}
assert.equal(new Set(universityResults.map(exam=>exam.examKey)).size,10,'Courses never overwrite each other');
assert.equal(new Set(universityResults.map(exam=>exam.problems[0].contentKey)).size,10);
assert.equal((await call({destination:'university',courseId:'fake'})).code,400);
role='student';educationLevels=['university'];
let courseSummary=await call(null,{resource:'exam_catalog',category:'university',courseId:'mth-141',view:'summary'});
assert.equal(courseSummary.code,200);assert.equal(courseSummary.body.items.length,1);assert.equal(courseSummary.body.items[0].courseCode,'MTH 141');
assert.equal((await call(null,{resource:'exam_catalog',category:'university',courseId:'fake',view:'summary'})).code,400);
for(const grants of [['upper_secondary'],['lower_secondary'],['primary']]){
 educationLevels=grants;
 assert.equal((await call(null,{resource:'exam_catalog',category:'university',view:'summary'})).body.items.length,0,'Other levels cannot read university exams');
}
educationLevels=['university'];
assert.equal((await call(null,{resource:'exam_catalog',category:'olympic-30-4',view:'summary'})).body.items.length,0,'University alone does not open THPT exams');
role='teacher';educationLevels=['upper_secondary'];
assert.equal((await call({destination:'university',courseId:'mth-141'})).code,403,'A THPT Teacher cannot upload University content');
role='admin';educationLevels=undefined;
const addQuestionRes={code:0,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
await handler({method:'POST',body:{action:'add_exam_question',payload:{examId:String(universityResults[0]._id),questionNumber:2,content:'Compute the derivative.',topic:'Calculus'}}},addQuestionRes);
assert.equal(addQuestionRes.body.item.sectionId,UNIVERSITY_COURSES[0].sections[0].id);assert.equal(addQuestionRes.code,201);assert.equal(addQuestionRes.body.item.courseId,'mth-141');assert.equal(addQuestionRes.body.item.educationLevel,'university');


// Grade pills compose with search, and clearing search retains the grade selection.
const template = fs.readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
const dom = new JSDOM(template, { runScripts: 'outside-only', url: 'https://example.test' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.scrollTo = () => {};
for (const id of ['olympic30', 'duyenhai']) {
  const pane = window.document.createElement('div'); pane.className = 'tab-pane'; pane.id = `tab-${id}`;
  pane.innerHTML = [10,11].map(grade => `<article class="exam-card" data-filter="GRADE${grade}" data-search="Bất đẳng thức Lớp ${grade}">Đề lớp ${grade}</article>`).join('');
  window.document.body.append(pane);
}
window.eval(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
for (const id of ['olympic30', 'duyenhai']) {
  await window.switchTab(`tab-${id}`);
  assert.equal(window.document.getElementById(`sidebar-${id}`).style.display, 'block');
  assert.equal(window.document.getElementById(`sidebar-${id === 'olympic30' ? 'duyenhai' : 'olympic30'}`).style.display, 'none');
  window.document.querySelector(`#${id}FilterPills [data-filter="GRADE11"]`).click();
  const cards = [...window.document.querySelectorAll(`#tab-${id} .exam-card`)];
  assert.equal(cards[0].classList.contains('hidden-by-search'), true);
  assert.equal(cards[1].classList.contains('hidden-by-search'), false);
  const input = window.document.getElementById('searchInput');
  input.value = 'Bất đẳng thức'; input.dispatchEvent(new window.Event('input'));
  assert.equal(cards[0].classList.contains('hidden-by-search'), true);
  input.value = ''; input.dispatchEvent(new window.Event('input'));
  assert.equal(cards[0].classList.contains('hidden-by-search'), true);
  window.document.querySelector(`#${id}FilterPills [data-filter="ALL"]`).click();
  assert.ok(cards.every(card => !card.classList.contains('hidden-by-search')));
}
// All ten University banks share the proven lazy exam renderer and question actions.
window.CSS ||= {};window.CSS.escape ||= value=>String(value);
window.VMOAuth={getSession:()=>({role:'admin',username:'tester'})};window.alert=()=>{};
window.fetch=async url=>({ok:true,json:async()=>({success:true,item:await universityCatalog(db,{role:'admin'})})});
window.VMODataService={
 getExamCatalog:async()=>[],
 getExamCatalogSummary:async category=>category==='university'?universityResults.map(({problems,...exam})=>({...exam,id:String(exam._id),problemCount:1})):[],
 getExamCatalogDetail:async(category,anchor)=>universityResults.filter(exam=>exam.targetAnchor===anchor),
 getCatalogProblems:async()=>[],getContentSets:async()=>[],getEvents:async()=>[],getDocuments:async()=>[],getExams:async()=>[]
};
window.eval(fs.readFileSync(new URL('../university_courses.js',import.meta.url),'utf8'));
window.eval(fs.readFileSync(new URL('../university.js',import.meta.url),'utf8'));
window.eval(fs.readFileSync(new URL('../vmo_db_ui.js',import.meta.url),'utf8'));
window.eval(fs.readFileSync(new URL('../ai_guide_engine.js',import.meta.url),'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await window.switchTab('tab-university');
await window.loadDatabaseCompetitionExams('tab-university');
assert.equal(window.document.querySelectorAll('#universityCourseSelect option').length,10);
assert.equal(window.document.querySelectorAll('#universityCourseList .university-course-button').length,10);
assert.equal(window.document.querySelectorAll('#tab-university .exam-card').length,10);
for(const course of UNIVERSITY_COURSES){
 window.selectUniversityCourse(course.id);
 assert.equal(window.document.getElementById('universitySectionSelect').options.length,10);
 assert.equal(window.document.querySelectorAll('#universitySectionList button').length,10);
 for(const section of course.sections) {
  window.selectUniversitySection(section.id);
  const cards=[...window.document.querySelectorAll('#tab-university .exam-card')].filter(card=>!card.classList.contains('hidden-by-search'));
  assert.equal(cards.length,section===course.sections[0]?1:0);
  assert.equal(window.document.getElementById('universitySectionSelect').value,section.id);
 }
 window.selectUniversitySection('');
 const visible=[...window.document.querySelectorAll('#tab-university .exam-card')].filter(card=>!card.classList.contains('hidden-by-search'));
 assert.equal(visible.length,1);assert.equal(visible[0].dataset.courseId,course.id);
 await window.loadDatabaseExamDetail('university',visible[0].id);
 assert.ok(visible[0].querySelector('.problem-item'));assert.ok(visible[0].textContent.includes('Ngày thi thứ nhất'));assert.ok(!visible[0].textContent.includes('Đề số 1'));
 assert.ok(visible[0].querySelector('.btn-submit-solution'),'Standard submission action is retained');
 assert.equal(window.document.querySelectorAll('#universityExamLinks a:not([hidden])').length,1);
}
window.openDataHubModal();
window.document.getElementById('docDestination').value='university';window.syncDocumentDestination();
assert.equal(window.document.getElementById('docCourseId').options.length,10);
assert.equal(window.document.getElementById('docProvince').value,'MTH 141');
assert.equal(window.document.getElementById('docCourseWrap').style.display,'block');
for(const course of UNIVERSITY_COURSES) {
 window.document.getElementById('docCourseId').value=course.id;window.syncDocumentDestination(true);
 const options=[...window.document.getElementById('docSectionId').options].slice(1);
 assert.deepEqual(options.map(o=>o.value),course.sections.map(section=>section.id));
 assert.deepEqual(options.map(o=>o.textContent),course.sections.map(section=>`${section.number}. ${section.title}`));
 window.document.getElementById('docSectionId').value=course.sections[0].id;window.syncDocumentDestination();
 assert.equal(window.document.getElementById('docSectionId').value,course.sections[0].id,'Same-course sync preserves selection');
}
window.document.getElementById('docDestination').value='tst';window.syncDocumentDestination();
assert.equal(window.document.getElementById('docSectionId').required,false);assert.equal(window.document.getElementById('docSectionId').disabled,true);
window.document.getElementById('docDestination').value='university';window.syncDocumentDestination();
assert.equal(window.document.getElementById('docSectionId').required,true);assert.equal(window.document.getElementById('docSectionId').disabled,false);
window.switchHubTab('docs');await new Promise(resolve=>window.setTimeout(resolve,0));
assert.equal(window.document.querySelectorAll('#hubDocsList .hub-managed-exam').length,10);
// Exercise every section through the real create route, plus multi-day identity.
role='admin';educationLevels=['university'];
const allSectionExams=[];
for(const course of UNIVERSITY_COURSES)for(const section of course.sections) {
 const payload={destination:'university',courseId:course.id,sectionId:section.id,province:course.code,year:'2027-2028',dayNumber:1,
 targetAnchor:`university-${course.id}-${section.id}-2027-2028`,sourceImageCount:1,questions:[{questionNumber:1,content:'Compute $1+1$.'}]};
 const res=await call(payload);assert.equal(res.code,201);allSectionExams.push(res.body.item);
 assert.equal(res.body.item.sectionTitle,section.title);assert.equal(res.body.item.problems[0].sectionId,section.id);
 assert.equal(stores.get('content_sets').find(set=>String(set._id)===String(res.body.item.problems[0].setId)).sectionId,section.id);
 assert.equal((await call({...payload,sectionId:undefined})).code,400);
 assert.equal((await call({...payload,sectionId:'forged'})).code,400);
 assert.equal((await call({...payload,targetAnchor:`university-${course.id}-2027-2028`})).code,400);
}
assert.equal(new Set(allSectionExams.map(exam=>exam.examKey)).size,80);
assert.equal(new Set(allSectionExams.map(exam=>exam.problems[0].contentKey)).size,80);
const firstCourse=UNIVERSITY_COURSES[0], firstSection=firstCourse.sections[0];
const secondDay=await call({destination:'university',courseId:firstCourse.id,sectionId:firstSection.id,province:firstCourse.code,year:'2026-2027',dayNumber:2,
 targetAnchor:universityResults[0].targetAnchor,sourceImageCount:1,questions:[{questionNumber:1,content:'Day 2 $2+2$.'}]});
assert.equal(secondDay.code,201);assert.notEqual(secondDay.body.item.problems[0].contentKey,universityResults[0].problems[0].contentKey);
universityResults.push(secondDay.body.item);
await window.loadDatabaseCompetitionExams('tab-university',true);window.selectUniversityCourse(firstCourse.id,firstSection.id);
await window.loadDatabaseExamDetail('university',universityResults[0].targetAnchor);
const firstCard=window.document.getElementById(universityResults[0].targetAnchor);
assert.ok(firstCard.textContent.includes('Ngày thi thứ nhất'));assert.ok(firstCard.textContent.includes('Ngày thi thứ hai'));
assert.equal(firstCard.querySelectorAll('.db-exam-day').length,2);
const summary=await call(null,{resource:'exam_catalog',category:'university',courseId:firstCourse.id,sectionId:firstSection.id,view:'summary'});
assert.ok(summary.body.items.every(exam=>exam.sectionId===firstSection.id));
assert.equal((await call(null,{resource:'exam_catalog',category:'university',courseId:firstCourse.id,sectionId:'forged',view:'summary'})).code,400);
// Legacy rows retain their identity and are only classified by an exact known title.
const legacy={...universityResults[0],_id:new ObjectId(),targetAnchor:'university-legacy',examKey:'legacy',sectionId:undefined,title:`1. ${firstSection.title}`};
universityResults.push(legacy,{...legacy,_id:new ObjectId(),targetAnchor:'university-unknown',examKey:'unknown',title:'Unmapped legacy exam'});
await window.loadDatabaseCompetitionExams('tab-university',true);window.selectUniversityCourse(firstCourse.id,firstSection.id);
assert.equal(window.document.getElementById('university-legacy').classList.contains('hidden-by-search'),false);
assert.equal(window.document.getElementById('university-unknown').classList.contains('hidden-by-search'),true);
window.selectUniversitySection('unclassified');assert.equal(window.document.getElementById('university-unknown').classList.contains('hidden-by-search'),false);
window.selectUniversitySection(firstSection.id);
window.VMODataService.searchExamCatalog=async()=>universityResults;
const search=window.document.getElementById('searchInput');search.value='Prove';search.dispatchEvent(new window.Event('input'));
await new Promise(resolve=>window.setTimeout(resolve,350));
assert.equal(window.document.getElementById('university-unknown').classList.contains('hidden-by-search'),true,'Server search must retain topic scope');
search.value='';search.dispatchEvent(new window.Event('input'));
assert.equal(window.document.getElementById('university-unknown').classList.contains('hidden-by-search'),true,'Clearing search must retain topic scope');
// OCR request -> editor -> real save route: course/section/day survive the full UI flow.
const documentNode=window.document;
documentNode.getElementById('docDestination').value='university';documentNode.getElementById('docCourseId').value=firstCourse.id;window.syncDocumentDestination(true);
documentNode.getElementById('docSectionId').value=firstCourse.sections[1].id;
documentNode.getElementById('docQuestionCount').value='1';documentNode.getElementById('docYear').value='2028-2029';documentNode.getElementById('docDayNumber').value='2';
window.Image=class {constructor(){this.width=20;this.height=20;}set src(value){queueMicrotask(()=>this.onload());}};
window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AAAA';
Object.defineProperty(documentNode.getElementById('docImages'),'files',{configurable:true,value:[new window.File(['image'],'exam.png',{type:'image/png'})]});
let ocrRequest;
window.fetch=async(url,options)=>{ocrRequest=JSON.parse(options.body);return{ok:true,json:async()=>({success:true,data:{questions:[{questionNumber:1,content:'Compute $3+4$.',topic:'Limits',maxScore:5}],confidence:'high'}})};};
await window.runExamOcr('doc');
assert.equal(ocrRequest.courseId,firstCourse.id);assert.equal(ocrRequest.sectionId,firstCourse.sections[1].id);assert.equal(ocrRequest.dayNumber,2);
assert.equal(documentNode.querySelectorAll('#docOcrPreview .exam-ocr-question').length,1);
let savePayload;
window.VMODataService.createExamFromOcr=async payload=>{savePayload=payload;const result=await call(payload);assert.equal(result.code,201);universityResults.push(result.body.item);return result.body.item;};
window.VMODataService.saveExamImages=async()=>{};
await window.handleCreateDocument({preventDefault(){},target:documentNode.getElementById('formAddDoc')});
assert.equal(savePayload.sectionId,firstCourse.sections[1].id);assert.equal(savePayload.dayNumber,2);
assert.equal(savePayload.targetAnchor,`university-${firstCourse.id}-${firstCourse.sections[1].id}-2028-2029`);
assert.equal(window.currentUniversitySection,firstCourse.sections[1].id);
assert.ok(documentNode.getElementById(savePayload.targetAnchor),'Saved exam is reloaded into the university catalog');
// An OCR response for a previous selection must not repopulate the edited course/topic.
documentNode.getElementById('docDestination').value='university';documentNode.getElementById('docCourseId').value=firstCourse.id;window.syncDocumentDestination(true);documentNode.getElementById('docSectionId').value=firstSection.id;
let finishOcr, startedOcr;
const started=new Promise(resolve=>startedOcr=resolve);
window.fetch=async()=>{startedOcr();return new Promise(resolve=>finishOcr=resolve);};
const pendingOcr=window.runExamOcr('doc');await started;
documentNode.getElementById('docCourseId').value=UNIVERSITY_COURSES[1].id;window.syncDocumentDestination(true);
finishOcr({ok:true,json:async()=>({success:true,data:{questions:[{questionNumber:1,content:'Stale question'}]}})});await pendingOcr;
assert.equal(documentNode.querySelectorAll('#docOcrPreview .exam-ocr-question').length,0);
assert.equal(documentNode.getElementById('docSaveButton').disabled,true);
// Real OCR handler validates whitelist before model invocation, and includes the topic in its prompt.
let modelCalls=0,prompt='';
const ocrSource=fs.readFileSync(new URL('../api/ai-ocr-exam.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
const ocrHandler=new Function('resolveUniversityCourse','UNIVERSITY_MAX_DAYS','UNIVERSITY_MAX_QUESTIONS','getDb','universityCourse','universitySection','allows','getSession','checkRateLimit','parseBody','prepare','text','generateJson','handleAiError',`${ocrSource}\nreturn handler;`)(resolveUniversityCourse,UNIVERSITY_MAX_DAYS,UNIVERSITY_MAX_QUESTIONS,async()=>db,universityCourse,universitySection,allows,async()=>({role:'teacher',username:'uni-teacher',educationLevels:['university']}),()=>true,req=>req.body,()=>{},(value,max)=>String(value||'').slice(0,max),async options=>{modelCalls++;prompt=JSON.stringify(options);return{model:'mock',data:{questions:[{questionNumber:1,content:'$1+1$'}]}};},(res,error)=>{throw error;});
async function ocrCall(sectionId){const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await ocrHandler({method:'POST',body:{destination:'university',courseId:firstCourse.id,sectionId,image:'data:image/png;base64,AAAA'}},res);return res;}
assert.equal((await ocrCall('forged')).code,400);assert.equal((await ocrCall(undefined)).code,400);assert.equal(modelCalls,0);
assert.equal((await ocrCall(firstSection.id)).code,200);assert.equal(modelCalls,1);assert.ok(prompt.includes(firstSection.title));

// Persistent catalog changes, authorization, count validation and days beyond four.
const admin={role:'admin',username:'tester'},teacher={role:'teacher',username:'teacher',educationLevels:['university']};
for(const account of [{role:'student',educationLevels:['university']},{...teacher,educationLevels:['upper_secondary']}])
 await assert.rejects(()=>addUniversityCatalogItem(db,account,{kind:'course',code:'NEW 101',nameVi:'Học phần mới'}),e=>e.status===403);
const added=await addUniversityCatalogItem(db,teacher,{kind:'course',code:'NEW 101',nameVi:'Toán ứng dụng bổ sung'});
assert.equal(added.catalog.courses.length,11);
await assert.rejects(()=>addUniversityCatalogItem(db,admin,{kind:'course',code:'new 101',nameVi:'Duplicate'}),e=>e.status===409);
const topic=await addUniversityCatalogItem(db,teacher,{kind:'section',courseId:added.courseId,title:'Mô hình ứng dụng'});
await assert.rejects(()=>addUniversityCatalogItem(db,admin,{kind:'section',courseId:added.courseId,title:'Mô hình ứng dụng'}),e=>e.status===409);
await assert.rejects(()=>addUniversityCatalogItem(db,admin,{kind:'section',courseId:'forged',title:'No parent'}),e=>e.status===400);
const reloaded=await resolveUniversityCourse(db,added.courseId);assert.equal(reloaded.sections[0].id,topic.sectionId);
const extended={destination:'university',courseId:added.courseId,sectionId:topic.sectionId,province:'NEW 101',year:'2031-2032',dayNumber:5,
 targetAnchor:`university-${added.courseId}-${topic.sectionId}-2031-2032`,sourceImageCount:1,questionCount:120,region:'OTHER',regionName:'Quốc tế',status:'draft',
 questions:Array.from({length:120},(_,i)=>({questionNumber:i+1,content:`Compute $${i}+1$.`}))};
role='admin';educationLevels=undefined;
const extendedResult=await call(extended);assert.equal(extendedResult.code,201);assert.equal(extendedResult.body.item.problems.length,120);
assert.equal(problemBulkWriteSizes.at(-1),120,'OCR questions are upserted in one bulk database operation');
assert.equal(extendedResult.body.item.region,'OTHER');assert.equal(extendedResult.body.item.regionName,'Quốc tế');assert.equal(extendedResult.body.item.status,'draft');
assert.match(extendedResult.body.item.problems.at(-1).contentKey,/question-120$/);
for(const dayNumber of [6,999]){const res=await call({...extended,dayNumber});assert.equal(res.code,201);assert.notEqual(res.body.item.examKey,extendedResult.body.item.examKey);}
const before=stores.get('exams').length;
for(const patch of [{dayNumber:1000},{dayNumber:1.5},{questionCount:121},{questionCount:0},{questionCount:1001},
 {questions:extended.questions.map((q,i)=>i===2?{...q,content:''}:q)},
 {questions:extended.questions.map((q,i)=>i===2?{...q,questionNumber:1}:q)},
 {questions:extended.questions.map((q,i)=>i===2?{...q,questionNumber:1001}:q)}])assert.equal((await call({...extended,dayNumber:7,...patch})).code,400);
assert.equal(stores.get('exams').length,before,'All invalid requests fail before writing');
for(const region of ['BAC','TRUNG','NAM'])assert.equal((await call({...extended,dayNumber:8+['BAC','TRUNG','NAM'].indexOf(region),region})).body.item.region,region);
// UI catalogs update immediately, selected custom section persists, day/region controls work.
window.applyUniversityCatalog(topic.catalog);
documentNode.getElementById('docCourseId').value=added.courseId;window.syncDocumentDestination(true);
documentNode.getElementById('docSectionId').value=topic.sectionId;window.syncDocumentDestination();
assert.equal(documentNode.getElementById('docSectionId').value,topic.sectionId);assert.equal(documentNode.getElementById('docProvince').value,'NEW 101');
window.addUniversityExamDay();assert.equal(documentNode.getElementById('docDayNumber').selectedOptions[0].textContent,'Ngày thi thứ năm');
window.addUniversityExamDay();assert.equal(documentNode.getElementById('docDayNumber').value,'6');
documentNode.getElementById('docUniversityRegion').value='OTHER';window.syncUniversityRegion();assert.equal(documentNode.getElementById('docRegion').value,'OTHER');assert.equal(documentNode.getElementById('docRegionName').disabled,false);
documentNode.getElementById('docUniversityRegion').value='TRUNG';window.syncUniversityRegion();assert.equal(documentNode.getElementById('docRegion').value,'TRUNG');assert.equal(documentNode.getElementById('docRegionName').disabled,true);
const mathPreview=documentNode.createElement('div');
const tex=String.raw`Điều kiện $x\neq1$, $x\notin A$, $\nu+\nabla f$.`;
window.safeRenderMathJaxToElement(mathPreview,tex);assert.equal(mathPreview.textContent,tex);
// Exercise the real modal save path, including server error preservation.
const previousFetch=window.fetch;let rejectCatalog=true;
window.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.action,'add_university_catalog_item');
 if(rejectCatalog)return{ok:false,json:async()=>({success:false,error:'Thử lại sau'})};
 const item=await addUniversityCatalogItem(db,admin,body.payload);return{ok:true,json:async()=>({success:true,item})};};
await window.openUniversityCatalogEditor('section');
const catalogModal=documentNode.getElementById('universityCatalogEditor'),catalogForm=catalogModal.querySelector('form');
catalogForm.elements.title.value='Chuyên đề thêm từ form';
await catalogForm.onsubmit({preventDefault(){}});assert.ok(catalogModal.textContent.includes('Thử lại sau'));assert.equal(catalogForm.elements.title.value,'Chuyên đề thêm từ form');
rejectCatalog=false;await catalogForm.onsubmit({preventDefault(){}});
assert.equal(documentNode.getElementById('universityCatalogEditor'),null);
assert.equal(documentNode.getElementById('docSectionId').selectedOptions[0].textContent,'2. Chuyên đề thêm từ form');window.fetch=previousFetch;
// Custom sections are also available to materials without inventing examples.
const {getUniversityMaterials,universityMaterialCatalog}=await import('../lib/university-materials.js');
const customMaterials=await getUniversityMaterials(db,teacher,added.courseId);
assert.equal(customMaterials.book.sections[0].id,topic.sectionId);assert.equal(customMaterials.problems.length,0);assert.equal(customMaterials.book.sections[0].examples.length,0);
assert.equal((await universityMaterialCatalog(db,teacher)).courses.length,11);


// Changing an existing exam's section preserves all identities and follows the current catalog.
const editTarget=universityResults[0],editId=String(editTarget._id),editCourse=UNIVERSITY_COURSES[0];
async function editCall(patch={}) {
 const res={code:0,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'POST',body:{action:'update_exam',payload:{id:editId,title:editTarget.title,year:editTarget.year,duration:90,examDate:'',...patch}}},res);return res;
}
const oldIdentity={examKey:editTarget.examKey,setKey:editTarget.setKey,targetAnchor:editTarget.targetAnchor};
const originalProblem=stores.get('problems').find(p=>p.examId===editId),originalKey=originalProblem.contentKey,originalId=String(originalProblem._id);
for(const sectionId of ['', 'forged', UNIVERSITY_COURSES[1].sections.find(s=>!editCourse.sections.some(t=>t.id===s.id)).id])assert.equal((await editCall({sectionId})).code,400);
assert.equal(stores.get('exams').find(e=>String(e._id)===editId).sectionId,editCourse.sections[0].id);
role='student';educationLevels=['university'];assert.equal((await editCall({sectionId:editCourse.sections[1].id})).code,403);
role='teacher';educationLevels=['upper_secondary'];assert.equal((await editCall({sectionId:editCourse.sections[1].id})).code,404);
role='teacher';educationLevels=['university'];
const moved=await editCall({sectionId:editCourse.sections[1].id});assert.equal(moved.code,200);
for(const [key,value]of Object.entries(oldIdentity))assert.equal(moved.body.item[key],value);
for(const row of stores.get('problems').filter(p=>p.examId===editId)){assert.equal(row.sectionId,editCourse.sections[1].id);assert.equal(row.sectionNumber,2);}
assert.equal(originalProblem.contentKey,originalKey);assert.equal(String(originalProblem._id),originalId);
assert.equal(stores.get('content_sets').find(s=>s.key===oldIdentity.setKey).sectionId,editCourse.sections[1].id);
// Older clients that only edit title/date do not accidentally clear the section.
assert.equal((await editCall({title:'Updated existing title'})).code,200);assert.equal(originalProblem.sectionId,editCourse.sections[1].id);
role='admin';educationLevels=undefined;
Object.assign(editTarget,stores.get('exams').find(e=>String(e._id)===editId));
window.fetch=async()=>({ok:true,json:async()=>({success:true,item:await universityCatalog(db,admin)})});
window.VMODataService.updateExam=async(id,fields)=>{assert.equal(id,editId);const res=await editCall(fields);if(res.code!==200)throw new Error(res.body.error);Object.assign(editTarget,res.body.item);return res.body.item;};
window.switchHubTab('docs');await new Promise(resolve=>window.setTimeout(resolve,0));
await window.editManagedExam(editId);
const editForm=documentNode.getElementById('managedExamEditor');assert.ok(editForm);
assert.equal(editForm.elements.sectionId.options.length,editCourse.sections.length+1);
assert.equal(editForm.elements.sectionId.value,editCourse.sections[1].id);
editForm.elements.sectionId.value=editCourse.sections[2].id;
let failEdit=true;const saveEdit=window.VMODataService.updateExam;
window.VMODataService.updateExam=async(...args)=>{if(failEdit)throw Error('Temporary failure');return saveEdit(...args);};
await editForm.onsubmit({preventDefault(){}});assert.equal(editForm.isConnected,true);assert.equal(editForm.elements.sectionId.value,editCourse.sections[2].id);
failEdit=false;await editForm.onsubmit({preventDefault(){}});assert.equal(editForm.isConnected,false);assert.equal(originalProblem.sectionId,editCourse.sections[2].id);assert.equal(window.currentUniversitySection,editCourse.sections[2].id);

// Legacy multi-day anchors can now contain days assigned to different sections.
await window.loadDatabaseCompetitionExams('tab-university',true);
await window.loadDatabaseExamDetail('university',editTarget.targetAnchor);
window.selectUniversityCourse(editCourse.id,editCourse.sections[2].id);
const mixedCard=documentNode.getElementById(editTarget.targetAnchor);assert.equal(mixedCard.classList.contains('hidden-by-search'),false);
assert.ok([...mixedCard.querySelectorAll('.db-exam-day')].some(day=>!day.hidden&&day.dataset.sectionId===editCourse.sections[2].id));
assert.ok([...mixedCard.querySelectorAll('.db-exam-day')].filter(day=>day.dataset.sectionId!==editCourse.sections[2].id).every(day=>day.hidden));
window.selectUniversitySection(editCourse.sections[0].id);assert.equal(mixedCard.classList.contains('hidden-by-search'),false);
assert.ok([...mixedCard.querySelectorAll('.db-exam-day')].some(day=>!day.hidden&&day.dataset.sectionId===editCourse.sections[0].id));

// Full university metadata editing: dependent course/section, numbered day and title.
await window.editManagedExam(editId);
const fullEdit=documentNode.getElementById('managedExamEditor');assert.equal(fullEdit.elements.courseId.value,editCourse.id);
assert.ok(fullEdit.textContent.includes('Mã học phần *'));assert.ok(fullEdit.textContent.includes('Tên đề thi *'));
const destinationCourse=UNIVERSITY_COURSES[1];
fullEdit.elements.courseId.value=destinationCourse.id;fullEdit.elements.courseId.dispatchEvent(new window.Event('change'));
assert.equal(fullEdit.elements.sectionId.value,'');assert.equal(fullEdit.elements.sectionId.options.length,destinationCourse.sections.length+1);
fullEdit.elements.sectionId.value=destinationCourse.sections[0].id;
fullEdit.querySelector('.managed-add-day').click();fullEdit.querySelector('.managed-add-day').click();
assert.equal(fullEdit.elements.dayNumber.value,'6');assert.equal(fullEdit.elements.dayNumber.selectedOptions[0].textContent,'Ngày thi thứ sáu');
fullEdit.elements.title.value='Đề Giải tích 2 đã chuyển';await fullEdit.onsubmit({preventDefault(){}});
assert.equal(fullEdit.isConnected,false);assert.equal(editTarget.courseId,destinationCourse.id);assert.equal(editTarget.dayNumber,6);assert.equal(editTarget.title,'Đề Giải tích 2 đã chuyển');
for(const row of stores.get('problems').filter(p=>p.examId===editId)){assert.equal(row.courseId,destinationCourse.id);assert.equal(row.dayNumber,6);assert.equal(row.province,destinationCourse.code);assert.equal(row.setTitle,editTarget.title);}
const updatedSet=stores.get('content_sets').find(s=>s.key===oldIdentity.setKey);assert.equal(updatedSet.courseId,destinationCourse.id);assert.equal(updatedSet.dayNumber,6);
for(const [key,value] of Object.entries(oldIdentity))assert.equal(editTarget[key],value);
assert.equal(originalProblem.contentKey,originalKey);assert.equal(window.currentUniversityCourse,destinationCourse.id);
for(const patch of [{dayNumber:0},{dayNumber:1.5},{dayNumber:1000},{courseId:'forged'},{courseId:editCourse.id,sectionId:'forged'}])assert.equal((await editCall({...patch,sectionId:patch.sectionId||destinationCourse.sections[0].id})).code,400);
assert.equal((await editCall({courseId:destinationCourse.id,sectionId:destinationCourse.sections[0].id,dayNumber:1})).code,409,'Occupied day is not overwritten');
assert.equal(stores.get('exams').find(e=>String(e._id)===editId).dayNumber,6);
assert.equal((await call({destination:'university',courseId:destinationCourse.id,sectionId:destinationCourse.sections[0].id,province:destinationCourse.code,year:editTarget.year,dayNumber:6,targetAnchor:`university-${destinationCourse.id}-${destinationCourse.sections[0].id}-${editTarget.year}`,sourceImageCount:1,questions:[{questionNumber:1,content:'New exam'}]})).code,409,'New upload cannot overwrite a relocated exam through a different key');
await window.loadDatabaseCompetitionExams('tab-university',true);await window.loadDatabaseExamDetail('university',editTarget.targetAnchor);
window.selectUniversityCourse(destinationCourse.id,destinationCourse.sections[0].id);
const relocated=documentNode.getElementById(editTarget.targetAnchor);assert.equal(relocated.classList.contains('hidden-by-search'),false);
assert.ok([...relocated.querySelectorAll('.db-exam-day')].some(day=>!day.hidden&&day.dataset.courseId===destinationCourse.id));
window.selectUniversityCourse(editCourse.id,editCourse.sections[0].id);assert.equal(relocated.classList.contains('hidden-by-search'),false);
assert.ok([...relocated.querySelectorAll('.db-exam-day')].filter(day=>day.dataset.courseId!==editCourse.id).every(day=>day.hidden));

window.close();
console.log('Grade and ten University catalogs: identities, authorization, lazy questions, course filters and OCR form: OK');
