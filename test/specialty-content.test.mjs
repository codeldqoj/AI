import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const fixture = fs.readFileSync(new URL('src/content/tab-danang.html', root), 'utf8');
const ui = fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8');
const dom = new JSDOM(`<!doctype html><html><body>${fixture}</body></html>`, {
  runScripts: 'outside-only', url: 'https://example.test/'
});
const { window } = dom;
window.VMOAuth = { getSession: () => ({ role: 'admin' }) };
window.VMODataService = { getCatalogProblems: async () => [] };
window.MathJax = { typesetPromise: async () => {}, typesetClear: () => {} };
window.eval(ui);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise(resolve => setTimeout(resolve, 0));

const example = window.document.querySelector('.examplebox');
const paragraph = example.querySelector(':scope > p');
const originalHtml = paragraph.innerHTML;
const key = example.dataset.contentKey;
assert.ok(key);

assert.ok(originalHtml.includes('\\(x_1=\\sqrt2\\)'));

// Dữ liệu Mongo cũ bị nhiễm MathJax không được thay nội dung ví dụ tĩnh.
window.mongoProblemsByContentKey = new window.Map([[key, {
  contentKey: key,
  content: 'Cho &lt;span class="math inline"&gt;&lt;mjx-container&gt;broken&lt;/mjx-container&gt;'
}]]);
window.mongoProblemReferenceLinks = new window.Map([[key, []]]);
window.reinitDatabaseUI(window.document.getElementById('tab-danang'));
assert.ok(!paragraph.textContent.includes('<mjx-container>'));

// HTML/LaTeX hợp lệ từ Mongo được dựng thành DOM, không hiện nguyên thẻ span.
const edited = 'Cho <span class="math inline">\\(y=2\\)</span>. Chứng minh mệnh đề.';
window.mongoProblemsByContentKey.get(key).content = edited;
window.reinitDatabaseUI(window.document.getElementById('tab-danang'));
assert.equal(paragraph.querySelector('.math.inline')?.textContent, '\\(y=2\\)');
assert.ok(!paragraph.textContent.includes('<span'));
assert.ok(!paragraph.textContent.includes('mjx-container'));

console.log('Specialty example rendering: OK');
