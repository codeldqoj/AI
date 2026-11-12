import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const locationsSource = fs.readFileSync(new URL('tst-locations.js', root), 'utf8');
const uiSource = fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="sidebar-tst"><div class="nav-year-group"><div class="nav-year-title">TST</div></div></div>
  <div id="sidebar-vmo"><div class="nav-year-group"><div class="nav-year-title">VMO</div></div></div>
  <div id="sidebar-olympic"><div class="nav-year-group"><div class="nav-year-title">IMO–Olympic</div></div></div>
  <div id="sidebar-mock"><nav class="book-toc"></nav></div>
  <div id="sidebar-history"><div class="nav-year-group"><div class="nav-year-title">📙 QUẢNG NAM</div></div><div class="nav-year-group"><div class="nav-year-title">📘 ĐÀ NẴNG</div></div></div>
  <div id="tab-mock"><div class="feed-container"></div></div>
  <div id="tab-tst"><div class="feed-container"></div></div>
  <div id="tab-vmo"><div class="feed-container"></div></div>
  <div id="tab-olympic"><div class="feed-container"></div></div>
  <div id="vmoFilterPills"><button class="pill" data-filter="ALL"></button></div>
  <div id="olympicFilterPills"><button class="pill" data-filter="ALL"></button></div>
  <div id="tab-history"><div class="feed-container"></div></div>
  <div id="mockFilterPills"><button class="pill" data-filter="ALL"></button></div>
  <div id="historyFilterPills"><button class="pill" data-filter="ALL"></button><button class="pill" data-filter="DANANG"></button><button class="pill" data-filter="QUANGNAM"></button></div>
  <div id="dataHubModal">
    <div class="vmo-modal-body">
      <div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div>
      <div id="hub-panel-events"><div id="hubEventsList"></div></div>
      <div id="hub-panel-docs"><div id="hubDocsList"></div></div>
      <div id="hub-panel-exams"><div id="hubExamsList"></div></div>
      <form id="formAddDoc" style="display:none"></form>
      <form id="formAddExam" style="display:none"></form>
    </div>
  </div>
</body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });

