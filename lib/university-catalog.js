import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { UNIVERSITY_COURSES } from './university-courses.js';
import { allows } from './education-access.js';
export const UNIVERSITY_MAX_QUESTIONS=1000;
export const UNIVERSITY_MAX_DAYS=999;
const kind='university_catalog';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const slug=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65);
const label=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():'';
function access(session,write=false) {
 if(!allows(session,'university')||(write&&!['admin','teacher'].includes(session?.role)))throw fail('Chỉ Admin hoặc Giáo viên được phân cấp Đại học được thêm danh mục.',403);
}
export async function universityCatalog(db,session) {
 access(session);
 const rows=await db.collection('content_blocks').find({group:'university',contentType:kind,status:'published'}, {projection:{catalogKind:1,courseId:1,sectionId:1,title:1,code:1,name:1,nameVi:1,createdAt:1}}).sort({createdAt:1,_id:1}).limit(10000).toArray();
 const courses=UNIVERSITY_COURSES.map(c=>({...c,sections:c.sections.map(s=>({...s}))}));
 for(const row of rows.filter(r=>r.catalogKind==='course'))if(!courses.some(c=>c.id===row.courseId))courses.push({id:row.courseId,code:row.code,name:row.name,nameVi:row.nameVi,custom:true,sections:[]});
 for(const row of rows.filter(r=>r.catalogKind==='section')) {
  const course=courses.find(c=>c.id===row.courseId);
  if(course&&!course.sections.some(s=>s.id===row.sectionId))course.sections.push({id:row.sectionId,title:row.title,number:course.sections.length+1,custom:true});
 }
 return {courses,maxQuestions:UNIVERSITY_MAX_QUESTIONS,maxDays:UNIVERSITY_MAX_DAYS};
}
export async function resolveUniversityCourse(db,id) {
 if(typeof id!=='string'||!/^[a-z0-9-]{1,90}$/.test(id))return null;
 const catalog=await universityCatalog(db,{role:'admin'});
 return catalog.courses.find(c=>c.id===id)||null;
}
export async function addUniversityCatalogItem(db,session,payload) {
 access(session,true);
 const catalog=await universityCatalog(db,session),type=payload.kind;
 let doc;
 if(type==='course') {
  const code=label(payload.code,50),nameVi=label(payload.nameVi,200),name=label(payload.name,200)||nameVi;
  if(!code||!nameVi||!slug(code))throw fail('Cần mã học phần và tên học phần (tối đa 50/200 ký tự).');
  if(catalog.courses.some(c=>c.code.toLocaleLowerCase('vi')===code.toLocaleLowerCase('vi')))throw fail('Mã học phần đã có trong danh mục.',409);
  if(catalog.courses.length>=500)throw fail('Danh mục đã đạt 500 học phần.');
  doc={catalogKind:'course',courseId:`custom-${slug(code)}`,code,name,nameVi};
 } else if(type==='section') {
  const course=catalog.courses.find(c=>c.id===payload.courseId),title=label(payload.title,200);
  if(!course||!title||!slug(title))throw fail('Cần chọn học phần hợp lệ và nhập tên chuyên đề.');
  if(course.sections.some(s=>s.title.toLocaleLowerCase('vi')===title.toLocaleLowerCase('vi')))throw fail('Chuyên đề đã có trong học phần.',409);
  if(course.sections.length>=200)throw fail('Học phần đã đạt 200 chuyên đề.');
  doc={catalogKind:'section',courseId:course.id,sectionId:`custom-${slug(title)}`,title};
 } else throw fail('Loại danh mục không hợp lệ.');
 const key=`university-catalog:${type}:${doc.courseId}${doc.sectionId?':'+doc.sectionId:''}`;
 const _id=new ObjectId(crypto.createHash('sha256').update(key).digest('hex').slice(0,24));
 const existing=await db.collection('content_blocks').findOne({_id});
 if(existing)throw fail('Danh mục đã tồn tại; vui lòng tải lại danh sách.',409);
 try {await db.collection('content_blocks').findOneAndUpdate({_id},{$setOnInsert:{...doc,blockKey:key,group:'university',educationLevel:'university',contentType:kind,status:'published',createdAt:new Date(),createdBy:session.username}},{upsert:true,returnDocument:'after'});}
 catch(error){if(error.code===11000)throw fail('Danh mục đã tồn tại; vui lòng tải lại.',409);throw error;}
 return {catalog:await universityCatalog(db,session),courseId:doc.courseId,sectionId:doc.sectionId||''};
}
