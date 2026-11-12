import { universityCatalog, resolveUniversityCourse } from './university-catalog.js';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { universityCourse, UNIVERSITY_COURSES } from './university-courses.js';
import { allows } from './education-access.js';
const cache = new Map();
const identity = key => new ObjectId(crypto.createHash('sha256').update(key).digest('hex').slice(0,24));
async function insertOnly(collection,key,doc) {
  const _id=identity(key);
  try { return await collection.findOneAndUpdate({_id},{$setOnInsert:{...doc,_id}},{upsert:true,returnDocument:'after'}); }
  catch(error) { if(error.code!==11000)throw error;const existing=await collection.findOne({_id});if(!existing)throw error;return existing; }
}
const load = async id => {
  if (!cache.has(id)) cache.set(id, JSON.parse(await readFile(new URL(`../data/university-materials/${id}.json`,import.meta.url),'utf8')));
  return cache.get(id);
};
export async function universityMaterialCatalog(db,session={role:'admin'}) {
  const registry=db?(await universityCatalog(db,session)).courses:UNIVERSITY_COURSES;
  const courses=await Promise.all(registry.map(async course=>{const book=universityCourse(course.id)?await load(course.id):{sections:[]};return {...course,sectionCount:course.sections.length,exampleCount:book.sections.reduce((n,s)=>n+s.examples.length,0)};}));
  return {courses,sources:await load('sources')};
}
function solution(example) {
  return example.steps.map((step,i)=>`Bước ${i+1}. ${step}`).join('\n\n')+`\n\nKết luận: ${example.result}\n\nGiải thích: ${example.insight}`;
}
// Install only immutable, reviewed curriculum shipped in the release. The request may
// choose a whitelisted course, never arbitrary text. $setOnInsert preserves admin edits.
async function ensureCourse(db, course, book) {
  const blockKey=`university-materials:${book.revision}:${course.id}`;
  const existing=await db.collection('content_blocks').findOne({blockKey});
  if(existing)return existing;
  const now=new Date(), setKey=`university-materials:${course.id}`;
  const metadata={educationLevel:'university',courseId:course.id,courseCode:course.code,courseName:course.name};
  const set=await insertOnly(db.collection('content_sets'),setKey,{...metadata,key:setKey,group:'university_materials',contentType:'university_materials',title:`${course.code}: ${course.nameVi}`,status:'published',createdAt:now});
  const examples=book.sections.flatMap((section,sectionIndex)=>section.examples.map((example,index)=>({
    ...metadata,contentKey:`${setKey}:${section.id}:example-${index+1}`,setKey,setId:set._id,setTitle:`${course.code}: ${course.nameVi}`,
    sourceGroup:'university_materials',sourceType:'university_material_example',contentType:'university_materials',
    questionNumber:sectionIndex*5+index+1,orderNumber:sectionIndex*5+index+1,order:sectionIndex*5+index+1,title:`${sectionIndex+1}.${index+1}. ${section.title}`,shortLabel:`Ví dụ ${sectionIndex+1}.${index+1}`,topic:section.title,
    content:example.statement,referenceSolution:solution(example),referenceSolutionVerified:false,referenceLinks:[],
    materialSectionId:section.id,materialExampleNumber:index+1,materialRevision:book.revision,
    maxScore:5,version:1,status:'published',allowSubmission:true,allowAiEvaluation:true,createdAt:now,updatedAt:now
  })));
  for(let i=0;i<examples.length;i+=5)await Promise.all(examples.slice(i,i+5).map(doc=>insertOnly(db.collection('problems'),doc.contentKey,doc)));
  return insertOnly(db.collection('content_blocks'),blockKey,{...metadata,blockKey,group:'university_materials',status:'published',setKey,book,createdAt:now});
}
export async function getUniversityMaterials(db,session,courseId) {
  if(!allows(session,'university'))throw Object.assign(new Error('Tài liệu thuộc cấp Đại học'),{code:'EDUCATION_ACCESS_DENIED'});
  const course=await resolveUniversityCourse(db,courseId);if(!course)throw Object.assign(new Error('Học phần không hợp lệ'),{code:'INVALID_COURSE'});
  const book=universityCourse(course.id)?await load(course.id):{revision:"custom-1",courseId:course.id,prerequisites:[],outcomes:[],sections:[]};
  const block=await ensureCourse(db,course,book);
  const set=await db.collection('content_sets').findOne({key:block.setKey});
  if(block.status!=='published'||set?.status!=='published')throw Object.assign(new Error('Học liệu chưa được công khai'),{code:'EDUCATION_ACCESS_DENIED'});
  const problems=await db.collection('problems').find({setKey:block.setKey,status:'published'}).toArray();
  const sections=course.sections.map(s=>block.book.sections.find(old=>old.id===s.id)||{...s,theory:['Chưa có học liệu được biên soạn cho chuyên đề này.'],method:[],pitfalls:[],examples:[],references:[]});
  const currentBook={...block.book,sections};
  return {course,book:currentBook,problems,theories:await courseTheories(db,course.id,currentBook)};
}