const { window } = dom;
window.CSS ||= {};
window.CSS.escape ||= value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
window.VMOAuth = { getSession: () => ({ role: 'admin', username: 'admin' }) };
window.confirm = () => true;
window.alert = () => {};
window.VMODataService = {
  getCatalogProblems: async () => [],
  getContentSets: async () => [],
  getEvents: async () => [],
  getDocuments: async () => [],
  getExams: async () => [],
  getExamCatalog: async category => ['vmo-official', 'imo-olympic'].includes(category) ? [{
    id: category === 'vmo-official' ? 'vmo-exam' : 'olympic-exam',
    examKey: `${category}:2026-2027:day-1`, category,
    targetAnchor: category === 'vmo-official' ? 'vmo-vmo-2026-2027' : 'olympic-imo-2026-2027',
    province: category === 'vmo-official' ? 'VMO' : 'IMO', year: '2026-2027', dayNumber: 1,
    title: category === 'vmo-official' ? 'Đề VMO' : 'Đề IMO',
    problems: [{ contentKey: `${category}:question-1`, questionNumber: 1, content: 'Bài toán Olympic' }]
  }] : category === 'vmo-mock' ? [{
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb', examKey: 'mock:set-3:2026-2027:day-1',
    targetAnchor: 'mock-set3-day1', setNumber: 3, province: 'Đà Nẵng', year: '2026-2027', dayNumber: 1, title: 'Bộ 3',
    problems: [{ contentKey: 'mock:mock-set3-day1:question-1', questionNumber: 1, content: 'Đề thử' }]
  }, ...[[2, 2], [5, 1], [1, 2], [2, 1], [1, 1], [4, 1], [3, 2]].map(([setNumber, dayNumber]) => ({
    id: `mock-${setNumber}-${dayNumber}`, targetAnchor: `mock-set${setNumber}-day${dayNumber}`,
    setNumber, dayNumber, title: `Bộ ${setNumber}`,
    problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }))] : category === 'history-dn-qn' ? [{
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa', examKey: 'regional:da-nang:2026-2027:day-1',
    targetAnchor: 'hist-dn-2026-2027', province: 'Đà Nẵng', provinceOrder: 1,
    region: 'TRUNG', title: 'Đề Đà Nẵng 2026–2027', year: '2026-2027', dayNumber: 1,
    problems: [{ contentKey: 'danang_quangnam:hist-dn-2026-2027:day-1:question-1', questionNumber: 1,
      sourceGroup: 'danang_quangnam', sourceType: 'regional_question', content: 'Bài toán Đà Nẵng' }]
  }, ...[['Quảng Nam', '2017-2018', 'qn'], ['Đà Nẵng', '2015-2016', 'dn'],
    ['Quảng Nam', '2015-2016', 'qn'], ['Đà Nẵng', '2014-2015', 'dn']].map(([province, year, short]) => ({
    id: `regional-${short}-${year}`, targetAnchor: `hist-${short}-${year}`,
    province, year, region: 'TRUNG', title: `Đề ${province} ${year}`,
    problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }))] : [{
    id: 'exam-quang-tri', examKey: 'tst:quang-tri:2026-2027:day-1',
    targetAnchor: 'tst-quang-tri', province: 'Quảng Trị', provinceOrder: 21,
    region: 'TRUNG', title: 'Đề TST Quảng Trị', year: '2026-2027', dayNumber: 1,
    problems: [
      { contentKey: 'tst:tst-quang-tri:day-1:question-1', questionNumber: 1, content: 'Bài toán thử nghiệm',
        shortLabel: 'Câu 1 Đa thức – Dãy số', topic: 'Đa thức – Dãy số', maxScore: 5 },
      { contentKey: 'tst:tst-quang-tri:day-1:question-2', questionNumber: 2, content: 'Bài toán khác',
        shortLabel: 'Câu 2 (5,0đ) Phương trình hàm', topic: 'Phương trình hàm (5đ) Phương trình hàm' }
    ]
  }, {
    id: 'exam-thai-nguyen', examKey: 'tst:thai-nguyen:2026-2027:day-1',
    targetAnchor: 'tst-thai-nguyen', province: 'Tỉnh THÁI NGUYÊN', provinceOrder: 10,
    region: 'BAC', title: 'Đề Thái Nguyên', problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }, {
    id: 'exam-chuyen-khtn', examKey: 'tst:chuyen-khtn:2026-2027:day-1',
    targetAnchor: 'tst-chuyen-khtn', province: 'Tỉnh CHUYÊN KHTN HÀ NỘI', provinceOrder: 26,
    region: 'BAC', title: 'Đề Chuyên KHTN', problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }, {
    id: 'exam-hung-yen', examKey: 'tst:hung-yen:2026-2027:day-1',
    targetAnchor: 'tst-hung-yen', province: 'Tỉnh Hưng Yên', provinceOrder: 14,
    region: 'BAC', title: 'Đề Hưng Yên', problems: [{ contentKey: 'tst:tst-hung-yen:question-1', questionNumber: 1, content: 'Đề thử' }]
  }]
};
const detailRequests = [];
const summaryRequests = [];
window.VMODataService.getExamCatalogSummary = async category => {
  summaryRequests.push(category);
  return (await window.VMODataService.getExamCatalog(category)).map(({ problems, ...exam }) => ({
    ...exam, problemCount: problems.length
  }));
};
window.VMODataService.getExamCatalogDetail = async (category, anchor) => {
  detailRequests.push(`${category}:${anchor}`);
  return (await window.VMODataService.getExamCatalog(category)).filter(exam => exam.targetAnchor === anchor);
};
window.eval(locationsSource);
window.eval(uiSource);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
let fullTabTypesets = 0;
window.renderMathInContainer = async () => { fullTabTypesets += 1; };

assert.equal(window.VMO_TST_LOCATIONS.filter(item => item.type === 'province').length, 34);
assert.equal(window.VMO_TST_LOCATIONS.filter(item => item.type === 'university_school').length, 4);

