// Offline conversion of reviewed Stewart HTML. Never parse arbitrary requests here.
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const section=process.argv[2]||'1-1';if(!['1-1','1-2','1-3','1-4','1-5','1-review','1-principles','2-1','2-2','2-3','2-4','2-5','2-6','2-7','2-8','2-review','2-plus'].includes(section))throw Error('Unknown section');
const headingText=section==='2-plus'?'Bài toán':['1-review','1-principles','2-review'].includes(section)?'Bài tập':section.replace('-','.')+'. Bài tập',count={'1-1':88,'1-2':37,'1-3':71,'1-4':35,'1-5':83,'1-review':38,'1-principles':22,'2-1':9,'2-2':51,'2-3':68,'2-4':44,'2-5':76,'2-6':81,'2-7':60,'2-8':68,'2-review':56,'2-plus':14}[section];
const source=JSON.parse(fs.readFileSync(`data/books/imports/stewart-${section}.json`,'utf8'));
const dom=new JSDOM(source.content),doc=dom.window.document;
if(section==='2-review')for(const wrapper of doc.querySelectorAll('div.samepage'))wrapper.replaceWith(...wrapper.childNodes);
const heading=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x=>x.textContent===headingText);
const nodes=[];for(let x=heading.nextSibling;x&&!/^H[1-6]$/.test(x.nodeName);x=x.nextSibling)nodes.push(x);
const anchors=nodes.flatMap((x,i)=>{const label=x.nodeName==='P'?x.querySelector(':scope > strong')?.textContent:'';const m=/^(\d+)(?:[–−-](\d+))?\./.exec(label||'');return m?[{i,a:+m[1],b:+(m[2]||m[1]),node:x}]:[];});
// Exercises 5–8 are numbered only inside the original shared image.
if(section==='1-5'){
 const i=nodes.findIndex(x=>x.querySelector?.('img[src$="/e05_08.png"]'));
 if(i<0)throw Error('Missing shared figure for exercises 5–8');
 anchors.push({i,a:5,b:8,node:nodes[i]});anchors.sort((a,b)=>a.i-b.i);
}
const html=x=>x.outerHTML??x.textContent,exercises=[];let group;
for(const [j,entry]of anchors.entries()){
 const {i,a,b,node}=entry;const end=anchors[j+1]?.i??nodes.length;
 let content=nodes.slice(i,end).map(html).join('').trim();
 if(a!==b){
  if(anchors[j+1]&&anchors[j+1].a>=a&&anchors[j+1].a<=b){group={a,b,content};continue;}
  for(let n=a;n<=b;n++){
   const panels=section==='1-5'?{5:'hình trên bên trái (nhãn 5)',6:'hình trên bên phải (nhãn 6)',7:'hình dưới bên trái (nhãn 7)',8:'hình dưới bên phải (nhãn 8)',33:'hình bên trái',34:'hình bên phải'}:section==='1-4'?{19:'hình bên trái',20:'hình bên phải'}:section==='1-3'?{6:'hình bên trái',7:'hình bên phải'}:section==='1-2'?{11:'hình bên trái',12:'hình bên phải',27:'hai biểu đồ ở hàng trên',28:'hai biểu đồ ở hàng dưới'}:{15:'đường cong thứ nhất',16:'đường cong thứ hai',17:'đường cong thứ ba',18:'đường cong thứ tư',63:'hình bên trái',64:'hình bên phải',77:'hình bên trái',78:'hình bên phải',79:'hình phía trên',80:'hình phía dưới'};const panel=panels[n];
   if(!panel)throw Error('Unreviewed shared figure '+n);
   exercises.push({number:n,content:(group&&n>=group.a&&n<=group.b?group.content:'')+`<p><strong>Bài tập ${n} — ${panel}.</strong></p>`+content});
  }if(!(section==='1-5'&&group&&b<group.b))group=null;
 }else{
  if(group&&a>=group.a&&a<=group.b)content=group.content+content;
  if(section==='1-1'&&a===5)content+=doc.querySelector('img[src$="/f01.png"]').parentElement.parentElement.outerHTML;
  if(section==='1-3'){
   for(const name of ({8:['f04','f06'],27:['f09']}[a]||[]))content+=doc.querySelector(`img[src$="/${name}.png"]`).parentElement.parentElement.outerHTML;
   if(a===64)content+='<p>Định nghĩa ở Bài 63: <span class="math inline">\\(H(t)=\\begin{cases}0 &amp; t&lt;0,\\\\1 &amp; t\\ge0.\\end{cases}\\)</span></p>';
  }
  if(section==='1-4'){
   for(const name of (a>=9&&a<=14?['f03','f15']:a===31?['f11']:[]))content+=doc.querySelector(`img[src$="/${name}.png"]`).parentElement.parentElement.outerHTML;
  }
  if(section==='1-5'){
   if(a===53||a===54)for(const name of ['f12','f13'])content+=doc.querySelector(`img[src$="/${name}.png"]`).parentElement.parentElement.outerHTML;
   if(a>=47&&a<=50)content+='<p><strong>Công thức 11 — Đổi cơ số.</strong> Với <span class="math inline">\\(b&gt;0,\\ b\\ne1,\\ x&gt;0\\)</span>: <span class="math display">\\[\\log_b x=\\frac{\\ln x}{\\ln b}.\\]</span></p>';
  }
  if(section==='2-3'){
   if(a>=55&&a<=57)content+='<p><strong>Ký hiệu trong Ví dụ 10.</strong> Hàm phần nguyên của x là số nguyên lớn nhất không vượt quá x.</p>';
   if(a===50)content+='<p><strong>Định nghĩa hàm dấu.</strong> sgn(u) = −1 khi u &lt; 0; sgn(u) = 0 khi u = 0; sgn(u) = 1 khi u &gt; 0.</p>';
  }
  if(section==='2-4'){
   if(a>=15&&a<=18)content+=doc.querySelector('img[src$="/f09.png"]').parentElement.parentElement.outerHTML;
   if(a===38)content+='<p><strong>Hàm Heaviside ở §2.2.</strong> H(t) = 0 khi t &lt; 0; H(t) = 1 khi t ≥ 0.</p>';
  }
  if(section==='2-5'&&(a===66||a===67)){
   const formula=[...doc.querySelectorAll('p')].find(p=>p.textContent.includes('\\tag{6}'));
   if(!formula)throw Error('Missing formula 6');
   content+='<p><strong>Công thức (6).</strong></p>'+formula.outerHTML;
  }
  if(section==='2-6'&&a>=60&&a<=64)content+=doc.querySelector('img[src$="/f13.png"]').parentElement.parentElement.outerHTML;
  if(section==='2-7'&&[3,4,21,22].includes(a)){
   const number=a<=4?2:5;
   const formula=[...doc.querySelectorAll('p')].find(p=>p.textContent.includes('\\tag{'+number+'}'));
   if(!formula)throw Error('Missing formula '+number);
   content+=`<p><strong>Công thức (${number}).</strong></p>`+formula.outerHTML;
  }
  if(section==='2-8'&&a===60)content+='<p><strong>Hàm phần nguyên.</strong> Giá trị tại x là số nguyên lớn nhất không vượt quá x.</p>';
  if(section==='2-review'&&a===56)content+='<p><strong>Hàm phần nguyên.</strong> Giá trị tại x là số nguyên lớn nhất không vượt quá x.</p>';
  if(section==='2-plus'&&a>=5&&a<=7)content+='<p><strong>Hàm phần nguyên.</strong> Giá trị tại x là số nguyên lớn nhất không vượt quá x.</p>';
  exercises.push({number:a,content});
 }
}
if(exercises.length!==count||exercises.some((e,i)=>e.number!==i+1))throw Error('Missing/duplicate exercise');
fs.writeFileSync(`data/books/exercises/stewart-${section}.json`,JSON.stringify({bookKey:'stewart-9',sectionKey:section,heading:headingText,sourceSha256:source.sourceInfo.sha256,exercises},null,2)+'\n');
dom.window.close();console.log(`Prepared ${count} exercises for ${section}.`);

