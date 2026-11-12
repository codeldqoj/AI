import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ObjectId } from 'mongodb';
import { JSDOM } from 'jsdom';
import { assigned, allows, contentAllowed, moduleAllowed, valid } from '../lib/education-access.js';
import { educationDb } from '../lib/education-db.js';
import { filterAppShell, serveEducationPage } from '../lib/app-shell.js';
import { canAccessProblem, hideUnverifiedReferenceSolution, supportVisibility } from '../lib/problem-access.js';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
const read = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const member = levels => ({sub:'member-id',username:'member',role:'student',educationLevels:levels});
const lower=member(['lower_secondary']), upper=member(['upper_secondary']), both=member(['lower_secondary','upper_secondary']);
const admin={sub:'admin-id',username:'admin',role:'admin'};
const teacher={...lower,sub:'teacher-id',username:'teacher',role:'teacher'};
assert.deepEqual(assigned({role:'student'}),['lower_secondary','upper_secondary'],'Existing accounts retain current catalog');
assert.deepEqual(assigned(member([])),[]);
assert.equal(valid(['lower_secondary','upper_secondary']),true);
for(const value of [null,'upper_secondary',['fake'],['primary','primary']])assert.equal(valid(value),false);
for(const [user,admission,vmo] of [[lower,true,false],[upper,false,true],[both,true,true],[teacher,true,false],[admin,true,true]]){
 assert.equal(moduleAllowed(user,'admission'),admission);assert.equal(moduleAllowed(user,'mock'),vmo);
 assert.equal(moduleAllowed(user,'danang'),vmo);assert.equal(moduleAllowed(user,'support'),true);
}
assert.equal(canAccessProblem({sourceGroup:'tst'},lower),false);
assert.equal(canAccessProblem({sourceGroup:'specialized_admission'},upper),false);
assert.equal(canAccessProblem({sourceGroup:'math_support',ownerId:'other'},lower),false);
assert.equal(canAccessProblem({sourceGroup:'math_support',ownerId:'other'},teacher),true);
const unverifiedSolution={contentKey:'q1',referenceSolution:'pending answer',referenceSolutionVerified:false,referenceSolutionVerifiedBy:'teacher',referenceSolutionVerifiedAt:new Date()};
assert.equal(hideUnverifiedReferenceSolution(unverifiedSolution,lower).referenceSolution,undefined,'Unverified answers stay hidden from students');
assert.equal(hideUnverifiedReferenceSolution(unverifiedSolution,teacher).referenceSolution,'pending answer','Teachers can review unverified answers');
assert.equal(hideUnverifiedReferenceSolution({...unverifiedSolution,referenceSolutionVerified:true},lower).referenceSolution,'pending answer','Verified answers remain visible');
assert.equal(contentAllowed(member(['primary']),{educationLevel:'primary'}),true);
assert.equal(contentAllowed(lower,{educationLevel:'university',sourceGroup:'specialized_admission'}),false);
function match(row,query={}) {
 return Object.entries(query).every(([key,v])=>{
  if(key==='$and')return v.every(q=>match(row,q));if(key==='$or')return v.some(q=>match(row,q));
  const actual=key.split('.').reduce((x,k)=>x?.[k],row);
  if(v && typeof v==='object' && !(v instanceof ObjectId))return Object.entries(v).every(([op,value])=>{
   if(op==='$exists')return (actual!==undefined)===value;if(op==='$in')return value.some(x=>String(x)===String(actual));
   if(op==='$nin')return !value.some(x=>String(x)===String(actual));if(op==='$ne')return String(actual)!==String(value);
   if(op==='$type')return typeof actual===value;throw Error('Unsupported test query '+op);
  });return String(actual)===String(v);
 });
}
const records=new Map([
 ['exams',[{_id:new ObjectId(),category:'specialized-admission',title:'Admission',status:'published'}, {_id:new ObjectId(),category:'tst-national',title:'TST',status:'published'}]],
 ['problems',[{_id:new ObjectId(),contentKey:'admission:q1',sourceGroup:'specialized_admission',content:'Admission statement',status:'published'}, {_id:new ObjectId(),contentKey:'tst:q1',sourceGroup:'tst',content:'TST secret statement',status:'published'}, {_id:new ObjectId(),contentKey:'support:q1',sourceGroup:'math_support',ownerId:'member-id',status:'published'}]],
 ['submissions',[{_id:new ObjectId(),sourceGroup:'tst',solutionContent:'TST saved guide'},{_id:new ObjectId(),sourceGroup:'specialized_admission',solutionContent:'Admission saved guide'}]],
 ['users',[{_id:'member-id',username:'member',role:'student',educationLevels:['upper_secondary']}]]
]);
const db={collection(name){if(!records.has(name))records.set(name,[]);const rows=records.get(name);return{
 find(query={}){let data=rows.filter(row=>match(row,query));return{sort(){return this;},limit(n){data=data.slice(0,n);return this;},skip(){return this;},project(){return this;},async toArray(){return data;}};},
 async findOne(query){return rows.find(row=>match(row,query))||null;},
 async countDocuments(query){return rows.filter(row=>match(row,query)).length;},
 aggregate(pipeline){let data=[...rows];for(const stage of pipeline)if(stage.$match)data=data.filter(row=>match(row,stage.$match));return{async toArray(){return data;}};},
 async insertOne(doc){doc._id ||= new ObjectId();rows.push(doc);return{insertedId:doc._id};},
 async updateOne(query,update){const row=rows.find(row=>match(row,query));if(row)Object.assign(row,update.$set);return{matchedCount:row?1:0};},
 async deleteOne(query){const i=rows.findIndex(row=>match(row,query));if(i>=0)rows.splice(i,1);return{deletedCount:i>=0?1:0};}
 };}};