window.openDataHubModal();
assert.equal(window.document.getElementById('btnSyncContentCatalog'), null);
assert.equal(window.syncContentCatalogToDatabase, undefined);
window.toggleAddDocForm();
const select = window.document.getElementById('docTargetAnchor');
assert.equal(window.document.getElementById('docDayNumber').options.length, 4);
assert.deepEqual(Array.from(window.document.getElementById('docDestination').options).map(option => option.value), ['tst', 'vmo', 'olympic', 'olympic30', 'duyenhai', 'admission', 'university', 'regional']);
for (const destination of ['vmo', 'olympic']) {
  window.document.getElementById('docDestination').value = destination;
  window.syncDocumentDestination(true);
  assert.equal(window.document.getElementById('docCompetitionWrap').style.display, 'block');
  assert.equal(window.document.getElementById('docCompetition').required, true);
  assert.equal(window.document.getElementById('docTargetAnchor').required, false);
  assert.equal(window.document.getElementById('docProvince').value, destination === 'vmo' ? 'VMO' : 'IMO');
}
window.document.getElementById('docDestination').value = 'regional';
window.syncDocumentDestination();
assert.equal(window.document.getElementById('docRegionalTargetWrap').style.display, 'block');
assert.equal(select.required, false);
window.document.getElementById('docRegionalUnit').value = 'qn';
window.syncRegionalExamTarget();
assert.equal(window.document.getElementById('docProvince').value, 'Quảng Nam');
assert.equal(window.document.getElementById('docRegion').value, 'TRUNG');
window.document.getElementById('docDestination').value = 'tst';
window.syncDocumentDestination();
window.toggleAddExamForm();
assert.equal(window.document.getElementById('examDayNumber').options.length, 2);
assert.equal(window.document.getElementById('examSetNumber').value, '3');
assert.equal(select.options.length, 38, 'Dropdown phải đủ 34 tỉnh/thành và 4 trường chuyên đại học');
assert.deepEqual(Array.from(select.querySelectorAll('optgroup')).map(group => group.label), [
  '34 tỉnh/thành phố',
  'Trường chuyên trực thuộc đại học'
]);

select.value = 'tst-quang-tri';
window.syncExamProvinceFromTarget('doc');
assert.equal(window.document.getElementById('docProvince').value, 'Quảng Trị');
assert.equal(window.document.getElementById('docRegion').value, 'TRUNG');
assert.equal(window.document.getElementById('docRegionDisplay').value, 'Miền Trung');

await window.loadDatabaseTstExams(true);
assert.deepEqual(detailRequests, ['tst-national:tst-chuyen-khtn'], 'Lần mở tab chỉ tải chi tiết đề đầu tiên theo thứ tự');
await window.loadDatabaseCompetitionExams('tab-vmo');
await window.loadDatabaseCompetitionExams('tab-olympic');
for (const [category, tab, anchor] of [['vmo-official', 'vmo', 'vmo-vmo-2026-2027'], ['imo-olympic', 'olympic', 'olympic-imo-2026-2027']]) {
  assert.ok(window.document.querySelector(`#tab-${tab} #${anchor} .problem-item`), `${category} tải câu hỏi từ MongoDB`);
  assert.ok(window.document.querySelector(`#sidebar-${tab} a[href="#${anchor}"]`), `${category} có mục lục`);
  assert.ok(detailRequests.includes(`${category}:${anchor}`));
}
const newCard = window.document.getElementById('tst-quang-tri');
assert.ok(newCard, 'Đề của tỉnh mới phải tự tạo card frontend');
assert.equal(newCard.dataset.filter, 'TRUNG');
await window.loadDatabaseExamDetail('tst-national', 'tst-quang-tri');
const [firstQuestion, secondQuestion] = newCard.querySelectorAll('.problem-item');
assert.equal(firstQuestion.querySelector('.problem-id span:first-child').textContent, 'Câu 1 Đa thức – Dãy số');
assert.equal(firstQuestion.querySelector('.badge-topic').textContent, 'Đa thức – Dãy số');
assert.equal(firstQuestion.querySelector('.badge-topic').style.display, 'none', 'ẩn chuyên đề đã có trong nhãn');
assert.equal(firstQuestion.querySelector('.problem-header').textContent.match(/Đa thức – Dãy số/g).length, 2,
  'DOM giữ metadata chuyên đề cho AI');
assert.equal(secondQuestion.querySelector('.problem-id span:first-child').textContent, 'Câu 2 Phương trình hàm');
assert.equal(secondQuestion.querySelector('.badge-point').textContent.trim(), '(5đ)');
assert.equal(secondQuestion.querySelector('.badge-topic').textContent, 'Phương trình hàm');
assert.equal(secondQuestion.querySelector('.badge-topic').style.display, 'none');
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-tst a.nav-link'), link => link.textContent), [
  '01. CHUYÊN KHTN HÀ NỘI', '02. Hưng Yên', '03. Quảng Trị', '04. THÁI NGUYÊN'
], 'Tên bỏ tiền tố Tỉnh, sắp theo chữ cái tiếng Việt và đánh số lại');
assert.equal(window.document.querySelector('#tst-hung-yen .problem-item'), null, 'Đề khác chỉ có metadata');
const hungYenPlaceholder = window.document.getElementById('tst-hung-yen');
await window.loadDatabaseExamDetail('tst-national', 'tst-hung-yen');
assert.equal(window.document.getElementById('tst-hung-yen'), hungYenPlaceholder, 'Chi tiết được gắn vào card đã hiện');
assert.ok(window.document.querySelector('#tst-hung-yen .problem-item'), 'Chọn đề sẽ tải câu hỏi');
await window.loadDatabaseExamDetail('tst-national', 'tst-hung-yen');
assert.equal(detailRequests.filter(key => key === 'tst-national:tst-hung-yen').length, 1, 'Chi tiết đã tải được tái sử dụng');
await window.loadDatabaseTstExams(true);
assert.equal(window.document.querySelectorAll('#sidebar-tst a[href="#tst-quang-tri"]').length, 1);
assert.equal(window.document.querySelector('#sidebar-tst a[href="#tst-quang-tri"]').textContent, '03. Quảng Trị');
await window.loadDatabaseMockExams(true);
assert.equal(window.document.querySelector('#mockFilterPills [data-filter="ALL"]').textContent, 'Tất cả đề thử (8 buổi)');
assert.equal(detailRequests.filter(key => key.startsWith('vmo-mock:')).length, 1,
  'Mở tab thi thử chỉ lấy chi tiết một đề');
