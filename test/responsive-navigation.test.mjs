import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const page = new JSDOM(`<!doctype html><html><body>
<div class="nav-tabs-wrapper"><button class="tab-btn active" id="tab-btn-danang">Tài liệu</button><button class="tab-btn" id="tab-btn-tst">TST</button><button class="tab-btn" id="tab-btn-vmo">VMO</button><button class="tab-btn" id="tab-btn-olympic">IMO</button></div>
<div class="controls-sticky"><input id="searchInput"><div id="searchSummary"></div>
<button id="mobileTocToggle" aria-expanded="false">Mục lục</button></div>
<div id="sidebarBackdrop"></div>
<aside id="mainSidebar"><button id="mobileTocClose">Đóng</button>
<div id="sidebar-danang"><a href="#chapter-1">Chương 1</a></div>
<div id="sidebar-mock"></div><div id="sidebar-tst" style="display:none"><a href="#tst-exam">Đề TST</a></div><div id="sidebar-vmo" style="display:none"><a href="#vmo-exam">Đề VMO</a></div><div id="sidebar-olympic" style="display:none"><a href="#olympic-exam">Đề IMO</a></div><div id="sidebar-history"></div></aside>
<div id="mockFilterPills"></div><div id="tstFilterPills"></div><div id="vmoFilterPills"></div><div id="olympicFilterPills"></div><div id="historyFilterPills"></div>
<div class="app-topbar-actions"><button id="accountMenuToggle" aria-expanded="false">Tài khoản</button><div id="userAuthBar"><button>Đăng xuất</button></div></div>
<div class="tab-pane active" id="tab-danang"></div><div class="tab-pane" id="tab-tst"></div><div class="tab-pane" id="tab-vmo"></div><div class="tab-pane" id="tab-olympic"></div>
</body></html>`, { url: 'https://example.test/', runScripts: 'outside-only' });
const { window } = page;
window.matchMedia = () => ({ matches: true, addEventListener() {} });
window.scrollTo = () => {};
window.eval(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
const { document } = window;
const toc = document.getElementById('mobileTocToggle');
const sidebar = document.getElementById('mainSidebar');
toc.click();
assert.equal(sidebar.classList.contains('mobile-open'), true);
assert.equal(toc.getAttribute('aria-expanded'), 'true');
assert.equal(document.activeElement.id, 'mobileTocClose');
const link = document.querySelector('#sidebar-danang a');
let delegatedClick = false;
document.addEventListener('click', event => {
  if (event.target === link) delegatedClick = !event.defaultPrevented;
});
link.click();
assert.equal(delegatedClick, true, 'mục lục vẫn chuyển sự kiện đến luồng tải đề');
assert.equal(sidebar.classList.contains('mobile-open'), false);
toc.click();
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert.equal(sidebar.classList.contains('mobile-open'), false);
document.getElementById('accountMenuToggle').click();
assert.equal(document.getElementById('userAuthBar').classList.contains('mobile-open'), true);
await window.switchTab('tab-tst', document.getElementById('tab-btn-tst'));
assert.equal(document.getElementById('userAuthBar').classList.contains('mobile-open'), false);
assert.equal(document.getElementById('sidebar-tst').style.display, 'block');
for (const name of ['vmo', 'olympic']) {
  await window.switchTab(`tab-${name}`, document.getElementById(`tab-btn-${name}`));
  assert.equal(document.getElementById(`tab-${name}`).classList.contains('active'), true);
  assert.equal(document.getElementById(`sidebar-${name}`).style.display, 'block');
  assert.equal(document.getElementById(`${name}FilterPills`).style.display, 'flex');
  assert.equal(document.getElementById('sidebar-tst').style.display, 'none');
}

const translatedPage = new JSDOM(`<!doctype html><html><body><div class="controls-sticky">
<button id="mobileTocToggle" class="btn-secondary" aria-expanded="false">☰ Mục lục</button>
<button id="printDocumentButton" class="btn-secondary">🖨️ In</button>
</div></body></html>`, { url: 'https://example.test/', runScripts: 'outside-only' });
translatedPage.window.eval(fs.readFileSync(new URL('../i18n.js', import.meta.url), 'utf8'));
const translatedToc = translatedPage.window.document.getElementById('mobileTocToggle');
const translatedPrint = translatedPage.window.document.getElementById('printDocumentButton');
for (const language of ['vi', 'en', 'vi']) {
  translatedPage.window.setLanguage(language);
  assert.equal(translatedToc.textContent, '☰ Mục lục', 'chuyển ngôn ngữ không ghi đè nút mở mục lục');
  assert.equal(translatedPrint.textContent, language === 'en' ? '🖨️ Print' : '🖨️ In');
}
console.log('Responsive navigation: OK');
