import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { getCatalogTotals, HOME_EXAM_CATEGORIES } from '../lib/home-stats.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const tstLinks = Array.from({ length: 25 }, (_, i) =>
  `<a class="nav-link" href="#tst-static-${i + 1}"></a>`).join('');
const regionalLinks = Array.from({ length: 15 }, (_, i) =>
  `<a class="nav-link" href="#hist-dn-static-${i + 1}"></a>`).join('');
const mockLinks = Array.from({ length: 2 }, (_, setIndex) =>
  Array.from({ length: 2 }, (_, dayIndex) =>
    `<a class="nav-link" href="#mock-set${setIndex + 1}-day${dayIndex + 1}"></a>`).join('')).join('');
const chapters = Array.from({ length: 9 }, (_, i) =>
  `<section class="chapter-block" data-chapter="${i + 1}"></section>`).join('');
const theory = '<div class="theorybox"></div>'.repeat(39);

const dom = new JSDOM(`<!doctype html><html><body>
  <span data-catalog-stat="tst"></span>
  <span data-catalog-stat="regional"></span>
  <span data-catalog-stat="chapters"></span>
  <span data-catalog-stat="theory"></span>
  <span data-catalog-stat="examples"></span>
  <span data-catalog-stat="mock"></span>
  <span data-catalog-stat="mockSets"></span>
  <span data-catalog-stat="support"></span>
  <span data-catalog-stat="vmo"></span>
  <span data-catalog-stat="olympic"></span>
  <span data-catalog-stat="olympic30"></span>
  <span data-catalog-stat="duyenhai"></span>
  <nav id="sidebar-tst">${tstLinks}</nav>
  <nav id="sidebar-history">${regionalLinks}</nav>
  <nav id="sidebar-mock">${mockLinks}</nav>
  <main id="book-content">
    <section class="chapter-block" data-chapter="meta"></section>
    ${chapters}${theory}
  </main>
</body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });

const { window } = dom;
window.scrollTo = () => {};
window.VMODataService = {
  getHomeStats: async () => ({
    specialtyExamples: 78,
    standaloneProblems: 1234,
    supportScope: 'all',
    examCounts: { 'vmo-mock': 8, 'tst-national': 620, 'history-dn-qn': 17, 'vmo-official': 32, 'imo-olympic': 104, 'olympic-30-4': 14, 'duyen-hai-bac': 12 },
    exams: [
      { category: 'tst-national', targetAnchor: 'tst-static-1' }, // trùng catalog tĩnh
      ...Array.from({ length: 7 }, (_, i) => ({ category: 'tst-national', targetAnchor: `tst-dynamic-${i + 26}` })),
      { category: 'history-dn-qn', targetAnchor: 'hist-dn-static-1' }, // trùng catalog tĩnh
      { category: 'history-dn-qn', targetAnchor: 'hist-qn-dynamic-16' },
      { category: 'vmo-mock', targetAnchor: 'mock-set1-day1' }, // trùng catalog tĩnh
      { category: 'vmo-mock', targetAnchor: 'mock-set3-day1' },
      { category: 'vmo-mock', targetAnchor: 'mock-set4-day2' },
      { category: 'vmo-mock', targetAnchor: 'mock-set5-day1' }
    ]
  })
};
window.eval(appSource);
await window.refreshVMOCatalogStats();

const value = key => window.document.querySelector(`[data-catalog-stat="${key}"]`).textContent;
assert.equal(value('tst'), '620', 'Counts above the legacy 500-row metadata limit remain complete');
assert.equal(value('regional'), '17', 'Count exam papers rather than unique sidebar anchors');
assert.equal(value('chapters'), '09', 'không tính khối metadata là chương');
assert.equal(value('theory'), '39', 'phải đếm đúng mục lý thuyết thực tế');
assert.equal(value('examples'), '78', 'số ví dụ có lời giải trên MongoDB phải là nguồn chính thức');
assert.equal(value('mock'), '08', 'Each mock exam day counts as a paper; sets remain separate');
assert.equal(value('mockSets'), '04', 'dashboard phải dùng số bộ đề thi thử trong MongoDB');

const apiSource = fs.readFileSync(path.join(root, 'api/data.js'), 'utf8');
assert.match(apiSource, /resource === 'home_stats'/, 'API phải có tài nguyên thống kê nhẹ');
assert.match(apiSource, /projection:[\s\S]*targetAnchor:[\s\S]*setNumber:[\s\S]*dayNumber:/,
  'API thống kê không được tải toàn bộ nội dung đề/câu hỏi');
assert.match(apiSource, /sourceType: 'specialty_example'[\s\S]*referenceSolution:/,
  'API phải đếm ví dụ có lời giải trực tiếp trên MongoDB');

const templateSource = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
assert.doesNotMatch(templateSource, /<script[^>]+(?:tst-sources|history-sources)\.js/,
  'trang không được tải bản đồ nguồn tham khảo JS cũ');
const builtPage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const builtDom = new JSDOM(builtPage, { runScripts: 'outside-only', url: 'https://example.test/' });
assert.equal(builtDom.window.document.querySelectorAll('[data-fragment-url]').length, 0,
  'build không được yêu cầu tải fragment HTML');
for (const tab of ['mock', 'tst', 'history']) {
  assert.equal(builtDom.window.document.querySelectorAll(`#tab-${tab} .exam-card`).length, 0,
    'card đề tĩnh không được đưa vào trang: ' + tab);
  assert.equal(builtDom.window.document.querySelectorAll(`#sidebar-${tab} a.nav-link`).length, 0,
    'mục lục đề chỉ được tạo từ MongoDB: ' + tab);
}
assert.doesNotMatch(builtPage, /<script[^>]+(?:tst-sources|history-sources)\.js/,
  'build không được nạp tệp nguồn tham khảo JS cũ');
