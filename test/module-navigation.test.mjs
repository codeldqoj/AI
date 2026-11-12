import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function harness(compact=true) {
  const dom=new JSDOM(html,{url:'https://math.test/',runScripts:'outside-only'}), {window}=dom;
  const media=[];window.matchMedia=query=>{const item={matches:query.includes('960')?compact:false,addEventListener(_,callback){this.change=callback;}};media.push(item);return item;};
  window.scrollTo=()=>{};window.eval(script);
  const doc=window.document;
  return{dom,window,doc,media,toggle:doc.getElementById('moduleNavigationToggle'),nav:doc.getElementById('moduleNavigation')};
}
const h=harness();
assert.equal(h.nav.querySelectorAll('.tab-btn').length,14);assert.equal(h.nav.querySelectorAll('.navigation-group').length,4);
assert.equal(new Set([...h.nav.querySelectorAll('.tab-btn')].map(x=>x.id)).size,14,'One real button per module, no duplicated IDs');
assert.equal(h.nav.hidden,true);h.toggle.click();assert.equal(h.nav.hidden,false);assert.equal(h.toggle.getAttribute('aria-expanded'),'true');
for(const key of ['danang','books','mock','support','admission','tst','vmo','history','olympic','olympic30','duyenhai']){
  if(h.nav.hidden)h.toggle.click();
  const button=h.doc.getElementById('tab-btn-'+key);button.focus();
  await h.window.switchTab('tab-'+key,button);
  if(key==='books')assert.equal(h.doc.getElementById('sidebar-books').style.display,'block');
  assert.equal(h.doc.querySelectorAll('.tab-pane.active').length,1);assert.equal(h.doc.querySelector('.tab-pane.active').id,'tab-'+key);
  assert.equal(h.nav.querySelectorAll('[aria-current="page"]').length,1);assert.equal(button.getAttribute('aria-current'),'page');
  assert.equal(h.doc.getElementById('activeModuleLabel').textContent,button.textContent.trim());
  assert.equal(h.nav.hidden,true);assert.equal(h.doc.activeElement,h.toggle,'Selecting closes chooser and restores visible keyboard focus');
  assert.equal(h.doc.getElementById('tab-'+key).getAttribute('aria-labelledby'),button.id);
}
h.toggle.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(h.nav.hidden,false);assert.equal(h.doc.activeElement.id,'tab-btn-duyenhai');
h.doc.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.nav.hidden,true);assert.equal(h.doc.activeElement,h.toggle);
h.toggle.click();h.doc.getElementById('searchInput').focus();assert.equal(h.nav.hidden,true,'Tabbing out closes the disclosure without trapping focus');
h.toggle.click();h.doc.body.click();assert.equal(h.nav.hidden,true,'Outside click closes chooser');
h.toggle.click();h.media[0].matches=false;h.media[0].change();assert.equal(h.nav.hidden,false,'Desktop exposes all modules even after resizing');
h.media[0].matches=true;h.media[0].change();assert.equal(h.nav.hidden,true);
const before=h.doc.querySelector('.tab-pane.active').id;await h.window.switchTab('tab-missing');assert.equal(h.doc.querySelector('.tab-pane.active').id,before,'Unknown modules do not clear the active page');
await Promise.all(['tst','history','support','admission'].map(key=>h.window.switchTab('tab-'+key)));
assert.equal(h.doc.querySelectorAll('.tab-pane.active').length,1,'Rapid clicks cannot restore older panels after awaiting');assert.equal(h.doc.querySelector('.tab-pane.active').id,'tab-admission');
h.window.eval(fs.readFileSync(new URL('../i18n.js',import.meta.url),'utf8'));
for(const language of ['en','vi','en','vi']){
 h.window.setLanguage(language);
 assert.equal(h.doc.getElementById('activeModuleLabel').textContent,h.doc.getElementById('tab-btn-admission').textContent);
 assert.equal(h.doc.getElementById('moduleNavigationAction').textContent,language==='en'?'Choose section':'Chọn mục');
 assert.equal(h.doc.querySelector('[data-education-level=university]').textContent,language==='en'?'University':'Đại học');
}
// Level chooser exposes one group, preserves all canonical module buttons and shared support.
for(const [level,key] of [['primary','primary'],['lower_secondary','admission'],['upper_secondary','danang'],['university','university-materials']]){
 await h.window.chooseEducationLevel(level);
 assert.equal(h.doc.querySelectorAll('[data-navigation-level]:not([hidden])').length,1);
 assert.equal(h.doc.querySelector('[data-navigation-level]:not([hidden])').dataset.navigationLevel,level);
 assert.equal(h.doc.querySelector('.tab-btn.active').closest('[data-navigation-level]').dataset.navigationLevel,level);
 assert.equal(h.doc.getElementById('tab-btn-support').hidden,false);
}
await h.window.switchTab('tab-books');await h.window.chooseEducationLevel('upper_secondary');await h.window.chooseEducationLevel('university');assert.equal(h.doc.querySelector('.tab-pane.active').id,'tab-books','Return to the last module of a level');
h.window.eval(fs.readFileSync(new URL('../education_access.js',import.meta.url),'utf8'));
let account={role:'student',educationLevels:['lower_secondary','university']};h.window.VMOAuth={getSession:()=>account};h.window.refreshEducationAccess();
assert.equal(h.doc.querySelector('[data-education-level=upper_secondary]').hidden,true);assert.equal(h.doc.getElementById('tab-btn-tst').hidden,true);
await h.window.chooseEducationLevel('upper_secondary');assert.equal(h.doc.querySelector('.tab-pane.active').id,'tab-books','Unauthorized level cannot be opened');
await h.window.chooseEducationLevel('lower_secondary');assert.equal(h.doc.querySelector('.tab-pane.active').id,'tab-admission');
account={role:'student',educationLevels:[]};h.window.refreshEducationAccess();assert.equal(h.doc.getElementById('educationLevelSelect').disabled,true);assert.equal(h.doc.querySelector('.tab-pane.active').id,'tab-pending');
h.window.close();
const desktop=harness(false);assert.equal(desktop.nav.hidden,false);desktop.toggle.click();assert.equal(desktop.nav.hidden,false,'Desktop navigation is always visible');desktop.window.close();
const reading=harness();
reading.doc.querySelector('.nav-tabs-wrapper').getBoundingClientRect=()=>({height:100});
reading.doc.querySelector('.controls-sticky').getBoundingClientRect=()=>({height:70});
reading.doc.getElementById('main-content').getBoundingClientRect=()=>({top:420});
Object.defineProperty(reading.window,'scrollY',{value:250});
let scroll;reading.window.scrollTo=value=>{scroll=value;};
await reading.window.switchTab('tab-tst');
assert.equal(scroll.top,488,'Switching aligns the reading area below the measured sticky controls');
assert.equal(scroll.behavior,'smooth');
reading.window.matchMedia=()=>({matches:true});
await reading.window.switchTab('tab-vmo');
assert.equal(scroll.behavior,'instant','Reduced-motion users do not get animated module scrolling');
reading.window.close();
console.log('Grouped module navigation: all ten routes, disclosure, keyboard/focus, resize, languages and rapid switching: OK');
