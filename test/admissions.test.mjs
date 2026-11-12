import { educationDb } from '../lib/education-db.js';
import { allows } from '../lib/education-access.js';
import { handleMathSupport } from '../lib/math-support.js';
import { canAccessProblem, supportVisibility } from '../lib/problem-access.js';
import { SPECIALIZED_SCHOOLS, specializedSchool } from '../lib/specialized-schools.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ObjectId } from 'mongodb';
import { JSDOM } from 'jsdom';

// Execute the real route against isolated collections; never connect to Atlas.
const stores = new Map();
let role = 'admin';
const matches = (doc, query) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object' && !(value instanceof ObjectId)) {
    if ('$ne' in value) return doc[key] !== value.$ne;
    if ('$in' in value) return value.$in.some(item => String(item) === String(doc[key]));
    return true;
  }
  return String(doc[key]) === String(value);
});
const db = { collection(name) {
  if (!stores.has(name)) stores.set(name, []);
  const rows = stores.get(name);
  return {
    async findOne(query) { return rows.find(row => matches(row, query)); },
    async findOneAndUpdate(query, update) {
      let row = rows.find(row => matches(row, query));
      if (!row) { row = { _id: new ObjectId(), ...update.$setOnInsert, ...query }; rows.push(row); }
      Object.assign(row, update.$set);
      return row;
    },
    async bulkWrite(operations) {
      for (const { updateOne } of operations) {
        const { filter, update, upsert } = updateOne;
        let row = rows.find(item => matches(item, filter));
        if (!row && upsert) {
          row = { _id: new ObjectId(), ...update.$setOnInsert, ...filter };
          rows.push(row);
        }
        if (row) Object.assign(row, update.$set);
      }
      return { ok: 1 };
    },
    async updateOne(query, update) {
      const row = rows.find(item => matches(item, query));
      if (row) {
        Object.assign(row, update.$set);
        for (const [key, value] of Object.entries(update.$max || {})) {
          row[key] = Math.max(Number(row[key]) || 0, value);
        }
      }
      return { matchedCount: row ? 1 : 0 };
    },
    async deleteMany() {}, async createIndex() {},
    find(query, options = {}) {
      return { sort() { return this; }, limit() { return this; }, async toArray() {
        return rows.filter(row => matches(row, query)).map(row => options.projection ? Object.fromEntries(Object.entries(row).filter(([key]) => key === '_id' || options.projection[key])) : row);
      } };
    },
    aggregate(pipeline) { return { async toArray() {
      const counts = new Map();
      rows.filter(row => matches(row, pipeline[0].$match)).forEach(row => counts.set(row.examId, (counts.get(row.examId) || 0) + 1));
      return [...counts].map(([_id, count]) => ({ _id, count }));
    } }; }
  };
} };
const source = fs.readFileSync(new URL('../api/data.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async function handler', 'async function handler');
const handler = new Function('educationDb', 'allows', 'handleMathSupport', 'canAccessProblem', 'supportVisibility', 'specializedSchool', 'getDb', 'getSession', 'ObjectId', 'recordActivity', `${source}\nreturn handler;`)(
  educationDb, allows,   handleMathSupport, canAccessProblem, supportVisibility, specializedSchool, async () => db, () => ({ role, username: 'tester' }), ObjectId, async () => {});
async function call(payload, query, action = 'create_exam_from_ocr') {
  const res = { code: 0, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: query ? 'GET' : 'POST', query, body: { action, payload } }, res);
  return res;
}
const directory = JSON.parse(fs.readFileSync(new URL('../data/specialized-schools.json', import.meta.url)));
assert.equal(SPECIALIZED_SCHOOLS.length, 81);
assert.equal(new Set(SPECIALIZED_SCHOOLS.map(school => school.id)).size, 81);
assert.equal(new Set(SPECIALIZED_SCHOOLS.map(school => school.province)).size, 34);
assert.equal(SPECIALIZED_SCHOOLS.filter(school => school.kind === 'university').length, 8);
for (const school of SPECIALIZED_SCHOOLS) {
  assert.match(school.id, /^[a-z0-9-]+$/);
  assert.ok(school.sourceIds.every(id => directory.sources[id]), `Missing source for ${school.name}`);
}
const dn = SPECIALIZED_SCHOOLS.filter(school => school.province === 'Đà Nẵng');
assert.equal(dn.length, 3);
const makePayload = (school, year = '2026-2027', dayNumber = 1) => ({
  destination: 'admission', schoolId: school.id, province: school.province, year, dayNumber,
  region: school.region, targetAnchor: `admission-${school.id}-${year}`, sourceImageCount: 1,
  questions: [{ questionNumber: 1, content: 'Chứng minh $a^2+b^2\\ge2ab$.', topic: 'Bất đẳng thức', maxScore: 5 }]
});
const created = [];
for (const school of [...dn, SPECIALIZED_SCHOOLS.find(school => school.name.includes('Khoa học Tự nhiên'))]) {
  const response = await call(makePayload(school));
  assert.equal(response.code, 201);
  assert.equal(response.body.item.schoolId, school.id);
  assert.equal(response.body.item.schoolName, school.name);
  assert.equal(response.body.item.problems[0].sourceGroup, 'specialized_admission');
  assert.equal(response.body.item.problems[0].schoolId, school.id);
  created.push(response.body.item);
}
assert.equal(new Set(created.map(exam => exam.examKey)).size, 4, 'Schools in the same province never overwrite each other');
assert.equal((await call(makePayload(dn[0]))).code, 409);
assert.equal((await call(makePayload(dn[0], '2025-2026'))).code, 201);
assert.equal((await call(makePayload(dn[0], '2026-2027', 2))).code, 201);
for (const override of [{ schoolId: 'unknown' }, { province: 'Hà Nội' }, { targetAnchor: 'tst-da-nang' }, { year: 'invalid' }]) {
  assert.equal((await call({ ...makePayload(dn[0]), ...override })).code, 400);
}
role = 'student';
assert.equal((await call(makePayload(dn[1]))).code, 403);
const summary = await call(null, { resource: 'exam_catalog', category: 'specialized-admission', view: 'summary' });
assert.equal(summary.code, 200); assert.equal(summary.body.items.length, 6);
assert.ok(summary.body.items.every(exam => exam.schoolId && exam.schoolName && exam.problemCount === 1));
assert.equal((await call(null, { resource: 'exam_catalog', category: 'tst-national', view: 'detail', anchor: created[0].targetAnchor })).code, 404);
const detail = await call(null, { resource: 'exam_catalog', category: 'specialized-admission', view: 'detail', anchor: created[0].targetAnchor });
assert.equal(detail.body.items.length, 2); assert.equal(detail.body.items[0].problems.length, 1);
role = 'admin';

