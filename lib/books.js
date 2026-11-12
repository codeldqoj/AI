import {ObjectId} from 'mongodb';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {allows} from './education-access.js';
const group='university_books';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const id=value=>typeof value==='string'&&/^[a-f0-9]{24}$/i.test(value)?new ObjectId(value):null;
const stable=value=>new ObjectId(crypto.createHash('sha256').update(`books:${value}`).digest('hex').slice(0,24));
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())throw fail('Nội dung thiếu hoặc vượt độ dài cho phép.');return value.trim();};
function access(session,write=false){if(!allows(session,'university')||write&&session.role!=='admin')throw fail(write?'Chỉ Admin được quản lý Sách học.':'Sách học thuộc cấp Đại học.',403);}
const view=({_id,...doc})=>({...doc,id:String(_id)});
let seedPromise;
const imports=new Map(),exerciseCatalogs=new Map();
const sectionFiles=new Map(['1-1','1-2','1-3','1-4','1-5','1-review','1-principles','2-1','2-2','2-3','2-4','2-5','2-6','2-7','2-8','2-review','2-plus'].map(key=>[String(stable(`stewart-9:${key}`)),key]));
async function importSections(db){
 for(const key of sectionFiles.values()){
  if(!imports.has(key))imports.set(key,readFile(new URL(`../data/books/imports/stewart-${key}.json`,import.meta.url),'utf8').then(JSON.parse).catch(e=>{imports.delete(key);throw e;}));
  const entry=await imports.get(key);
  // Fill only untouched published placeholders, preserving all Admin edits and deletions.
  await db.collection('content_blocks').findOneAndUpdate({_id:stable(`stewart-9:${key}`),group,bookType:'section',status:'published',version:1,content:''},
   {$set:{title:entry.title,content:entry.content,contentFormat:entry.contentFormat,sourceInfo:entry.sourceInfo,updatedAt:new Date()},$inc:{version:1}},{returnDocument:'after'});
 }
}
let assetPromise;
export async function readBookAsset(session,key){
 access(session);
 if(typeof key!=='string')throw fail('Hình sách không hợp lệ.',404);
 assetPromise ||= readFile(new URL('../data/books/asset-manifest.json',import.meta.url),'utf8').then(JSON.parse);
 const manifest=await assetPromise;
 if(!Object.hasOwn(manifest,key))throw fail('Không tìm thấy hình sách.',404);
 return{bytes:await readFile(new URL('../data/books/assets/'+manifest[key].file,import.meta.url)),mime:manifest[key].mime};
}
async function seed(db){
 const col=db.collection('content_blocks');
 const marker=stable('seed-stewart-9-v1');
 if(await col.findOne({_id:marker})){await importSections(db);return;}
 const defaults=['Giải tích','Đại số tuyến tính','Toán rời rạc','Xác suất thống kê','Toán học khác'];
 const insert=async(key,doc)=>{const _id=stable(key);try{await col.findOneAndUpdate({_id},{$setOnInsert:{...doc,_id,group,educationLevel:'university',status:'published',version:1,createdAt:new Date()}},{upsert:true,returnDocument:'after'});}catch(e){if(e.code!==11000)throw e;}};
 for(const [order,name]of defaults.entries())await insert(`category-${order}`,{bookType:'category',name,order});
 seedPromise ||= readFile(new URL('../data/books/stewart-9-toc.json',import.meta.url),'utf8').then(JSON.parse).catch(e=>{seedPromise=null;throw e;});
 const data=await seedPromise,bookId=String(stable('stewart-9'));
 await insert('stewart-9',{bookType:'book',categoryId:String(stable('category-0')),title:data.title,authors:data.authors,edition:data.edition,sourceNote:data.sourceNote});
 for(const row of data.sections)await insert(`stewart-9:${row.key}`,{bookType:'section',bookId,parentId:row.parent?String(stable(`stewart-9:${row.parent}`)):'',title:row.title,originalTitle:row.originalTitle,printedPage:row.page,order:row.order,content:''});
 await insert('seed-stewart-9-v1',{bookType:'seed'});
 await importSections(db);
}
async function sectionExercises(db,book,section){
 const key=sectionFiles.get(String(section._id));
 if(!key||section.status!=='published'||!section.content)return [];
 if(!exerciseCatalogs.has(key))exerciseCatalogs.set(key,readFile(new URL(`../data/books/exercises/stewart-${key}.json`,import.meta.url),'utf8').then(JSON.parse).catch(e=>{exerciseCatalogs.delete(key);throw e;}));
 const catalog=await exerciseCatalogs.get(key),setKey=`books:${book._id}:${section._id}`,setId=stable(setKey),now=new Date();
 const insert=async(col,_id,doc)=>{try{return await db.collection(col).findOneAndUpdate({_id},{$setOnInsert:{...doc,_id}},{upsert:true,returnDocument:'after'});}catch(e){if(e.code!==11000)throw e;return db.collection(col).findOne({_id});}};
 const metadata={educationLevel:'university',sourceGroup:group,bookId:String(book._id),bookSectionId:String(section._id),courseName:book.title};
 const set=await insert('content_sets',setId,{...metadata,key:setKey,group,contentType:'book_exercises',title:`${book.title} · ${section.title}`,status:'published',createdAt:now});
 if(set.status!=='published')return [];
 // Stable keys and insert-only initialization preserve source edits, guides and submissions.
 const marker=stable(setKey+':exercises-v1');
 if(!await db.collection('content_blocks').findOne({_id:marker})){
  for(let i=0;i<catalog.exercises.length;i+=8)await Promise.all(catalog.exercises.slice(i,i+8).map(entry=>{
   const contentKey=`${setKey}:exercise-${entry.number}`;
   return insert('problems',stable(contentKey),{...metadata,contentKey,setKey,setId,setTitle:set.title,sourceType:'book_exercise',contentType:'book_exercises',
    questionNumber:entry.number,order:entry.number,title:`Bài tập ${entry.number}`,shortLabel:`Bài tập ${entry.number}`,topic:section.title,content:entry.content,contentFormat:'html-latex',
    referenceSolution:'',referenceSolutionVerified:false,referenceLinks:[],version:1,maxScore:5,status:'published',allowSubmission:true,allowAiEvaluation:true,createdAt:now,updatedAt:now});
  }));
  await insert('content_blocks',marker,{group,educationLevel:'university',bookType:'exercise_seed',status:'published'});
 }
 return (await db.collection('problems').find({setKey,status:'published'}).sort({questionNumber:1}).limit(1000).toArray()).map(view);
}
// Only server-resolved book assets can enter model requests, never arbitrary URLs from the client.
export async function readBookProblemImages(reference,session){
 const images=[];
 for(const key of [...new Set(reference.bookAssetKeys||[])].slice(0,8)){
  const asset=await readBookAsset(session,key);images.push(`data:${asset.mime};base64,${asset.bytes.toString('base64')}`);
 }return images;
}
async function get(col,kind,value,deleted=false){const _id=id(value);if(!_id)throw fail('Mã dữ liệu không hợp lệ.');const row=await col.findOne({_id,group,bookType:kind,...(deleted?{}:{status:'published'})});if(!row)throw fail('Không tìm thấy dữ liệu.',404);return row;}
export async function readBooks(db,session,query={}){
 access(session);await seed(db);const col=db.collection('content_blocks');
 if(!query.bookId){const rows=await col.find({group,bookType:{$in:['category','book']},status:'published'},{projection:{content:0}}).sort({order:1,createdAt:1,_id:1}).limit(1500).toArray();return{categories:rows.filter(r=>r.bookType==='category').map(view),books:rows.filter(r=>r.bookType==='book').map(view)};}
 const book=await get(col,'book',query.bookId);
 if(query.sectionId){const section=await get(col,'section',query.sectionId,session.role==='admin'&&query.includeDeleted==='1');if(section.bookId!==String(book._id))throw fail('Mục không thuộc sách.',404);return{book:view(book),section:view(section),exercises:await sectionExercises(db,book,section),exerciseHeading:sectionFiles.has(String(section._id))?(sectionFiles.get(String(section._id))==='2-plus'?'Bài toán':['1-review','1-principles','2-review'].includes(sectionFiles.get(String(section._id)))?'Bài tập':sectionFiles.get(String(section._id)).replace('-','.')+'. Bài tập'):''};}
 const rows=await col.find({group,bookType:'section',bookId:String(book._id),...(session.role==='admin'&&query.includeDeleted==='1'?{}:{status:'published'})},{projection:{content:0}}).sort({order:1,_id:1}).limit(1000).toArray();return{book:view(book),sections:rows.map(view)};
}
export async function mutateBooks(db,session,action,payload={}){
 access(session,true);await seed(db);const col=db.collection('content_blocks');
 const saveKind={'books_save_category':'category','books_save_book':'book','books_save_section':'section'}[action];
 if(saveKind){
  const existing=payload.id?await get(col,saveKind,payload.id):null;
  let fields;
  if(saveKind==='category'){const name=text(payload.name,160,true);const rows=await col.find({group,bookType:'category',status:'published'}).limit(201).toArray();if(!existing&&rows.length>=200)throw fail('Tối đa 200 nhóm sách.');if(rows.some(r=>String(r._id)!==payload.id&&r.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi')))throw fail('Tên nhóm đã tồn tại.',409);fields={name};}
  if(saveKind==='book'){if(!existing&&(await col.find({group,bookType:'book'}).limit(1001).toArray()).length>=1000)throw fail('Tối đa 1000 sách.');const category=await get(col,'category',payload.categoryId);fields={categoryId:String(category._id),title:text(payload.title,300,true),authors:text(payload.authors||'',300),edition:text(payload.edition||'',120)};}
  if(saveKind==='section'){
   const book=await get(col,'book',existing?.bookId||payload.bookId);const bookId=String(book._id);
   const rows=await col.find({group,bookType:'section',bookId}).limit(1001).toArray();if(!existing&&rows.length>=1000)throw fail('Tối đa 1000 mục trong một sách.');
   const parentId=existing?existing.parentId:(payload.parentId||'');
   if(parentId){let parent=await get(col,'section',parentId);if(parent.bookId!==bookId)throw fail('Mục cha không thuộc sách.');let depth=1;while(parent.parentId){if(++depth>=6)throw fail('Mục lục tối đa 6 cấp.');parent=await get(col,'section',parent.parentId);} }
   const order=Number(payload.order??existing?.order??rows.length+1);if(!Number.isInteger(order)||order<0||order>100000)throw fail('Thứ tự không hợp lệ.');
   const contentFormat=payload.contentFormat??existing?.contentFormat??'plain-latex';
   if(!['plain-latex','html-latex'].includes(contentFormat))throw fail('Định dạng nội dung không hợp lệ.');
   fields={bookId,parentId,title:text(payload.title,300,true),content:text(payload.content||'',100000),contentFormat,order};
  }
  if(existing){if(!Number.isInteger(payload.expectedVersion)||payload.expectedVersion!==existing.version)throw fail('Dữ liệu đã thay đổi. Hãy tải lại trước khi lưu.',409);
   const saved=await col.findOneAndUpdate({_id:existing._id,group,status:'published',version:payload.expectedVersion},{$set:{...fields,updatedAt:new Date(),updatedBy:session.username},$inc:{version:1}},{returnDocument:'after'});if(!saved)throw fail('Dữ liệu đã thay đổi. Hãy tải lại.',409);return view(saved);}
  const _id=new ObjectId(),doc={...fields,_id,group,educationLevel:'university',bookType:saveKind,status:'published',version:1,createdAt:new Date(),createdBy:session.username};await col.insertOne(doc);return view(doc);
 }
 if(['books_delete_section','books_restore_section'].includes(action)){
  const row=await get(col,'section',payload.id,true);if(!Number.isInteger(payload.expectedVersion)||row.version!==payload.expectedVersion)throw fail('Dữ liệu đã thay đổi. Hãy tải lại.',409);
  const restore=action==='books_restore_section';if(restore&&row.parentId)await get(col,'section',row.parentId);
  const rows=await col.find({group,bookType:'section',bookId:row.bookId}).limit(1000).toArray();
  const affected=new Set([String(row._id)]);let added=true;while(added){added=false;for(const item of rows)if(affected.has(item.parentId)&&!affected.has(String(item._id))){affected.add(String(item._id));added=true;}}
  // Soft-delete/restore a subtree, retaining content and identity for recovery.
  const update={$set:{status:restore?'published':'deleted',updatedBy:session.username,updatedAt:new Date()},$inc:{version:1}};
  const changed=await col.findOneAndUpdate({_id:row._id,group,version:payload.expectedVersion},update,{returnDocument:'after'});if(!changed)throw fail('Dữ liệu đã thay đổi. Hãy tải lại.',409);
  await col.updateMany({group,bookType:'section',_id:{$in:[...affected].filter(value=>value!==String(row._id)).map(value=>new ObjectId(value))}},update);
  await db.collection('content_sets').updateMany({group,bookSectionId:{$in:[...affected]}},{$set:{status:restore?'published':'deleted'}});
  await db.collection('problems').updateMany({sourceGroup:group,bookSectionId:{$in:[...affected]}},{$set:{status:restore?'published':'deleted'}});
  return{id:payload.id,affected:affected.size};
 }
 throw fail('Thao tác Sách học không hợp lệ.');
}