assert.ok(window.document.getElementById('mock-set3-day1'));
assert.ok(window.document.querySelector('#sidebar-mock a[href="#mock-set3-day1"]'));
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-mock .nav-year-title'), x => x.textContent),
  [1, 2, 3, 4, 5].map(n => `🎯 BỘ THI THỬ SỐ ${n}`));
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-mock a.nav-link'), x => x.getAttribute('href')),
  ['#mock-set1-day1', '#mock-set1-day2', '#mock-set2-day1', '#mock-set2-day2',
    '#mock-set3-day1', '#mock-set3-day2', '#mock-set4-day1', '#mock-set5-day1']);
await window.loadDatabaseMockExams(true);
assert.equal(window.document.querySelectorAll('#sidebar-mock a.nav-link').length, 8);
await window.loadDatabaseRegionalExams(true);
assert.deepEqual(Array.from(window.document.querySelectorAll('#historyFilterPills .pill'), pill => pill.textContent),
  ['Tất cả 5 đề', 'Đà Nẵng (3)', 'Quảng Nam (2)']);
assert.equal(detailRequests.filter(key => key.startsWith('history-dn-qn:')).length, 1,
  'Mở tab khu vực chỉ lấy chi tiết một đề');
const regionalCard = window.document.getElementById('hist-dn-2026-2027');
assert.ok(regionalCard, 'Đề lưu trữ mới phải tự tạo card trong tab Đà Nẵng–Quảng Nam');
assert.equal(regionalCard.dataset.filter, 'DANANG');
assert.equal(regionalCard.querySelector('.problem-item').dataset.sourceType, 'regional_question');
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-history .nav-year-title'), x => x.textContent),
  ['📘 ĐÀ NẴNG', '📙 QUẢNG NAM']);
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-history a.nav-link'), x => x.getAttribute('href')),
  ['#hist-dn-2014-2015', '#hist-dn-2015-2016', '#hist-dn-2026-2027',
    '#hist-qn-2015-2016', '#hist-qn-2017-2018']);
assert.equal(window.document.querySelector('#sidebar-history a[href="#hist-dn-2026-2027"]').textContent,
  '03. Đà Nẵng 2026–2027');
await window.loadDatabaseRegionalExams(true);
assert.equal(window.document.querySelectorAll('#sidebar-history a.nav-link').length, 5);
const initialCatalog = window.VMODataService.getExamCatalog;
window.VMODataService.getExamCatalog = async category => category === 'tst-national'
  ? [...await initialCatalog(category), ...[
    ['tst-ptnk', 'PTNK TP.HCM', [1, 2]],
    ['tst-truong-he-danang', 'TRƯỜNG HÈ ĐÀ NẴNG', [1, 2]],
    ['tst-khtn', 'CHUYÊN KHTN HÀ NỘI', [1, 2, 3, 4]]
  ].flatMap(([anchor, province, days]) => days.map(dayNumber => ({
    id: `${anchor}-${dayNumber}`, examKey: `tst-national:${anchor}:day-${dayNumber}`,
    targetAnchor: anchor, province, dayNumber, region: 'BAC', title: province,
    problems: [{ contentKey: `tst:${anchor}:day-${dayNumber}:question-1`,
      questionNumber: 1, content: `Đề ngày ${dayNumber}` }]
  }))), {
    id: 'hanoi-full', examKey: 'tst:hanoi:2026-2027:day-1',
    targetAnchor: 'tst-ha-noi', province: 'HÀ NỘI', dayNumber: 1, region: 'BAC',
    problems: Array.from({ length: 8 }, (_, index) => ({
      contentKey: `tst:hanoi:full:${index + 1}`, questionNumber: index + 1, content: `Câu ${index + 1}`
    }))
  }, {
    id: 'hanoi-extra', examKey: 'tst:hanoi:duplicate:day-1',
    targetAnchor: 'tst-ha-noi', province: 'HÀ NỘI', dayNumber: 1, region: 'BAC',
    problems: [6, 7].map(number => ({
      contentKey: `tst:hanoi:extra:${number}`, questionNumber: number, content: `Câu trùng ${number}`
    }))
  }] : initialCatalog(category);
