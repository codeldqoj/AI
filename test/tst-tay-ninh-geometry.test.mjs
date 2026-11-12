import assert from 'node:assert/strict';
import { cleanGeometryDiagram as clean } from '../lib/geometry-diagram.js';

// Actual MathApp case inspected in the signed-in preview on 2026-10-18:
// TST Tây Ninh 2026–2027, day 1 (19/09/2026), Câu 3 (5đ), Hình học.
// Stable identity: tst:tst-tay-ninh:day-1:question-3 (not day-2 question 3).
// Convex ABCD, O=AC∩BD; neither diagonal is perpendicular to the other or
// an edge. d1,d2,d3 pass through O perpendicular to AB,AD,BC. G∈d1;
// F=GA∩d2, H=GB∩d3, with A between G,F and B between G,H.
// K,L are orthocenters of OAD,OBC. (a) KL is the radical axis of the
// circles with diameters AB,CD. (b) FH is a pencil or has a fixed direction.
// These deterministic tests verify representative configurations; they do
// not claim to be a fresh live Gemini/GPT request or a universal proof.
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const norm=v=>Math.hypot(v.x,v.y);
const point=(g,id)=>g.points.find(p=>p.id===id);
const parallel=(a,b,c,d)=>Math.abs(cross(sub(b,a),sub(d,c)))/(norm(sub(b,a))*norm(sub(d,c)));
const perpendicular=(a,b,c,d)=>Math.abs(dot(sub(b,a),sub(d,c)))/(norm(sub(b,a))*norm(sub(d,c)));
const between=(a,g,f)=>{const v=sub(f,g);return dot(sub(a,g),v)/dot(v,v);};
const construct=(id,type,points,parameter=0)=>({id,type,points,parameter});
function diagram(vertices, factor) {
  const result=clean({isGeometry:true,caption:'TST Tây Ninh 2026–2027, Câu 3 ngày 1',points:vertices.map((p,i)=>({id:'ABCD'[i],x:p[0],y:p[1]})),
    constructions:[construct('O','intersection',['A','C','B','D']),construct('T1','projection',['O','A','B']),construct('T2','projection',['O','A','D']),construct('T3','projection',['O','B','C']),
      construct('G','ratio',['O','T1'],factor),construct('F','intersection',['G','A','O','T2']),construct('H','intersection',['G','B','O','T3']),construct('K','orthocenter',['O','A','D']),construct('L','orthocenter',['O','B','C']),construct('M1','midpoint',['A','B']),construct('M2','midpoint',['C','D'])],
    segments:[['A','B'],['B','C'],['C','D'],['D','A'],['A','C'],['B','D'],['O','G'],['O','F'],['O','H'],['G','F'],['G','H'],['F','H'],['K','L']].map(([from,to])=>({from,to,auxiliary:!('ABCD'.includes(from)&&'ABCD'.includes(to))})),
    circles:[{center:'M1',through:'A',auxiliary:false},{center:'M2',through:'C',auxiliary:false}],
    constraints:[['perpendicular',['O','G','A','B']],['perpendicular',['O','F','A','D']],['perpendicular',['O','H','B','C']],
      ['perpendicular',['A','K','O','D']],['perpendicular',['D','K','O','A']],['perpendicular',['B','L','O','C']],['perpendicular',['C','L','O','B']],
      ['collinear',['A','C','O']],['collinear',['B','D','O']],['collinear',['G','A','F']],['collinear',['G','B','H']],['collinear',['O','F','K']],['collinear',['O','H','L']],['midpoint',['M1','A','B']],['midpoint',['M2','C','D']]].map(([type,points])=>({type,points}))});
  if(!result)return null;
  const a=between(point(result,'A'),point(result,'G'),point(result,'F')), b=between(point(result,'B'),point(result,'G'),point(result,'H'));
  return a>0&&a<1&&b>0&&b<1?result:null;
}
function checkHypotheses(g) {
  const [A,B,C,D,O,F,H,G]=['A','B','C','D','O','F','H','G'].map(id=>point(g,id));
  const v=[A,B,C,D];const turns=v.map((a,i)=>cross(sub(v[(i+1)%4],a),sub(v[(i+2)%4],v[(i+1)%4])));
  assert.ok(turns.every(x=>x>0)||turns.every(x=>x<0),'ABCD is strictly convex in the declared order');
  assert.ok(perpendicular(A,C,B,D)>1e-8,'Diagonals are not perpendicular');
  for(const [a,b]of[[A,B],[B,C],[C,D],[D,A]])for(const [x,y]of[[A,C],[B,D]])assert.ok(perpendicular(a,b,x,y)>1e-8,'No diagonal is perpendicular to any edge');
  assert.ok(between(O,A,C)>0&&between(O,A,C)<1);assert.ok(between(O,B,D)>0&&between(O,B,D)<1);
  assert.ok(between(A,G,F)>0&&between(A,G,F)<1);assert.ok(between(B,G,H)>0&&between(B,G,H)<1);
}
function checkRadicalAxis(g) {
  const A=point(g,'A'),C=point(g,'C'),M1=point(g,'M1'),M2=point(g,'M2');
  const power=(x,o,r)=>dot(sub(x,o),sub(x,o))-dot(sub(r,o),sub(r,o));
  for(const id of ['K','L']){const p=point(g,id);assert.ok(Math.abs(power(p,M1,A)-power(p,M2,C))<1e-9,id+' has equal circle powers');}
  assert.ok(norm(sub(point(g,'K'),point(g,'L')))>1e-8,'K and L are distinct');
}
const actualVertices=[[0,0],[6,0],[5,4],[-1,3]];
const actual=diagram(actualVertices,79/36);assert.ok(actual);checkHypotheses(actual);checkRadicalAxis(actual);
assert.ok(Math.abs(point(actual,'O').x-90/43)<1e-12);assert.ok(Math.abs(point(actual,'G').y+2)<1e-12);
function testFamily(vertices,mode) {
  const variants=[];for(let i=11;i<=70;i++){const g=diagram(vertices,i/10);if(g){checkHypotheses(g);checkRadicalAxis(g);variants.push(g);}}
  assert.ok(variants.length>=3,'Need several admissible G positions');
  const base=variants[0],[A,B,K,L]=['A','B','K','L'].map(id=>point(base,id));
  if(mode==='concurrent') {
    const u=sub(B,A),v=sub(L,K),t=cross(sub(K,A),v)/cross(u,v),fixed={x:A.x+t*u.x,y:A.y+t*u.y};
    for(const g of variants)assert.ok(parallel(point(g,'F'),point(g,'H'),point(g,'F'),fixed)<1e-10,'FH passes through the same AB∩KL');
  } else if(mode==='parallel') {
    for(const g of variants)assert.ok(parallel(point(g,'F'),point(g,'H'),A,B)<1e-10,'FH is parallel to AB');
  } else {
    assert.ok(parallel(point(base,'A'),point(base,'D'),point(base,'B'),point(base,'C'))<1e-10);
    assert.ok(parallel(point(base,'A'),point(base,'B'),point(base,'C'),point(base,'D'))>1e-3,'AD∥BC does NOT imply a parallelogram');
    for(const g of variants)for(const id of ['F','H'])assert.ok(parallel(K,L,K,point(g,id))<1e-10,'FH is the fixed line KL in the trapezoid case');
  }
  return variants.length;
}
const concurrent=testFamily(actualVertices,'concurrent');
const parallelCount=testFamily([[4,1],[1,4],[-8,-2],[-2,-8]],'parallel');
const trapezoid=testFamily([[4,1],[1,3],[-8,-2],[-0.5,-1.5]],'trapezoid');
console.log(`TST Tây Ninh day-1 Q3: observed configuration, radical axis, ${concurrent} concurrent / ${parallelCount} parallel / ${trapezoid} non-parallelogram trapezoid samples: OK`);
