import { educationDb } from '../lib/education-db.js';
import { assigned, valid, allows } from '../lib/education-access.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { JSDOM } from 'jsdom';
import { canAccessProblem, supportVisibility } from '../lib/problem-access.js';
import { buildSubmissionVerificationUpdate } from '../lib/submission-verification.js';
import { learningScope } from '../lib/learning.js';
import { trendAnalysisSettings } from '../lib/exam-trends.js';

const source = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');
function route(path, dependencies) {
  const code = source(path).replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export default async function', 'async function').replaceAll('export function', 'function');
  return new Function(...Object.keys({educationDb,assigned,valid,allows,...dependencies}), code+'\nreturn handler;')(...Object.values({educationDb,assigned,valid,allows,...dependencies}));
}
const response = () => ({ code:0, setHeader(){}, status(code){this.code=code;return this;}, json(body){this.body=body;return this;}, end(){return this;} });
const admin={sub:'admin-id',username:'admin',role:'admin'}, teacher={sub:'teacher-id',username:'teacher',role:'teacher'}, member={sub:'member-id',username:'member',role:'student'};
let session=admin;
const collections=new Map();
function matches(row,query) {
 return Object.entries(query).every(([key,value])=>{
  if(key==='$or')return value.some(part=>matches(row,part));
  if(value && typeof value==='object' && !(value instanceof ObjectId)){
   if('$exists' in value)return (row[key]!==undefined)===value.$exists;
   if('$ne' in value)return String(row[key])!==String(value.$ne);
  }
  return String(row[key])===String(value);
 });
}
const db={collection(name){
 if(!collections.has(name))collections.set(name,[]);
 const rows=collections.get(name);
 return {
  async createIndex(){},
  async findOne(query){return rows.find(row=>matches(row,query))||null;},
  find(query){const items=rows.filter(row=>matches(row,query));return{sort(){return this;},limit(){return this;},async toArray(){return items;}};},
  async insertOne(doc){doc._id ||= new ObjectId();rows.push(doc);return{insertedId:doc._id};},
  async updateOne(query,update){const row=rows.find(row=>matches(row,query));if(row)Object.assign(row,update.$set);return{matchedCount:row?1:0};}
 };
}};
const auth=route('api/auth.js',{getDb:async()=>db,getSession:()=>session,bcrypt:{hash:async()=> 'test-hash'},recordActivity:async()=>{}});
for(const role of [teacher,member])for(const action of ['list_users','create_user','update_password','update_role','delete_user']){
 session=role;const res=response();await auth({method:'POST',body:{action,username:'newteacher',password:'testing-only',role:'admin',targetUsername:'admin'}},res);
 assert.equal(res.code,403,role.role+' cannot '+action);
}
session=admin;let res=response();await auth({method:'POST',body:{action:'create_user',username:'newteacher',password:'testing-only',role:'teacher'}},res);
assert.equal(res.code,201);assert.equal(collections.get('users')[0].role,'teacher','Only Admin assigns the new teacher role');
async function changeRole(targetUsername, role) {
 const res=response();await auth({method:'POST',body:{action:'update_role',targetUsername,role}},res);return res;
}
for(const role of ['admin','student','teacher']) {
 res=await changeRole('newteacher',role);assert.equal(res.code,200);assert.equal(collections.get('users')[0].role,role);
}
assert.equal((await changeRole('newteacher','superadmin')).code,400);
assert.equal((await changeRole('missing','teacher')).code,404);
collections.get('users').push({_id:'admin-id',username:'admin',role:'admin'});
assert.equal((await changeRole('admin','student')).code,400,'No self demotion, so sole Admin is protected');
session=null;assert.equal((await changeRole('newteacher','admin')).code,401);session=admin;
// Exercise real signed cookies and DB role lookup without a live database.
const sessionCode=source('lib/session.js').replace(/^import[\s\S]*?;\n/gm,'').replaceAll('export ', '');
const cookieAuth=new Function('assigned','crypto','ObjectId','getDb',sessionCode+';return {signSession,getSession};')(assigned,crypto,ObjectId,async()=>db);
const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-session-secret-only-not-a-real-key';
try {
 const user=collections.get('users')[0];
 const token=cookieAuth.signSession(user);const req={headers:{cookie:'vmo_session='+token}};
 assert.equal((await cookieAuth.getSession(req)).role,'teacher');
 user.educationLevels=['lower_secondary'];assert.equal(await cookieAuth.getSession(req),null,'Old cookie rejected after education-level assignment');
 delete user.educationLevels;
 user.role='student';assert.equal(await cookieAuth.getSession(req),null,'Old privileged cookie rejected after demotion');
 const newToken=cookieAuth.signSession(user);assert.equal((await cookieAuth.getSession({headers:{cookie:'vmo_session='+newToken}})).role,'student');
 collections.get('users').shift();assert.equal(await cookieAuth.getSession(req),null,'Deleted accounts cannot retain cookie access');
 assert.equal(await cookieAuth.getSession({headers:{cookie:'vmo_session=invalid'}}),null);
} finally {if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
assert.equal(canAccessProblem({sourceGroup:'math_support',ownerId:'someone-else'},teacher),true);
assert.deepEqual(supportVisibility(teacher),{});
assert.deepEqual(learningScope(teacher),{});
assert.equal(buildSubmissionVerificationUpdate(teacher,{solutionContent:'A valid solution'}, {verified:true}).update.$set.adminVerified,true);

const data=route('api/data.js',{getDb:async()=>db,getSession:()=>session,ObjectId,handleMathSupport:async()=>false,recordActivity:async()=>{}});
async function call(body,query={}){const res=response();await data({method:body?'POST':'GET',query,body},res);return res;}
session=teacher;
assert.equal((await call({action:'add_event',payload:{title:'Teacher event',startDate:'2026-10-24'}})).code,201,'Teacher manages content');
assert.equal((await call({action:'update_ai_guide',payload:{id:'invalid'}})).code,400,'Teacher reaches AI guide input validation');
session=member;
assert.equal((await call({action:'add_event',payload:{title:'Unauthorized',startDate:'2026-10-24'}})).code,403);
assert.equal((await call({action:'update_ai_guide',payload:{id:'invalid'}})).code,403,'Member cannot edit shared AI guides');
assert.equal((await call(null,{resource:'rag_status'})).code,403,'Member cannot operate the RAG administration tools');
const topics=['Dãy số và Giới hạn dãy số','Phương trình hàm','Số học và dãy số','Hình học phẳng','Đa thức','Tổ hợp'];
res=await call({action:'save_exam_trend_report',payload:{ownerId:'forged',createdBy:'admin',settings:{mode:'year',year:'2026-2027'},report:{title:'My trend report',topicTrends:topics.map(topic=>({topic}))}}});
assert.equal(res.code,201);
const own=res.body.item;assert.equal(own.ownerId,member.sub);assert.equal(own.createdBy,member.username);
const foreign={...own,_id:new ObjectId(),ownerId:'other-member',createdBy:member.username};
collections.get('exam_trend_reports').push(foreign);
const legacy={...own,_id:new ObjectId()};delete legacy.ownerId;
collections.get('exam_trend_reports').push(legacy);
res=await call(null,{resource:'exam_trend_reports'});assert.equal(res.code,200);assert.deepEqual(res.body.items.map(item=>String(item._id)),[String(own._id)],'Membership uses immutable owner ID');
for(const action of ['update_exam_trend_report','delete_exam_trend_report'])assert.equal((await call({action,payload:{id:String(foreign._id),ownerId:member.sub}})).code,403,'Member cannot mutate someone else’s report');
assert.equal((await call({action:'delete_exam_trend_report',payload:{id:String(legacy._id)}})).code,403,'Legacy author names do not grant ownership');
collections.get('exam_trend_reports').splice(collections.get('exam_trend_reports').indexOf(legacy),1);
assert.equal((await call({action:'delete_exam_trend_report',payload:{id:String(own._id)}})).code,200,'Member can delete their own report');
session=teacher;res=await call(null,{resource:'exam_trend_reports'});assert.equal(res.body.items.length,1,'Teacher sees all remaining reports');
assert.equal((await call({action:'delete_exam_trend_report',payload:{id:String(foreign._id)}})).code,200,'Teacher manages reports across accounts');

const trends=route('api/ai-exam-trends.js',{prepare:()=>{},getSession:()=>session,parseBody:req=>req.body,trendAnalysisSettings,checkRateLimit:()=>true});
for(const role of [member,teacher]){session=role;res=response();await trends({method:'POST',body:{mode:'year',year:'invalid'}},res);assert.equal(res.code,400,'Trend access reaches input validation for '+role.role);}
session=null;res=response();await trends({method:'POST',body:{}},res);assert.equal(res.code,401);

for(const role of [admin,teacher,member]){
 const dom=new JSDOM(`<!doctype html><html><body><span id="currentUserName"></span><span id="currentUserRole"></span><button id="btnOpenUserMgmt"></button>${source('src/modals/account-modal.html')}<div id="dataHubModal"><div class="vmo-modal-body"><div><button id="hub-tab-events" class="hub-tab-btn"></button></div><div id="hub-panel-events"><div id="hubEventsList"></div></div></div></div></body></html>`,{url:'https://example.test/',runScripts:'outside-only'});
 const {window}=dom;window.VMOAuth={getSession:()=>role,requireAuth:()=>role};window.VMODataService={getEvents:async()=>[]};window.alert=()=>{};
 window.eval(source('account_mgmt.js'));window.eval(source('vmo_db_ui.js'));
 window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
 window.openDataHubModal();
 assert.ok(window.document.getElementById('hub-tab-trends'),'Trend tab available to '+role.role);
 assert.equal(Boolean(window.document.getElementById('hub-tab-catalog')),role.role!=='student');
 assert.equal(window.document.getElementById('btnOpenUserMgmt').style.display,role.role==='admin'?'inline-flex':'none');
 assert.equal(window.document.querySelectorAll('[data-rag-action]').length>0,role.role!=='student','RAG operations are not part of member trend access');
 if(role.role==='teacher')assert.equal(window.document.getElementById('currentUserRole').textContent,'Giáo viên');
 assert.ok(window.document.querySelector('#newRole option[value="teacher"]'));
 window.close();
}
// Account manager interaction: choose role, save, refresh, and keep current account protected.
{
 const dom=new JSDOM('<!doctype html><body><button id="btnOpenUserMgmt"></button>'+source('src/modals/account-modal.html'),{url:'https://example.test/',runScripts:'outside-only'});
 const {window}=dom;let calls=0;
 const users=[{username:'admin',role:'admin'},{username:'newteacher',role:'student'}];
 window.VMOAuth={requireAuth:()=>admin,listUsers:async()=>({success:true,users}),updateRole:async(name,role)=>{calls++;assert.equal(name,'newteacher');users[1].role=role;return{success:true,message:'Đã cập nhật quyền'};}};
 window.eval(source('account_mgmt.js'));
 // Run initialization once: DOMContentLoaded is dispatched automatically by jsdom.
 await new Promise(resolve=>window.setTimeout(resolve,0));
 window.document.getElementById('btnOpenUserMgmt').click();
 await new Promise(resolve=>window.setTimeout(resolve,0));
 let select=window.document.querySelector('select[aria-label="Quyền của newteacher"]');
 assert.ok(select);assert.equal(window.document.querySelectorAll('.btn-change-role').length,1,'No self role editor');
 select.value='teacher';select.dispatchEvent(new window.Event('change'));
 const button=window.document.querySelector('.btn-change-role');assert.equal(button.disabled,false);button.click();
 await new Promise(resolve=>window.setTimeout(resolve,0));
 assert.equal(calls,1);assert.equal(window.document.querySelector('select[aria-label="Quyền của newteacher"]').value,'teacher');
 assert.match(window.document.getElementById('modalAlert').textContent,/Đã cập nhật quyền/);
 window.close();
}
console.log('Teacher content permissions, Admin-only accounts, member trends/ownership and Hub UI: OK');