function theoryView({revisions,...record}) { return record; }
function failure(message,status=400) { return Object.assign(new Error(message),{status}); }
async function theoryDefaults(courseId,section) {
  const citations=await load('citations');
  return {blockKey:`university-theory:${courseId}:${section.id}`,group:'university_materials',
    educationLevel:'university',courseId,materialSectionId:section.id,title:section.title,
    theory:section.theory,references:citations[courseId]?.[section.id]||[],version:1,status:'published'};
}
async function courseTheories(db,courseId,book) {
  return Promise.all(book.sections.map(async section=>{
    const doc=await theoryDefaults(courseId,section);
    return theoryView(await insertOnly(db.collection('content_blocks'),doc.blockKey,{...doc,createdAt:new Date()}));
  }));
}
export async function updateUniversityTheory(db,session,payload) {
  payload ||= {};
  if(!['admin','teacher'].includes(session?.role)||!allows(session,'university'))throw failure('Chỉ Admin hoặc Giáo viên được phân cấp Đại học được chỉnh sửa.',403);
  const course=await resolveUniversityCourse(db,payload.courseId);if(!course)throw failure('Học phần không hợp lệ');
  const data=await getUniversityMaterials(db,session,course.id);
  const current=data.theories.find(item=>item.materialSectionId===payload.sectionId);
  if(!current||current.status!=='published')throw failure('Không tìm thấy phần lý thuyết',404);
  if(!Number.isInteger(payload.expectedVersion)||payload.expectedVersion!==current.version)throw failure('Nội dung đã thay đổi. Hãy tải lại trước khi lưu.',409);
  if(typeof payload.theory!=='string'||!payload.theory.trim()||payload.theory.length>50000)throw failure('Nội dung lý thuyết không hợp lệ');
  const sources=(await universityMaterialCatalog()).sources;
  if(!Array.isArray(payload.references)||!payload.references.length||payload.references.length>12)throw failure('Cần từ 1 đến 12 tham chiếu PDF');
  const references=payload.references.map(ref=>{
    if(!ref||typeof ref!=='object')throw failure('Tham chiếu PDF không hợp lệ');
    const source=sources.find(item=>item.id===ref.sourceId&&item.pdfUrl);
    if(!source||!Number.isInteger(ref.pdfPage)||ref.pdfPage<1||ref.pdfPage>source.pdfPages)throw failure('Tài liệu hoặc số trang PDF không hợp lệ');
    return {sourceId:source.id,pdfPage:ref.pdfPage,locator:String(ref.locator||'').trim().slice(0,500),printedPage:String(ref.printedPage||'').trim().slice(0,40)};
  });
  const now=new Date(),changes={theory:[payload.theory.trim()],references,version:current.version+1,updatedAt:now,updatedBy:session.username};
  const result=await db.collection('content_blocks').findOneAndUpdate({_id:current._id,version:current.version},
    {$set:changes,$push:{revisions:{$each:[{theory:current.theory,references:current.references,version:current.version,editedAt:now,editedBy:session.username}],$slice:-20}}},{returnDocument:'after'});
  if(!result)throw failure('Nội dung đã thay đổi. Hãy tải lại trước khi lưu.',409);
  return theoryView(result);
}
