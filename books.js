/* Books and independently editable sections; API enforces all permissions. */
(() => {
 const root=document.getElementById('tab-books');if(!root)return;
 const controls=document.getElementById('booksControls'),toc=document.getElementById('booksToc'),content=document.getElementById('booksContent'),editor=document.getElementById('booksEditor'),status=document.getElementById('booksStatus');
 const state={catalog:null,categoryId:'',bookId:'',sectionId:'',detail:null,showDeleted:false,version:0};
 const allowed=()=>window.MathAppEducation?.moduleAllowed(window.VMOAuth?.getSession?.(),'books');
 const admin=()=>window.VMOAuth?.getSession?.()?.role==='admin';
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const button=(label,fn)=>{const el=node('button',label);el.type='button';el.onclick=fn;return el;};
 async function request(query,payload){const response=await fetch(payload?'/api/data':'/api/data?'+new URLSearchParams({resource:'books',...query}),{credentials:'same-origin',cache:'no-store',...(payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Không tải được Sách học.');return data.item;}
 const message=error=>{status.textContent=error.message||String(error);status.append(' ',button('Thử tải lại',()=>window.loadBooks(true)));};
 const category=()=>state.catalog?.categories.find(c=>c.id===state.categoryId);
 const book=()=>state.catalog?.books.find(b=>b.id===state.bookId);
 function selectField(form,name,label,options,value){const wrapper=node('label',label),select=node('select');select.name=name;select.required=name!=='parentId';for(const option of options)select.add(new Option(option.title,option.id));select.value=value||'';wrapper.append(select);form.append(wrapper);return select;}

 // Build a fresh allowlisted DOM; imported HTML never executes scripts or event handlers.
 window.renderBookContent=async function(target,section,typeset=true){
  window.MathJax?.typesetClear?.([target]);target.replaceChildren();target.style.whiteSpace=section.contentFormat==='html-latex'?'normal':'pre-wrap';
  if(section.contentFormat!=='html-latex'){if(window.safeRenderMathJaxToElement)window.safeRenderMathJaxToElement(target,section.content);else target.textContent=section.content;return;}
  const parsed=new DOMParser().parseFromString(section.content||'','text/html');
  const tags=new Set('P DIV SPAN STRONG EM B I BR H1 H2 H3 H4 H5 H6 TABLE THEAD TBODY TFOOT TR TH TD CAPTION UL OL LI BLOCKQUOTE HR FIGURE FIGCAPTION SUP SUB IMG A'.split(' '));
  const forbidden=new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH FORM INPUT BUTTON TEXTAREA SELECT LINK META BASE TEMPLATE'.split(' '));
  function clean(input){
   if(input.nodeType===Node.TEXT_NODE)return document.createTextNode(input.textContent);
   if(input.nodeType!==Node.ELEMENT_NODE||forbidden.has(input.tagName))return document.createDocumentFragment();
   const output=tags.has(input.tagName)?document.createElement(input.tagName.toLowerCase()):document.createDocumentFragment();
   if(output.nodeType===Node.ELEMENT_NODE){
    if(input.id)output.id='books-entry-'+input.id;
    if(input.classList.contains('center'))output.className='book-center';
    if(input.classList.contains('math'))output.className=input.classList.contains('display')?'math display':'math inline';
    if(input.tagName==='IMG'){
     const raw=input.getAttribute('src')||'';let url;try{url=new URL(raw,location.origin);}catch{return document.createDocumentFragment();}
     if(url.origin!==location.origin||url.pathname!=='/api/data'||url.searchParams.get('resource')!=='book_asset'||!/^(?:stewart-1-1-47c33e6c|stewart-1-2-a7a72f38|stewart-1-3-65a41611|stewart-1-4-c1a9f973|stewart-1-5-6c69c192|stewart-1-review-f5f8bf56|stewart-1-principles-06d484fa|stewart-2-1-eee6f638|stewart-2-2-cd4ecf72|stewart-2-3-5ecf7773|stewart-2-4-473b5539|stewart-2-5-47b1887b|stewart-2-6-fbbc38a2|stewart-2-7-8fc77b65|stewart-2-8-09f990f6|stewart-2-review-ee7b7bf5|stewart-2-plus-bd302d07)\/[a-z0-9_]+\.png$/.test(url.searchParams.get('asset')||''))return document.createDocumentFragment();
     output.src=url.pathname+url.search;output.alt=input.getAttribute('alt')||'Hình minh họa';output.loading='lazy';output.style.maxWidth='100%';output.style.height='auto';
    }
    if(['TH','TD'].includes(input.tagName))for(const attr of ['colspan','rowspan']){const n=Number(input.getAttribute(attr));if(Number.isInteger(n)&&n>=1&&n<=30)output.setAttribute(attr,String(n));}
    if(input.tagName==='OL'&&/^\d{1,4}$/.test(input.getAttribute('start')||''))output.start=Number(input.getAttribute('start'));
    if(input.tagName==='A'){const href=input.getAttribute('href')||'';if(href.startsWith('#'))output.href='#books-entry-'+href.slice(1);else if(/^https:\/\//i.test(href)){output.href=href;output.rel='noopener noreferrer';output.target='_blank';}}
   }
   for(const child of input.childNodes)output.append(clean(child));return output;
  }
  for(const child of parsed.body.childNodes)target.append(clean(child));
  if(typeset&&window.MathJax?.typesetPromise)await window.MathJax.typesetPromise([target]);
 };
 async function renderExercises(body,exercises,exerciseHeading){
  if(!exercises?.length)return;
  const heading=[...body.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x=>x.textContent.trim()===exerciseHeading);
  if(!heading)return;
  // Replace only the exercise region, retaining the theory and editorial material.
  for(let x=heading.nextSibling;x&&!/^H[1-6]$/.test(x.nodeName);){const next=x.nextSibling;if(x.nodeType===Node.ELEMENT_NODE)window.MathJax?.typesetClear?.([x]);x.remove();x=next;}
  const list=node('div');list.className='book-exercise-list';heading.after(list);
  window.mongoProblemsByContentKey ||= new Map();window.mongoProblemReferenceLinks ||= new Map();
  for(const problem of exercises){
   window.mongoProblemsByContentKey.set(problem.contentKey,problem);window.mongoProblemReferenceLinks.set(problem.contentKey,problem.referenceLinks||[]);
   const card=node('article');card.className='problem-item book-exercise';card.id='book-exercise-'+problem.id;
   Object.assign(card.dataset,{databaseProblem:'true',contentKey:problem.contentKey,setKey:problem.setKey,setId:String(problem.setId),setTitle:problem.setTitle,sourceGroup:'university_books',sourceType:'book_exercise',contentType:'book_exercises',questionNumber:String(problem.questionNumber),topic:problem.topic});
   const head=node('div');head.className='problem-header';const title=node('div',problem.title);title.className='problem-id';head.append(title);card.append(head);
   const statement=node('div');statement.className='problem-content';statement.setAttribute('data-raw-math',problem.content);card.append(statement);list.append(card);
   await window.renderBookContent(statement,{content:problem.content,contentFormat:problem.contentFormat||'html-latex'},false);statement._renderedMongoContent=problem.content;
  }
  window.reinitDatabaseUI?.(list);window.reinitAIGuide?.(list);
 }
 function showEditor(title,fields,action,initial={},extra={}){
  if(!admin())return;editor.replaceChildren();const form=node('form');form.style.cssText='display:grid;gap:12px;padding:18px;border:1px solid #94a3b8;border-radius:8px;margin:12px 0';form.append(node('h3',title));
  for(const field of fields){if(field.options){selectField(form,field.name,field.label,field.options,initial[field.name]);continue;}const label=node('label',field.label),input=node(field.name==='content'?'textarea':'input');input.name=field.name;input.required=field.required||false;input.maxLength=field.max||300;if(field.name==='order'){input.type='number';input.min='0';input.max='100000';}if(field.name==='content'){input.rows=16;input.style.fontFamily='monospace';}input.style.cssText+=';display:block;width:100%;box-sizing:border-box;padding:9px';input.value=initial[field.name]??'';label.append(input);form.append(label);}
  const error=node('p');error.setAttribute('role','alert');form.append(error);
  if(fields.some(f=>f.name==='content')){const preview=node('div');form.append(button('Xem trước công thức',()=>window.renderBookContent(preview,{content:form.elements.content.value,contentFormat:form.elements.contentFormat.value}).catch(e=>{error.textContent=e.message;})),preview);}
  const save=node('button','Lưu thay đổi');save.type='submit';form.append(save,button('Hủy',()=>editor.replaceChildren()));
  form.onsubmit=async event=>{event.preventDefault();if(!admin())return;save.disabled=true;error.textContent='';const payload={...extra,...(initial.id?{id:initial.id,expectedVersion:initial.version}:{})};for(const field of fields)payload[field.name]=field.name==='order'?Number(form.elements[field.name].value):form.elements[field.name].value;
   try{const saved=await request(null,{action,payload});if(action==='books_save_category')state.categoryId=saved.id;if(action==='books_save_book'){state.categoryId=saved.categoryId;state.bookId=saved.id;state.sectionId='';}if(action==='books_save_section')state.sectionId=saved.id;editor.replaceChildren();await window.loadBooks(true);status.textContent='Đã lưu vào cơ sở dữ liệu.';}catch(e){error.textContent=e.message;}finally{save.disabled=false;}};
  editor.append(form);form.querySelector('input,select,textarea')?.focus();
 }
 function categoryEditor(existing){showEditor(existing?'Đổi tên nhóm sách':'Thêm nhóm sách',[{name:'name',label:'Tên nhóm sách *',max:160,required:true}],'books_save_category',existing||{});}
 function bookEditor(existing){showEditor(existing?'Chỉnh sửa sách':'Thêm sách',[{name:'categoryId',label:'Nhóm sách *',options:state.catalog.categories.map(c=>({id:c.id,title:c.name}))},{name:'title',label:'Tên sách *',required:true},{name:'authors',label:'Tác giả'},{name:'edition',label:'Ấn bản',max:120}],'books_save_book',existing||{categoryId:state.categoryId});}
 function sectionEditor(existing){const sections=state.detail?.sections||[];const fields=[{name:'contentFormat',label:'Định dạng nội dung',options:[{id:'plain-latex',title:'Văn bản và LaTeX'},{id:'html-latex',title:'HTML và LaTeX (bảng, hình, công thức)'}]},{name:'title',label:'Tên chương / mục *',required:true},{name:'order',label:'Thứ tự',required:true},{name:'content',label:'Nội dung (văn bản và LaTeX)',max:100000}];if(!existing)fields.unshift({name:'parentId',label:'Mục cha',options:[{id:'',title:'Mục cấp cao nhất'},...sections.filter(s=>s.status==='published').map(s=>({id:s.id,title:s.title}))]});showEditor(existing?'Chỉnh sửa nội dung':'Thêm chương / mục',fields,'books_save_section',existing?{...existing,contentFormat:existing.contentFormat||'plain-latex'}:{contentFormat:'plain-latex',parentId:state.sectionId,order:sections.length+1},{bookId:state.bookId});}
 function renderControls(){controls.replaceChildren();selectField(controls,'category','Nhóm sách',state.catalog.categories.map(c=>({id:c.id,title:c.name})),state.categoryId).onchange=async e=>{state.categoryId=e.target.value;state.bookId='';state.sectionId='';editor.replaceChildren();await window.loadBooks();};
  const books=state.catalog.books.filter(b=>b.categoryId===state.categoryId);selectField(controls,'book','Sách',[{id:'',title:'Chọn sách…'},...books.map(b=>({id:b.id,title:b.title}))],state.bookId).onchange=async e=>{state.bookId=e.target.value;state.sectionId='';editor.replaceChildren();await loadBook();};
  if(admin()){controls.append(button('＋ Thêm nhóm sách',()=>categoryEditor()),button('Đổi tên nhóm',()=>categoryEditor(category())),button('＋ Thêm sách',()=>bookEditor()));if(book())controls.append(button('✏️ Chỉnh sửa sách',()=>bookEditor(book())),button('＋ Thêm chương / mục',()=>sectionEditor()));const label=node('label'),check=node('input');check.type='checkbox';check.checked=state.showDeleted;check.onchange=async()=>{state.showDeleted=check.checked;await loadBook();};label.append(check,' Hiện mục đã xóa');controls.append(label);}
 }
 function renderToc(){toc.replaceChildren();const sections=state.detail?.sections||[];
  const children=parent=>sections.filter(s=>s.parentId===parent).sort((a,b)=>a.order-b.order);
  function add(parent,target,depth=0){if(depth>6)return;for(const section of children(parent)){const item=node('div');item.style.marginLeft='8px';const open=button(`${section.status==='deleted'?'[Đã xóa] ':''}${section.title}`,()=>openSection(section.id));open.style.cssText='display:block;width:100%;text-align:left;white-space:normal;padding:8px';open.setAttribute('aria-current',state.sectionId===section.id?'page':'false');if(children(section.id).length){open.textContent='Đọc nội dung mục này';const details=node('details');details.open=depth===0;const summary=node('summary',section.title);details.append(summary,open);add(section.id,details,depth+1);item.append(details);}else item.append(open);target.append(item);}}
  add('',toc);
 }
 async function openSection(id){const version=++state.version;state.sectionId=id;status.textContent='Đang tải nội dung…';try{const data=await request({bookId:state.bookId,sectionId:id,...(state.showDeleted?{includeDeleted:'1'}:{})});if(version!==state.version)return;renderToc();content.replaceChildren();const section=data.section;content.append(node('h2',data.book.title),node('h3',section.title));if(section.originalTitle)content.append(node('p',section.originalTitle));if(section.printedPage)content.append(node('p',`Trang in: ${section.printedPage}`));
    const body=node('div');body.style.cssText='white-space:pre-wrap;line-height:1.8';content.append(body);if(section.content)await window.renderBookContent(body,section,false);else body.textContent='Chưa có nội dung chi tiết. Admin có thể thêm lý thuyết, ví dụ và bài tập cho mục này.';if(version!==state.version)return;await renderExercises(body,data.exercises,data.exerciseHeading);if(window.MathJax?.typesetPromise)await window.MathJax.typesetPromise([body]);if(version!==state.version)return;content.append(body);
    if(admin()){if(section.status==='deleted')content.append(button('Khôi phục mục và các mục con',()=>changeStatus(section,true)));else content.append(button('✏️ Chỉnh sửa nội dung',()=>sectionEditor(section)),button('🗑️ Xóa mục',()=>changeStatus(section,false)));}
    status.textContent='';}catch(e){if(version===state.version)message(e);}}
 async function changeStatus(section,restore){if(!admin()||!confirm(restore?'Khôi phục mục này và các mục con?':'Xóa mục này và các mục con? Nội dung được giữ để Admin khôi phục.'))return;try{await request(null,{action:restore?'books_restore_section':'books_delete_section',payload:{id:section.id,expectedVersion:section.version}});state.sectionId='';editor.replaceChildren();await loadBook();}catch(e){message(e);}}
 async function loadBook(){const version=++state.version;state.detail=null;toc.replaceChildren();content.replaceChildren();if(!state.bookId){status.textContent='Chưa có sách trong nhóm này. Admin có thể thêm sách mới.';renderControls();return;}status.textContent='Đang tải mục lục…';try{const data=await request({bookId:state.bookId,...(state.showDeleted?{includeDeleted:'1'}:{})});if(version!==state.version)return;state.detail=data;renderControls();renderToc();content.append(node('h2',data.book.title),node('p',`${data.book.authors||''}${data.book.edition?' · '+data.book.edition:''}`));if(data.book.sourceNote)content.append(node('p',data.book.sourceNote));status.textContent=`${data.sections.length} mục trong sách.`;const selected=data.sections.find(s=>s.id===state.sectionId)||data.sections[0];if(selected)await openSection(selected.id);}catch(e){if(version===state.version)message(e);}}
 window.loadBooks=async function(force=false){if(!allowed())return;try{if(!state.catalog||force)state.catalog=await request({});if(!state.catalog.categories.some(c=>c.id===state.categoryId))state.categoryId=state.catalog.categories[0]?.id||'';const books=state.catalog.books.filter(b=>b.categoryId===state.categoryId);if(!books.some(b=>b.id===state.bookId))state.bookId=books[0]?.id||'';renderControls();await loadBook();}catch(e){message(e);}};
})();