await window.loadDatabaseTstExams(true);
await window.loadDatabaseExamDetail('tst-national', 'tst-ha-noi');
assert.equal(window.document.querySelectorAll('#tst-ha-noi .db-exam-day').length, 1,
  'Hà Nội chỉ hiển thị một khối ngày thứ 1 dù Atlas có hai bản ghi');
assert.deepEqual(Array.from(window.document.querySelectorAll('#tst-ha-noi .problem-item'),
  item => Number(item.dataset.questionNumber)), [1, 2, 3, 4, 5, 6, 7, 8]);
for (const [anchor, expectedDays] of [
  ['tst-ptnk', [1, 2]], ['tst-truong-he-danang', [1, 2]], ['tst-khtn', [1, 2, 3, 4]]
]) {
  await window.loadDatabaseExamDetail('tst-national', anchor);
  assert.deepEqual(Array.from(window.document.querySelectorAll(`#${anchor} .db-exam-day`),
    section => Number(section.dataset.dayNumber)), expectedDays, `${anchor} phải có đủ ngày theo thứ tự`);
  assert.equal(window.document.querySelectorAll(`#sidebar-tst a[href="#${anchor}"]`).length, 1,
    'Mỗi địa phương chỉ có một liên kết sidebar');
}
const scrollTargets = [];
async function waitForScroll(count) {
  const deadline = Date.now() + 3000;
  while (scrollTargets.length < count && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(scrollTargets.length >= count, `Expected ${count} completed sidebar scrolls`);
}
window.HTMLElement.prototype.scrollIntoView = function(options) { scrollTargets.push({ id: this.id, options }); };
window.requestAnimationFrame = callback => setTimeout(callback, 0);
const originalDetail = window.VMODataService.getExamCatalogDetail;
let releaseThaiNguyen;
const thaiNguyenGate = new Promise(resolve => { releaseThaiNguyen = resolve; });
window.VMODataService.getExamCatalogDetail = async (category, anchor) => {
  if (anchor === 'tst-thai-nguyen') await thaiNguyenGate;
  return originalDetail(category, anchor);
};
const thaiNguyenLink = window.document.querySelector('#sidebar-tst a[href="#tst-thai-nguyen"]');
const firstClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
thaiNguyenLink.dispatchEvent(firstClick);
assert.equal(firstClick.defaultPrevented, true, 'Ngăn browser cuộn vào placeholder trước khi tải');
assert.deepEqual(scrollTargets, [], 'Không cuộn trước khi dữ liệu về');
releaseThaiNguyen();
await waitForScroll(1);
assert.deepEqual(scrollTargets.map(target => target.id), ['tst-thai-nguyen'], 'Một lần nhấp cuộn đúng đề sau khi tải');
assert.equal(scrollTargets[0].options.behavior, 'instant', 'Cuộn tức thời, không kế thừa smooth scrolling');
assert.equal(window.location.hash, '#tst-thai-nguyen');
thaiNguyenLink.click();
await waitForScroll(2);
assert.deepEqual(scrollTargets.map(target => target.id), ['tst-thai-nguyen', 'tst-thai-nguyen'], 'Nhấp lại đề đã tải vẫn cuộn đúng');
let releaseHungYen;
const hungYenGate = new Promise(resolve => { releaseHungYen = resolve; });
window.VMODataService.getExamCatalogDetail = async (category, anchor) => {
  if (anchor === 'tst-hung-yen') await hungYenGate;
  return originalDetail(category, anchor);
};
window.document.querySelector('#sidebar-tst a[href="#tst-hung-yen"]').click();
window.document.querySelector('#sidebar-tst a[href="#tst-ptnk"]').click();
releaseHungYen();
await waitForScroll(3);
assert.equal(scrollTargets.at(-1).id, 'tst-ptnk', 'Nhấp liên tiếp ưu tiên mục mới nhất');
assert.equal(window.location.hash, '#tst-ptnk');
for (const [sidebar, category, anchor] of [
  ['sidebar-history', 'history-dn-qn', 'hist-qn-2017-2018'],
  ['sidebar-mock', 'vmo-mock', 'mock-set5-day1']
]) {
  let releaseDetail;
  const detailGate = new Promise(resolve => { releaseDetail = resolve; });
  window.VMODataService.getExamCatalogDetail = async (requestedCategory, requestedAnchor) => {
    if (requestedCategory === category && requestedAnchor === anchor) await detailGate;
    return originalDetail(requestedCategory, requestedAnchor);
  };
  const link = window.document.querySelector(`#${sidebar} a[href="#${anchor}"]`);
  assert.ok(link, `Sidebar ${sidebar} có liên kết ${anchor}`);
  const priorScrolls = scrollTargets.length;
  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true, `${sidebar}: chặn cuộn vào placeholder`);
  assert.equal(scrollTargets.length, priorScrolls, `${sidebar}: chờ dữ liệu trước khi cuộn`);
  releaseDetail();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(scrollTargets.length, priorScrolls + 1, `${sidebar}: cuộn đúng một lần`);
  assert.equal(scrollTargets.at(-1).id, anchor);
  assert.equal(scrollTargets.at(-1).options.behavior, 'instant');
  assert.equal(scrollTargets.at(-1).options.block, 'start');
  assert.equal(window.location.hash, `#${anchor}`);
  link.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(scrollTargets.at(-1).id, anchor, `${sidebar}: nhấp lại vẫn cuộn đúng`);
}
assert.equal(fullTabTypesets, 0, 'loader MongoDB không được typeset lại toàn bộ tab');

