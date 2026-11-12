/* University exam filters share the textbook's stable section IDs. */
(() => {
  const registry=window.MathAppUniversity;
  const select=document.getElementById('universityCourseSelect');
  const sectionSelect=document.getElementById('universitySectionSelect');
  const sidebar=document.getElementById('universityCourseList');
  if(!registry || !select || !sectionSelect || !sidebar)return;
  window.currentUniversityCourse=registry.courses[0].id;
  window.currentUniversitySection='';
  const en=()=>window.currentLang==='en';
  const label=course=>`${course.code}: ${en()?course.name:course.nameVi}`;
  const allLabel=()=>en()?'All topics':'Tất cả chuyên đề';
  const unclassifiedLabel=()=>en()?'Unclassified':'Chưa phân loại';
  const topicList=document.createElement('nav');topicList.id='universitySectionList';
  topicList.style.cssText="margin:6px 0 12px 12px;padding-left:8px;border-left:2px solid #cbd5e1;";
  function refreshSections() {
    const course=registry.course(window.currentUniversityCourse);
    if(!course)return;
    sectionSelect.replaceChildren(new Option(allLabel(),''));
    topicList.replaceChildren();
    topicList.setAttribute('aria-label',en()?'Course topics':'Chuyên đề con của học phần');
    const entries=[{id:'',title:allLabel()},...course.sections.map(s=>({id:s.id,title:`${s.number}. ${s.title}`})),{id:'unclassified',title:unclassifiedLabel()}];
    entries.forEach((entry,index)=>{
      if(index)sectionSelect.add(new Option(entry.title,entry.id));
      const button=document.createElement('button');button.type='button';button.dataset.sectionId=entry.id;
      button.className='university-section-button';button.textContent=entry.title;
      button.style.cssText='display:block;width:100%;text-align:left;margin:4px 0;padding:9px;border:1px solid #cbd5e1;border-radius:6px;background:var(--card-bg,#fff);color:inherit;cursor:pointer;';
      button.onclick=()=>window.selectUniversitySection(entry.id);topicList.appendChild(button);
    });
    sectionSelect.value=window.currentUniversitySection;
    sidebar.querySelector(`.university-course-button[data-course-id="${course.id}"]`)?.after(topicList);
  }
  function loadFirst() {
    const first=[...document.querySelectorAll('#tab-university .exam-card')].find(card=>!card.classList.contains('hidden-by-search'));
    if(first)window.loadDatabaseExamDetail?.('university',first.id)?.catch(()=>{});
  }
  window.refreshUniversityCatalogFilter=function() {
    const course=registry.course(window.currentUniversityCourse);if(!course)return;
    select.value=course.id;sectionSelect.value=window.currentUniversitySection;
    const title=document.getElementById('universityCourseTitle');
    const section=registry.section(course.id,window.currentUniversitySection);
    if(title)title.textContent=`${label(course)}${section?` — ${section.number}. ${section.title}`:window.currentUniversitySection==='unclassified'?` — ${unclassifiedLabel()}`:''}`;
    sidebar.querySelectorAll('.university-course-button').forEach(button=>{
      const active=button.dataset.courseId===course.id;button.setAttribute('aria-pressed',String(active));button.style.fontWeight=active?'800':'400';button.style.borderColor=active?'#2563eb':'#cbd5e1';
    });
    topicList.querySelectorAll('button').forEach(button=>{const active=button.dataset.sectionId===window.currentUniversitySection;button.setAttribute('aria-pressed',String(active));button.style.fontWeight=active?'800':'400';button.style.borderColor=active?'#2563eb':'#cbd5e1';});
    const matches=node=>(node.dataset.courseSections || `${node.dataset.courseId}:${node.dataset.sectionId||'unclassified'}`).split('|').some(value=>{const [courseId,sectionId]=value.split(':');return courseId===course.id&&(!window.currentUniversitySection||sectionId===window.currentUniversitySection);});
    document.querySelectorAll('#universityExamLinks a').forEach(link=>{link.hidden=!matches(link);link.style.display=link.hidden?'none':'';});
    let count=0;
    const norm=value=>String(value||'').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
    const search=norm(document.getElementById('searchInput')?.value).trim();
    document.querySelectorAll('#tab-university .exam-card').forEach(card=>{const visible=matches(card)&&(!search || norm(`${card.dataset.search||''} ${card.textContent}`).includes(search));card.classList.toggle('hidden-by-search',!visible);if(visible)count++;
      card.querySelectorAll('.db-exam-day').forEach(day=>{day.hidden=day.dataset.courseId!==course.id || (!!window.currentUniversitySection && (day.dataset.sectionId||'unclassified')!==window.currentUniversitySection);});
    });
    const root=document.getElementById('tab-university');
    let notice=root?.querySelector('.university-empty');
    if(root?.dataset.universityLoaded==='true') {
      if(!notice){notice=document.createElement('p');notice.className='university-empty';notice.setAttribute('role','status');root.querySelector('.feed-container').appendChild(notice);}
      notice.hidden=count>0;notice.textContent=en()?'No exam matches this course, topic and search.':'Chưa có đề phù hợp với học phần, chuyên đề và nội dung tìm kiếm đã chọn.';
      root.querySelector('.db-catalog-state')?.remove();
    }
  };
  function clearSearch() {const input=document.getElementById('searchInput');if(input){input.value='';input.dispatchEvent(new Event('input'));}}
  window.selectUniversityCourse=function(id,sectionId='') {
    if(!registry.course(id) || (sectionId && sectionId!=='unclassified' && !registry.section(id,sectionId)))return;
    if(window.MathAppEducation && !window.MathAppEducation.moduleAllowed(window.VMOAuth?.getSession?.(),'university'))return;
    window.currentUniversityCourse=id;window.currentUniversitySection=sectionId;
    refreshSections();clearSearch();window.refreshUniversityCatalogFilter();loadFirst();
  };
  window.selectUniversitySection=function(id) {window.selectUniversityCourse(window.currentUniversityCourse,id);};
  function refreshLabels() {
    select.replaceChildren();sidebar.replaceChildren();
    registry.courses.forEach(course=>{
      select.add(new Option(label(course),course.id));
      const button=document.createElement('button');button.type='button';button.className='university-course-button';button.dataset.courseId=course.id;button.textContent=label(course);
      button.style.cssText='display:block;width:100%;text-align:left;padding:10px;margin:3px 0;border:1px solid #cbd5e1;border-radius:7px;background:var(--card-bg,#fff);color:inherit;cursor:pointer;';
      button.onclick=()=>window.selectUniversityCourse(course.id);sidebar.appendChild(button);
    });
    document.querySelectorAll('[data-university-label]').forEach(node=>node.textContent=en()?'University courses':'Các học phần Đại học');
    const courseLabel=document.querySelector('label[for="universityCourseSelect"]');if(courseLabel)courseLabel.textContent=en()?'Choose course':'Chọn học phần';
    const sectionLabel=document.querySelector('label[for="universitySectionSelect"]');if(sectionLabel)sectionLabel.textContent=en()?'Course topic':'Chuyên đề con';
    refreshSections();window.refreshUniversityCatalogFilter();
  }
  let catalogLoaded=false,catalogPending=null;
  window.applyUniversityCatalog=function(data) {
    registry.installCatalog(data.courses);catalogLoaded=true;
    if(!registry.course(window.currentUniversityCourse)){window.currentUniversityCourse=registry.courses[0].id;window.currentUniversitySection='';}
    refreshLabels();window.dispatchEvent(new Event('universitycatalogchange'));
  };
  window.loadUniversityCatalog=async function(force=false) {
    if(catalogLoaded&&!force)return;
    if(catalogPending)return catalogPending;
    catalogPending=(async()=>{
      const response=await fetch('/api/data?resource=university_catalog',{credentials:'same-origin',cache:'no-store'});
      const body=await response.json();if(!response.ok||!body.success)throw Error(body.error||'Không tải được danh mục Đại học');
      window.applyUniversityCatalog(body.item);
    })().finally(()=>{catalogPending=null;});return catalogPending;
  };
  select.addEventListener('change' ,()=>window.selectUniversityCourse(select.value));
  sectionSelect.addEventListener('change',()=>window.selectUniversitySection(sectionSelect.value));
  window.addEventListener('langchange',refreshLabels);refreshLabels();
})();