assert.equal(builtDom.window.document.querySelectorAll('.hero-stats .stat-chip').length, 8);
assert.deepEqual([...builtDom.window.document.querySelectorAll('.hero-stats [data-catalog-stat]')].map(node => node.dataset.catalogStat), ['mock', 'support', 'tst', 'vmo', 'olympic', 'regional', 'olympic30', 'duyenhai']);
assert.match(builtDom.window.document.querySelector('.hero h1').textContent, /Chinh phục Toán chuyên cùng Gia sư AI/);
assert.doesNotMatch(builtDom.window.document.querySelector('.hero').textContent, /Trần Hoàng Kiên|Phan Châu Trình/);
for (const [key, expected] of Object.entries({ support: '1234', vmo: '32', olympic: '104', olympic30: '14', duyenhai: '12' })) assert.equal(value(key), expected);

const calls = [];
const db = { collection(name) { return {
  aggregate(pipeline) { calls.push({ name, pipeline }); return { toArray: async () => [{ _id: 'tst-national', count: 620 }, { _id: 'vmo-mock', count: 8 }] }; },
  async countDocuments(filter) { calls.push({ name, filter }); return 1234; }
}; } };
const adminTotals = await getCatalogTotals(db, { role: 'admin', sub: 'admin' });
assert.equal(adminTotals.examCounts['tst-national'], 620);
assert.equal(adminTotals.examCounts['duyen-hai-bac'], 0, 'Empty catalogs have a real zero');
assert.equal(adminTotals.standaloneProblems, 1234);
assert.equal(adminTotals.supportScope, 'all');
assert.deepEqual(calls[0].pipeline[0].$match.category.$in, HOME_EXAM_CATEGORIES);
assert.equal(calls[0].pipeline.some(stage => stage.$limit), false, 'Totals are never truncated by catalog pagination');
assert.deepEqual(calls[0].pipeline[0].$match.status, { $ne: 'deleted' });
assert.equal(calls[1].filter.ownerId, undefined);
calls.length = 0;
const ownTotals = await getCatalogTotals(db, { role: 'student', sub: 'member-42' });
assert.equal(ownTotals.supportScope, 'own');
assert.equal(calls[0].pipeline[0].$match.status, 'published');
assert.deepEqual(calls[1].filter, { sourceGroup: 'math_support', status: 'published', ownerId: 'member-42' });
window.VMODataService.getHomeStats = async () => { throw new Error('offline'); };
window.console.warn = () => {};
await window.refreshVMOCatalogStats();
assert.equal(value('tst'), '—', 'Unavailable counts must not look like an empty catalog');
window.close();
builtDom.window.eval(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'));
for (const language of ['en', 'vi', 'en', 'vi']) {
  builtDom.window.setLanguage(language);
  const page = builtDom.window.document;
  assert.equal(page.querySelectorAll('[data-hero-stat-label]').length, 8);
  assert.equal(page.querySelector('[data-hero-stat-label="support"]').textContent, language === 'en' ? '🧩 Problem-solving support' : '🧩 Hỗ trợ giải toán');
  assert.match(page.title, /MathApp/);
  assert.doesNotMatch(page.querySelector('.hero').textContent, /Trần Hoàng Kiên|VMO ĐÀ NẴNG 2026/);
}
builtDom.window.close();
console.log('catalog-stats tests passed');
