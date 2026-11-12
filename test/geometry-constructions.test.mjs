import assert from 'node:assert/strict';
import { cleanGeometryDiagram as clean, inspectGeometryDiagram as inspect } from '../lib/geometry-diagram.js';
import { generateGuideDiagram } from '../lib/guide-diagram.js';

const op = (id,type,points,parameter=0)=>({id,type,points,parameter});
const seg=(from,to)=>({from,to,auxiliary:true});
// Acute scalene triangle: irrational circle points, perpendicular feet and
// reflections reproduce the precision failure of hand-rounded AI coordinates.
const simson={isGeometry:true,caption:'Hình kiểm thử đường Simson',
  points:[{id:'A',x:0,y:4},{id:'B',x:-3,y:0},{id:'C',x:5,y:0}],
  constructions:[op('O','circumcenter',['A','B','C']),op('H','orthocenter',['A','B','C']),op('P','onCircle',['O','A'],61),
    op('X','projection',['P','B','C']),op('Y','projection',['P','C','A']),op('Z','projection',['P','A','B']),
    op('X1','reflection',['P','B','C']),op('Y1','reflection',['P','C','A']),op('Z1','reflection',['P','A','B']),op('M','midpoint',['B','C'])],
  segments:[seg('A','B'),seg('B','C'),seg('C','A'),seg('P','X'),seg('P','Y'),seg('P','Z'),seg('X','Y'),seg('Y','Z')],circles:[{center:'O',through:'A',auxiliary:false}],
  constraints:[{type:'onCircle',points:['P','O','A']},{type:'onCircle',points:['B','O','A']},{type:'onCircle',points:['C','O','A']},
    {type:'perpendicular',points:['P','X','B','C']},{type:'perpendicular',points:['P','Y','C','A']},{type:'perpendicular',points:['P','Z','A','B']},
    {type:'collinear',points:['X','Y','Z']},{type:'collinear',points:['X1','Y1','Z1']},{type:'collinear',points:['X1','Y1','H']},{type:'midpoint',points:['M','B','C']}]
};
const exact=clean(simson);assert.ok(exact,JSON.stringify(inspect(simson).issues));
const tagged = structuredClone(simson);
tagged.constructions.find(point => point.id === 'M').auxiliary = true;
const classified = clean(tagged);
assert.equal(classified.points.find(point => point.id === 'M').auxiliary, true, 'Auxiliary classification survives coordinate construction');
assert.equal(classified.points.find(point => point.id === 'O').auxiliary, false, 'Constructed points defined in the statement do not become auxiliary automatically');
assert.deepEqual(clean(classified), classified, 'Auxiliary classifications survive persistence sanitization');
const point=(diagram,id)=>diagram.points.find(p=>p.id===id);
assert.ok(Math.abs(point(exact,'O').x-1)<1e-12);assert.ok(Math.abs(point(exact,'O').y-0.125)<1e-12);
assert.ok(Math.abs(point(exact,'H').y-3.75)<1e-12);
assert.equal(exact.constructions,undefined,'Persist only computed canonical coordinates');
assert.deepEqual(clean(exact),exact,'Legacy and generated diagrams use the same persistence format');
const rounded=structuredClone(exact);rounded.points.forEach(p=>{p.x=Number(p.x.toFixed(2));p.y=Number(p.y.toFixed(2));});
assert.equal(clean(rounded),null,'Rounded circumcenter/feet reproduce numerical rejection');
assert.equal(inspect(rounded).issues[0].code,'CONSTRAINT_MISMATCH');
assert.ok(clean({...simson,constructions:[...simson.constructions].reverse()}),'Construction dependencies are resolved without requiring sorted input');
const transformed=structuredClone(simson);transformed.points.forEach(p=>{p.x=100+17*p.x;p.y=-200+17*p.y;});assert.ok(clean(transformed),'Affine translation/uniform scale preserve derived constraints');

const base={isGeometry:true,caption:'Intersections',points:[{id:'O',x:0,y:0},{id:'R',x:2,y:0},{id:'Q',x:3,y:0},{id:'S',x:5,y:0}],
  constructions:[op('U','circleCircle',['O','R','Q','S'],1),op('V','circleCircle',['O','R','Q','S'],-1)],segments:[seg('O','Q')],circles:[{center:'O',through:'R',auxiliary:false},{center:'Q',through:'S',auxiliary:false}],
  constraints:['U','V'].flatMap(id=>[{type:'onCircle',points:[id,'O','R']},{type:'onCircle',points:[id,'Q','S']}])};