// Actual registry, tab, catalog renderer, actions and school selector in a DOM.
const template = fs.readFileSync(new URL('../src/template.html', import.meta.url), 'utf8')
 .replace('<!-- INJECT:SPECIALIZED_SCHOOL_REGISTRY -->', `<script id="specialized-school-registry" type="application/json">${JSON.stringify(directory)}</script>`);
const dom = new JSDOM(template, { runScripts: 'outside-only', url: 'https://example.test/' });
const { window } = dom;
window.CSS ||= {}; window.CSS.escape ||= value => String(value);
window.VMOAuth = { getSession: () => ({ username: 'tester', role: 'admin' }) };
window.matchMedia = () => ({ matches: false, addEventListener() {} }); window.scrollTo = () => {};
window.alert = () => {}; window.confirm = () => true;
window.document.body.insertAdjacentHTML('beforeend', '<div id="sidebar-danang"></div><div class="tab-pane" id="tab-admission"><div class="feed-container"></div></div><div id="dataHubModal"><div class="vmo-modal-body"><div class="hub-tabs"></div><div id="hub-panel-events"><div id="hubEventsList"></div></div><div id="hub-panel-docs"><div id="hubDocsList"></div></div><form id="formAddDoc" style="display:none"></form><form id="formAddExam" style="display:none"></form></div></div>');
const detailRequests = [];
window.VMODataService = {
 getExamCatalog: async category => category === 'specialized-admission' ? created : [],
 getExamCatalogSummary: async category => category === 'specialized-admission' ? (await call(null, {resource:'exam_catalog', category, view:'summary'})).body.items : [],
 getExamCatalogDetail: async (category, anchor) => { detailRequests.push({category, anchor}); return (await call(null, {resource:'exam_catalog', category, anchor, view:'detail'})).body.items; },
 getCatalogProblems: async () => [], getContentSets: async () => [], getEvents: async () => [], getDocuments: async () => [], getExams: async () => []
};
window.eval(fs.readFileSync(new URL('../tst-locations.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../admissions.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../vmo_db_ui.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../ai_guide_engine.js', import.meta.url), 'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
window.eval(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
await window.switchTab('tab-admission');
await window.loadDatabaseCompetitionExams('tab-admission');
assert.equal(window.document.querySelectorAll('.admission-province').length, 34);
assert.equal(window.document.querySelectorAll('.admission-school').length, 81);
assert.equal(window.document.getElementById('sidebar-admission').style.display, 'block');
assert.equal(window.document.getElementById('sidebar-danang').style.display, 'none');
const card = window.document.getElementById(created[0].targetAnchor);
assert.ok(card); assert.ok(card.querySelector('.problem-item'));
assert.ok(card.querySelector('.btn-submit-solution')); assert.ok(card.querySelector('.btn-ai-guide'));
assert.ok(card.querySelector('.btn-copy'));
assert.ok(card.querySelector('.btn-manage-reference-links'));
window.document.querySelector('#admissionFilterPills [data-filter="BAC"]').click();
assert.equal(card.classList.contains('hidden-by-search'), true);
window.document.querySelector('#admissionFilterPills [data-filter="TRUNG"]').click();
assert.equal(card.classList.contains('hidden-by-search'), false);
const mainSearch = window.document.getElementById('searchInput');
mainSearch.value = 'không tồn tại'; mainSearch.dispatchEvent(new window.Event('input'));
mainSearch.value = ''; mainSearch.dispatchEvent(new window.Event('input'));
assert.equal(window.document.getElementById(created[3].targetAnchor).classList.contains('hidden-by-search'), true, 'Clearing text search preserves the selected region');
window.document.querySelector('#admissionFilterPills [data-filter="ALL"]').click();
const schoolGroup = [...window.document.querySelectorAll('.admission-school')].find(group => group.dataset.schoolId === dn[0].id);
assert.equal(schoolGroup.querySelectorAll('a').length, 2, 'Two school years form two distinct links');
const search = window.document.getElementById('admissionSchoolSearch');
search.value = 'Đà Nẵng'; search.dispatchEvent(new window.Event('input'));
assert.equal(window.document.querySelectorAll('.admission-school:not([hidden])').length, 3);
search.value = 'PTNK'; search.dispatchEvent(new window.Event('input')); // No invented aliases are assumed.
search.value = 'Năng khiếu'; search.dispatchEvent(new window.Event('input'));
assert.equal(window.document.querySelectorAll('.admission-school:not([hidden])').length, 2);
window.openDataHubModal(); window.toggleAddDocForm();
window.document.getElementById('docDestination').value = 'admission'; window.syncDocumentDestination(true);
assert.equal(window.document.getElementById('docAdmissionWrap').style.display, 'block');
const select = window.document.getElementById('docSchoolId');
assert.equal(select.options.length, 82); assert.equal(select.required, true);
select.value = dn[1].id; window.syncAdmissionSchool();
assert.equal(window.document.getElementById('docProvince').value, 'Đà Nẵng');
assert.equal(window.document.getElementById('docRegion').value, 'TRUNG');

// Admin image upload -> real UI OCR request -> reviewed editor -> real create route -> saved image.
window.document.getElementById('docYear').value = '2024-2025';
let ocrRequest, savedImages;
window.Image = class { width = 100; height = 100; set src(value) { this.onload(); } };
window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,YQ==';
Object.defineProperty(window.document.getElementById('docImages'), 'files', { value: [new window.File(['png'], 'exam.png', {type:'image/png'})] });
window.fetch = async (url, options) => {
  assert.equal(url, '/api/ai-ocr-exam'); ocrRequest = JSON.parse(options.body);
  return {ok:true, json:async () => ({success:true, data:{examTitle:'Đề toán vào lớp 10 chuyên',confidence:'high', questions:[{questionNumber:1, content:'Chứng minh $a^2+b^2\\ge2ab$.',topic:'Bất đẳng thức',maxScore:5}]}})};
};
window.VMODataService.createExamFromOcr = async payload => {
  const response = await call(payload);
  assert.equal(response.code, 201); return response.body.item;
};
window.VMODataService.saveExamImages = async (examId, images) => {
  const imagePages = images.map((image, index) => ({ pageNumber: index + 1, image }));
  const response = await call({ examId, images: imagePages }, null, 'save_exam_images');
  assert.equal(response.code, 200);
  savedImages = [examId, imagePages];
};
await window.runExamOcr('doc');
assert.equal(ocrRequest.destination, 'admission'); assert.equal(ocrRequest.schoolName, dn[1].name);
assert.equal(window.document.getElementById('docSaveButton').disabled, false);
await window.handleCreateDocument({preventDefault(){},target:window.document.getElementById('formAddDoc')});
const savedExam = stores.get('exams').find(exam => exam.schoolId === dn[1].id && exam.year === '2024-2025');
assert.ok(savedExam); assert.equal(String(savedImages[0]), String(savedExam._id));
assert.deepEqual(Array.from(savedImages[1], item => item.pageNumber), [1]);
assert.equal(savedImages[1][0].image, 'data:image/jpeg;base64,YQ==');
assert.equal(stores.get('exam_images').filter(item => String(item.examId) === String(savedExam._id)).length, 1);
assert.ok(window.document.getElementById(savedExam.targetAnchor), 'Fresh upload appears in the new tab after refresh');
assert.ok(detailRequests.every(request => request.category === 'specialized-admission'));

const imageBatches = [];
window.fetch = async (url, options) => {
  assert.ok(url.startsWith('/api/data'));
  if (options.method === 'POST') imageBatches.push(JSON.parse(options.body));
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, item: { hasImage: true }, items: [] })
  };
};
const dispatchEvent = window.dispatchEvent.bind(window);
window.dispatchEvent = event => ['vmo:data-changed', 'vmo:data-service-ready'].includes(event.type)
  ? true
  : dispatchEvent(event);
window.eval(fs.readFileSync(new URL('../vmo_data_service.js', import.meta.url), 'utf8').replace(/^export /gm, ''));
const largeImage = `data:image/jpeg;base64,${'A'.repeat(1_200_000)}`;
await window.VMODataService.saveExamImages('exam-id', [largeImage, largeImage, largeImage, largeImage]);
assert.equal(imageBatches.length, 2, 'Source image pages are grouped into size-limited requests');
assert.deepEqual(imageBatches.map(batch => batch.payload.images.map(item => item.pageNumber)), [[1, 2], [3, 4]]);

window.close();
console.log('Specialized grade-10 admissions: 34 provinces/81 schools, scoped API, school/year/day identities, sidebar, actions and admin upload: OK');