for(const [user,count] of [[lower,1],[upper,1],[both,2],[member(['primary']),0],[member(['university']),0],[member([]),0]]){
 const scoped=educationDb(db,user);assert.equal((await scoped.collection('exams').find({}).toArray()).length,count);
 assert.equal(await scoped.collection('exams').countDocuments({}),count);
 assert.equal((await scoped.collection('exams').aggregate([{$match:{status:'published'}}]).toArray()).length,count);
}
const scoped=educationDb(db,lower);
assert.equal(await scoped.collection('exams').findOne({category:'tst-national'}),null,'Caller cannot override category scope');
assert.equal((await scoped.collection('submissions').find({}).toArray())[0].solutionContent,'Admission saved guide');
assert.equal((await scoped.collection('exams').updateOne({category:'tst-national'},{$set:{title:'Forged'}})).matchedCount,0);
assert.equal((await scoped.collection('exams').deleteOne({category:'tst-national'})).deletedCount,0);
assert.throws(()=>scoped.collection('exams').insertOne({category:'tst-national'}),/cấp học/);
assert.throws(()=>scoped.collection('exams').updateOne({},{$set:{category:'tst-national'}}),/cấp học/);
assert.throws(()=>scoped.collection('exams').aggregate([{$search:{}}]),/cấp học/);
const deniedReference=await retrieveVerifiedContext({problemRef:'tst:q1',statement:'forged statement',session:lower},{db});
assert.equal(deniedReference.blocked,true,'Guide and geometry cannot use a registered problem outside the level');
const response=()=>({code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;},end(){return this;}});
let session=lower;
function route(path,deps){const code=read(path).replace(/^import[\s\S]*?;\n/gm,'').replace('export default async function','async function').replaceAll('export function','function');return new Function(...Object.keys(deps),code+';return handler;')(...Object.values(deps));}
const auth=route('api/auth.js',{getDb:async()=>db,getSession:()=>session,assigned,valid,recordActivity:async()=>{}});
async function assign(user,educationLevels){session=user;const res=response();await auth({method:'POST',body:{action:'update_education_levels',targetUsername:'member',educationLevels}},res);return res;}
for(const user of [lower,teacher])assert.equal((await assign(user,['primary'])).code,403);
assert.equal((await assign(admin,['lower_secondary','upper_secondary'])).code,200);
assert.deepEqual(records.get('users')[0].educationLevels,['lower_secondary','upper_secondary']);
assert.equal((await assign(admin,['bogus'])).code,400);
assert.equal((await assign(admin,[])).code,200,'Admin may explicitly revoke all content levels');
const data=route('api/data.js',{getDb:async()=>db,getSession:()=>session,educationDb,allows,ObjectId,handleMathSupport:async()=>false,supportVisibility,canAccessProblem});
session=lower;
for(const [resource,extra] of [['exams',{}],['problems',{sourceGroup:'tst'}],['submissions',{}]]){
 const res=response();await data({method:'GET',query:{resource,...extra}},res);
 assert.equal(res.code,200);assert.ok(res.body.items.every(item=>item.sourceGroup!=='tst'&&item.category!=='tst-national'));
}
const forbidden=response();await data({method:'POST',body:{action:'submit_solution',payload:{problemId:'tst:q1',solutionContent:'forged'}}},forbidden);assert.equal(forbidden.code,403);
const trends=route('api/ai-exam-trends.js',{getSession:()=>session,prepare:()=>{},allows});
const trendRes=response();await trends({method:'POST',body:{}},trendRes);assert.equal(trendRes.code,403,'No THPT trend evidence for a THCS account');
const html=read('index.html');
for(const user of [lower,member(['primary']),member(['university']),member([])])assert.ok(!filterAppShell(html,user).includes('id="book-content"'),'THPT book is removed from server HTML, not just hidden');
assert.ok(filterAppShell(html,upper).includes('id="book-content"'));
let res=response();await serveEducationPage({query:{resource:'app_shell'}},res,null);assert.equal(res.code,302);assert.equal(res.headers.Location,'/login.html');
res=response();await serveEducationPage({query:{resource:'protected_asset',file:'On_luyen_VMO_Da_Nang_2026_2027.pdf'}},res,lower);assert.equal(res.code,403);
res=response();await serveEducationPage({query:{resource:'protected_asset',file:'../index.html'}},res,upper);assert.equal(res.code,404);
for(const user of [lower,upper,both,member(['primary']),member(['university']),member([]),admin]){
 const dom=new JSDOM(filterAppShell(html,user),{url:'https://example.test/',runScripts:'outside-only'});const {window}=dom;
 window.VMOAuth={getSession:()=>user};window.scrollTo=()=>{};window.matchMedia=()=>({matches:false,addEventListener(){}});
 window.eval(read('education_access.js'));window.eval(read('app.js'));await new Promise(resolve=>window.setTimeout(resolve,0));
 for(const key of Object.keys(window.MathAppEducation.modules).filter(key=>key!=='trends')){
  const button=window.document.getElementById('tab-btn-'+key);assert.equal(!button.hidden,moduleAllowed(user,key));
 }
 const active=window.document.querySelector('.tab-pane.active')?.id;
 await window.switchTab(user===lower?'tab-tst':'tab-missing');assert.equal(window.document.querySelector('.tab-pane.active')?.id,active,'Forbidden programmatic navigation is blocked');
 assert.equal(window.document.querySelectorAll('.tab-pane.active').length,1);
 if(user.educationLevels?.length===0)assert.equal(active,'tab-pending');
 window.close();
}
// Admin's account table persists a union of levels, without granting Teachers account management.
{
 const dom=new JSDOM('<!doctype html><button id="btnOpenUserMgmt"></button>'+read('src/modals/account-modal.html'),{url:'https://example.test/',runScripts:'outside-only'});
 const {window}=dom;let saved;
 const accounts=[admin,{...lower,username:'thcs1'}];
 window.eval(read('education_access.js'));
 window.VMOAuth={requireAuth:()=>admin,listUsers:async()=>({success:true,users:accounts}),updateEducationLevels:async(name,levels)=>{saved={name,levels};accounts[1].educationLevels=levels;return{success:true,message:'Đã lưu cấp học'};}};
 window.eval(read('account_mgmt.js'));await new Promise(resolve=>window.setTimeout(resolve,0));
 window.document.getElementById('btnOpenUserMgmt').click();await new Promise(resolve=>window.setTimeout(resolve,0));
 const field=window.document.querySelector('.account-levels-cell fieldset');
 assert.ok(field);const extra=field.querySelector('input[value="upper_secondary"]');extra.checked=true;extra.dispatchEvent(new window.Event('change'));
 field.querySelector('button').click();await new Promise(resolve=>window.setTimeout(resolve,0));
 assert.deepEqual(JSON.parse(JSON.stringify(saved)),{name:'thcs1',levels:['lower_secondary','upper_secondary']});
 assert.equal(window.document.querySelectorAll('.account-levels-cell fieldset input:checked').length,2);
 window.close();
}
// Stale browser state must not cause a login -> index -> login redirect loop.
{
 const dom=new JSDOM('<!doctype html>',{url:'https://example.test/login.html',runScripts:'outside-only'});
 const {window}=dom;window.fetch=async()=>({status:401});window.eval(read('auth.js'));
 window.localStorage.setItem('vmo_auth_session',JSON.stringify({username:'stale',role:'teacher',educationLevels:['upper_secondary']}));
 assert.equal(await window.VMOAuth.redirectIfLoggedIn(),false);
 assert.equal(window.VMOAuth.getSession(),null);window.close();
}
console.log('Education levels: multi-select, API isolation/counts/writes, account permissions, RAG gate, protected HTML/assets and navigation: OK');