const circles=clean(base);assert.ok(circles);assert.ok(Math.abs(point(circles,'U').x-1.5)<1e-12);assert.ok(point(circles,'U').y>0);assert.ok(point(circles,'V').y<0);
const line={...base,constructions:[op('U','lineCircle',['R','S','O','R'],1),op('V','lineCircle',['R','S','O','R'],-1)],constraints:['U','V'].map(id=>({type:'onCircle',points:[id,'O','R']}))};
const roots=clean(line);assert.ok(roots);assert.ok(Math.abs(point(roots,'U').x-2)<1e-12);assert.ok(Math.abs(point(roots,'V').x+2)<1e-12);
const median={...simson,constructions:[...simson.constructions,op('G','ratio',['A','M'],2/3),op('I','intersection',['A','M','P','X'])]};assert.ok(clean(median));
// Tangency is a valid single intersection, whereas parallel lines, coincident
// centers, unknown references and cyclic dependencies must never invent points.
const tangent={...line,points:[...line.points,{id:'L',x:-3,y:2},{id:'N',x:3,y:2}],constructions:[op('U','lineCircle',['L','N','O','R'],1)],constraints:[{type:'onCircle',points:['U','O','R']} ]};assert.ok(clean(tangent));assert.ok(Math.abs(point(clean(tangent),'U').y-2)<1e-12);
for(const [value,code] of [
  [{...simson,constructions:[op('D','projection',['A','B','B'])]},'DEGENERATE_CONSTRUCTION'],
  [{...simson,constructions:[op('D','intersection',['A','B','A','B'])]},'DEGENERATE_CONSTRUCTION'],
  [{...simson,constructions:[op('D','midpoint',['E','A']),op('E','midpoint',['D','B'])]},'UNRESOLVED_CONSTRUCTION'],
  [{...simson,constructions:[op('D','midpoint',['UNKNOWN','A'])]},'UNRESOLVED_CONSTRUCTION'],
  [{...simson,constructions:[op('A','midpoint',['B','C'])]},'INVALID_CONSTRUCTION'],
  [{...simson,constructions:[op('D','eval',['A','B'])]},'INVALID_CONSTRUCTION'],
  [{...simson,constructions:[op('D','ratio',['A','B'],Infinity)]},'INVALID_CONSTRUCTION'],
  [{...tangent,points:tangent.points.map(p=>p.id==='L'||p.id==='N'?{...p,y:3}:p)},'MISSING_INTERSECTION'],
  [{...base,points:base.points.map(p=>p.id==='Q'?{...p,x:20}:p)},'MISSING_INTERSECTION'],
  [{...simson,points:[{id:'A',x:0,y:0},{id:'B',x:1,y:0},{id:'C',x:2,y:0}]},'DEGENERATE_CONSTRUCTION']
]) assert.equal(inspect(value).issues[0].code,code);

const run=async(replies,options={})=>{
  const requests=[], logs=[];let i=0;
  const result=await generateGuideDiagram({common:'STATEMENT: test scalene triangle',solution:'Keep this proof.',language:'Vietnamese',
    generate:async args=>{requests.push(args);return{data:rounded}},review:async args=>{requests.push(args);return{data:replies[Math.min(i++,replies.length-1)]}},log:(...args)=>logs.push(args),...options});
  return{result,requests,logs};
};
const first=await run([{approved:true,geometry:simson,reason:'Dựng bằng hình chiếu.'}]);assert.ok(first.result.geometry);assert.equal(first.requests.length,2);assert.match(first.requests[1].input,/CONSTRAINT_MISMATCH/);assert.equal(first.logs.length,0);
const reused=await run([{approved:true,useCandidate:true,geometry:null,reason:'Giữ tọa độ đã tính.'}],{generate:async()=>({data:simson})});assert.deepEqual(reused.result.geometry,exact,'Approval can preserve exact computed coordinates without model reserialization');
const falseReuse=await run([{approved:true,useCandidate:true,geometry:null,reason:'Invalid candidate.'}]);assert.equal(falseReuse.result.geometry,null,'Approval cannot bypass numerical validation');
const repaired=await run([{approved:true,geometry:rounded,reason:'Need precise feet.'},{approved:true,geometry:simson,reason:'Repaired.'}]);assert.ok(repaired.result.geometry);assert.equal(repaired.requests.length,3);assert.match(repaired.requests[2].input,/PREVIOUS REVIEW/);assert.match(repaired.requests[2].input,/CONSTRAINT_MISMATCH/);assert.equal(repaired.logs.length,1);
const invalid=await run([{approved:true,geometry:rounded,reason:'Rounded.'}]);assert.equal(invalid.result.geometry,null);assert.equal(invalid.result.code,'GEOMETRY_CONSTRAINT_MISMATCH');assert.equal(invalid.requests.length,3,'Only one repair is allowed');
const rejected=await run([{approved:false,geometry:simson,reason:'Thiếu điều kiện tiếp xúc.'}]);assert.equal(rejected.result.geometry,null,'Numerical validity cannot override semantic rejection');assert.equal(rejected.result.code,'GEOMETRY_REVIEW_REJECTED');assert.match(rejected.result.reason,/tiếp xúc/);
await assert.rejects(generateGuideDiagram({common:'',solution:'',language:'Vietnamese',deadline:Date.now(),generate:()=>{throw Error('must not call');},review:()=>{throw Error('must not call');}}),{code:'GEOMETRY_TIMEOUT'});
console.log('Constructive geometry: Simson/circumcircle/feet/reflections, intersections, degeneracy, repair and deadline: OK');