let updatedExam;
let deletedExam;
window.VMODataService.updateExam = async (id, fields) => { updatedExam = { id, ...fields }; return updatedExam; };
window.VMODataService.deleteExam = async id => { deletedExam = id; return true; };
window.VMODataService.getExamCatalogSummary = async category =>
  (await window.VMODataService.getExamCatalog(category)).map(({ problems, ...exam }) => ({ ...exam, problemCount: problems.length }));
window.VMODataService.getExams = category => window.VMODataService.getExamCatalog(category);
window.switchHubTab('docs');
await new Promise(resolve => setTimeout(resolve, 20));
assert.ok(window.document.querySelector('#hubDocsList button[onclick*="editManagedExam"]'),
  'Admin có nút chỉnh sửa đề trong danh sách TST/Đà Nẵng–Quảng Nam');
const docsFilter = window.document.getElementById('hubDocsExamFilter');
docsFilter.querySelector('.exam-query').value = 'quang nam';
docsFilter.querySelector('.exam-query').dispatchEvent(new window.Event('input', { bubbles: true }));
assert.equal(Array.from(window.document.querySelectorAll('#hubDocsList .hub-managed-exam'))
  .filter(row => row.style.display !== 'none').length, 2, 'Tìm kiếm không dấu lọc đúng đề Quảng Nam');
docsFilter.querySelector('.exam-query').value = '';
docsFilter.querySelector('.exam-category').value = 'tst-national';
docsFilter.querySelector('.exam-category').dispatchEvent(new window.Event('change', { bubbles: true }));
assert.ok(Array.from(window.document.querySelectorAll('#hubDocsList .hub-managed-exam'))
  .filter(row => row.style.display !== 'none').every(row => row.dataset.examCategory === 'tst-national'));
docsFilter.querySelector('.exam-category').value = '';
docsFilter.querySelector('.exam-category').dispatchEvent(new window.Event('change', { bubbles: true }));
window.editManagedExam('aaaaaaaaaaaaaaaaaaaaaaaa');
const examEditor = window.document.getElementById('managedExamEditor');
assert.ok(examEditor);
examEditor.elements.title.value = 'Đề Đà Nẵng đã sửa';
assert.equal(examEditor.elements.year.value, '2026-2027');
examEditor.elements.year.value = '2024-2025';
examEditor.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(updatedExam.title, 'Đề Đà Nẵng đã sửa');
assert.equal(updatedExam.year, '2024-2025');
assert.equal(updatedExam.id, 'aaaaaaaaaaaaaaaaaaaaaaaa');
await window.deleteManagedExam('aaaaaaaaaaaaaaaaaaaaaaaa');
assert.equal(deletedExam, 'aaaaaaaaaaaaaaaaaaaaaaaa');
window.switchHubTab('exams');
await new Promise(resolve => setTimeout(resolve, 20));
assert.ok(summaryRequests.includes('vmo-mock'), 'Admin mock-exam list uses the lightweight catalog summary endpoint');
assert.ok(window.document.querySelector('#hubExamsList button[onclick*="editManagedExam"]'),
  'Admin có nút quản lý bộ đề thi thử');
