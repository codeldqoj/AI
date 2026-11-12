import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Exercise the generated page, where both PRs share tab routing and sidebar state.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://math.test/' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.scrollTo = () => {};
const refreshed = [];
window.reinitDatabaseUI = root => refreshed.push(root.id);
window.reinitAIGuide = () => {};
window.eval(fs.readFileSync(new URL('../admissions.js', import.meta.url), 'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
window.eval(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
const doc = window.document;
assert.ok(doc.querySelector('script[src^="math_support.js"]'));
assert.ok(doc.querySelector('script[src^="admissions.js"]'));
assert.equal(doc.querySelectorAll('.admission-school').length, 81);
assert.equal(doc.querySelectorAll('#supportTopic option[value=""]').length, 1);
assert.ok([...doc.querySelectorAll('#supportTopic option')].some(option => option.value === 'Bất đẳng thức'));
for (const tab of ['support', 'admission', 'support', 'admission']) {
  await window.switchTab(`tab-${tab}`);
  const other = tab === 'support' ? 'admission' : 'support';
  assert.equal(doc.querySelectorAll('.tab-pane.active').length, 1);
  assert.equal(doc.querySelector('.tab-pane.active').id, `tab-${tab}`);
  assert.equal(doc.getElementById(`sidebar-${tab}`).style.display, 'block');
  assert.equal(doc.getElementById(`sidebar-${other}`).style.display, 'none');
  assert.equal(doc.getElementById('sidebar-danang').style.display, 'none');
  assert.equal(doc.getElementById('admissionFilterPills').style.display, tab === 'admission' ? 'flex' : 'none');
}
assert.deepEqual(refreshed, ['tab-support', 'tab-admission', 'tab-support', 'tab-admission']);
window.close();
console.log('Combined catalogs: generated page, 81 schools, seven support topics and repeated tab/sidebar switching: OK');