const mockFilter = window.document.getElementById('hubMockExamFilter');
mockFilter.querySelector('.exam-query').value = 'bo 3';
mockFilter.querySelector('.exam-query').dispatchEvent(new window.Event('input', { bubbles: true }));
assert.equal(Array.from(window.document.querySelectorAll('#hubExamsList .hub-managed-exam'))
  .filter(row => row.style.display !== 'none').length, 2, 'Tìm bộ số 3 sau khi bỏ dấu');
mockFilter.querySelector('.exam-day').value = '2';
mockFilter.querySelector('.exam-day').dispatchEvent(new window.Event('change', { bubbles: true }));
assert.equal(Array.from(window.document.querySelectorAll('#hubExamsList .hub-managed-exam'))
  .filter(row => row.style.display !== 'none').length, 1);
window.switchHubTab('exams');
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(Array.from(window.document.querySelectorAll('#hubExamsList .hub-managed-exam'))
  .filter(row => row.style.display !== 'none').length, 1, 'Giữ bộ lọc sau khi nạp lại danh sách');
mockFilter.querySelector('.exam-query').value = '';
mockFilter.querySelector('.exam-day').value = '';
mockFilter.querySelector('.exam-day').dispatchEvent(new window.Event('change', { bubbles: true }));
let newQuestion;
let removedQuestion;
let editedQuestion;
window.VMODataService.getProblemsByExam = async () => [{
  id: 'cccccccccccccccccccccccc', questionNumber: 1, title: 'Câu hiện có', topic: 'Phương trình hàm', maxScore: 5
}];
window.VMODataService.addExamQuestion = async (examId, fields) => { newQuestion = { examId, ...fields }; return newQuestion; };
window.VMODataService.deleteExamQuestion = async (examId, problemId) => { removedQuestion = { examId, problemId }; return true; };
window.VMODataService.updateExamQuestionMetadata = async (examId, problemId, fields) => {
  editedQuestion = { examId, problemId, ...fields }; return editedQuestion;
};
await window.manageExamQuestions('bbbbbbbbbbbbbbbbbbbbbbbb');
const questionPanel = window.document.getElementById('managedQuestionsEditor');
assert.match(questionPanel.querySelector('.managed-questions-list').textContent, /Câu 1 \(5,0đ\) Phương trình hàm/);
questionPanel.querySelector('.managed-questions-list button').click();
const metadataForm = questionPanel.querySelector('.edit-exam-question');
metadataForm.elements.maxScore.value = '4.5';
metadataForm.elements.topic.value = 'Số học';
metadataForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 30));
assert.deepEqual(editedQuestion, { examId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  problemId: 'cccccccccccccccccccccccc', topic: 'Số học', maxScore: 4.5 });
const addQuestionForm = questionPanel.querySelector('.add-exam-question');
addQuestionForm.elements.questionNumber.value = '2';
addQuestionForm.elements.content.value = 'Nội dung câu 2';
addQuestionForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(newQuestion.examId, 'bbbbbbbbbbbbbbbbbbbbbbbb');
assert.equal(newQuestion.questionNumber, 2);
questionPanel.querySelector('.managed-questions-list button:last-of-type').click();
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(removedQuestion.problemId, 'cccccccccccccccccccccccc');
assert.equal(removedQuestion.examId, 'bbbbbbbbbbbbbbbbbbbbbbbb');

const mathPreview = window.document.createElement('div');
window.document.body.appendChild(mathPreview);
window.MathJax = {
  typesetClear: () => {},
  typesetPromise: async nodes => {
    nodes[0].innerHTML = '<mjx-merror>Math input error</mjx-merror>';
  }
};
const rawFormula = 'Câu hỏi gốc: $\\badcommand{x}$';
window.safeRenderMathJaxToElement(mathPreview, rawFormula);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(mathPreview.textContent, rawFormula, 'công thức lỗi phải hiển thị nguyên bản gốc');
assert.ok(mathPreview.classList.contains('tex2jax_ignore'), 'fallback không bị typeset lại');

const originalSummary = window.VMODataService.getExamCatalogSummary;
const detailBeforeYearTest = window.VMODataService.getExamCatalogDetail;
const historicalTst = {
  id: 'historic-hung-yen', category: 'tst-national', targetAnchor: 'tst-hung-yen',
  province: 'Hưng Yên', year: '2025-2026', dayNumber: 1, region: 'BAC',
  examKey: 'tst:hung-yen:2025-2026:day-1', title: 'Đề Hưng Yên 2025–2026',
  problems: [{ contentKey: 'tst:tst-hung-yen:2025-2026:question-1', questionNumber: 1,
    content: 'Đề của năm cũ' }]
};
window.VMODataService.getExamCatalogSummary = async category => {
  const exams = await originalSummary(category);
  return category === 'tst-national' ? [...exams, { ...historicalTst, problemCount: 1, problems: undefined }] : exams;
};
window.VMODataService.getExamCatalogDetail = async (category, anchor, year) =>
  category === 'tst-national' && anchor === 'tst-hung-yen' && year === '2025-2026'
    ? [historicalTst] : detailBeforeYearTest(category, anchor);
await window.loadDatabaseTstExams(true);
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-tst .nav-year-group[data-year]'),
  group => group.dataset.year), ['2026-2027', '2025-2026']);
assert.ok(window.document.querySelector('#sidebar-tst a[href="#tst-hung-yen--year-2025-2026"]'));
assert.ok(window.document.getElementById('tst-hung-yen--year-2025-2026'));
await window.loadDatabaseExamDetail('tst-national', 'tst-hung-yen--year-2025-2026');
assert.match(window.document.getElementById('tst-hung-yen--year-2025-2026').textContent, /Đề của năm cũ/);
assert.ok(window.document.getElementById('tst-hung-yen'), 'Đề năm hiện tại giữ anchor cũ');

console.log('TST and Đà Nẵng–Quảng Nam dynamic exam smoke test: OK');

window.eval(fs.readFileSync(new URL('ai_guide_engine.js', root), 'utf8'));
// Two grades in the same year remain separate through summary/detail rendering.
for (const [destination, category, label] of [['olympic30', 'olympic-30-4', 'Olympic 30/4'], ['duyenhai', 'duyen-hai-bac', 'Duyên hải miền Bắc']]) {
  const pane = window.document.createElement('div');
  pane.id = `tab-${destination}`;
  pane.className = 'tab-pane';
  pane.innerHTML = '<div class="feed-container"></div>';
  window.document.body.append(pane);
  const sidebar = window.document.createElement('div');
  sidebar.id = `sidebar-${destination}`;
  sidebar.innerHTML = [10, 11].map(grade => `<div class="nav-year-group" data-grade="${grade}"></div>`).join('');
  window.document.body.append(sidebar);
  const exams = [10, 11].map(grade => ({ id: `${destination}-${grade}`, category, grade, year: '2026-2027', province: label,
    targetAnchor: `${destination}-2026-2027-grade-${grade}`, title: label, dayNumber: 1, problemCount: 1,
    problems: [{ contentKey: `${destination}:grade-${grade}:question-1`, questionNumber: 1, content: `Bài toán Lớp ${grade}` }] }));
  window.VMODataService.getExamCatalogSummary = async requested => requested === category ? exams.map(({problems, ...exam}) => exam) : [];
  window.VMODataService.getExamCatalogDetail = async (requested, anchor) => requested === category ? exams.filter(exam => exam.targetAnchor === anchor) : [];
  await window.loadDatabaseCompetitionExams(pane.id);
  for (const exam of exams) {
    await window.loadDatabaseExamDetail(category, exam.targetAnchor);
    const card = window.document.getElementById(exam.targetAnchor);
    assert.equal(card.dataset.filter, `GRADE${exam.grade}`);
    assert.match(card.textContent, new RegExp(`Lớp ${exam.grade}`));
    assert.ok(sidebar.querySelector(`[data-grade="${exam.grade}"] a[href="#${exam.targetAnchor}"]`));
    assert.equal(card.querySelector('.problem-item').dataset.sourceGroup, destination === 'olympic30' ? 'olympic_30_4' : 'duyen_hai_bac');
    assert.ok(card.querySelector('.btn-submit-solution'), 'Uses existing submission flow');
    assert.ok(card.querySelector('.btn-ai-guide'), 'Uses existing AI guide flow');
  }
  window.document.getElementById('docDestination').value = destination;
  window.syncDocumentDestination(true);
  assert.equal(window.document.getElementById('docGradeWrap').style.display, 'block');
  assert.equal(window.document.getElementById('docGrade').required, true);
  assert.equal(window.document.getElementById('docProvince').value, label);
}
console.log('Olympic 30/4 and Northern Coastal grade catalogs: OK');
