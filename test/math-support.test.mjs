import { educationDb } from '../lib/education-db.js';
import { allows } from '../lib/education-access.js';
import { MATH_SUPPORT_TOPICS } from '../lib/math-support-topics.js';
import { normalizeStandaloneMath } from '../lib/ocr-normalization.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { JSDOM } from 'jsdom';
import { handleMathSupport } from '../lib/math-support.js';
import { canAccessProblem, supportVisibility } from '../lib/problem-access.js';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
import { sourceFresh } from '../lib/rag-core.js';
import { getCatalogTotals } from '../lib/home-stats.js';
import { cleanGeometryDiagram } from '../lib/geometry-diagram.js';
import { handleAiError } from '../lib/ai.js';

const malformedLiveOcr = String.raw`BÀI TOÁN KIỂM THỬ MATHAPP\\\\Cho hai số thực a và b. Chứng minh rằng:\$$a^2 + b^2 \ge 2ab.$-\\\-Khi nào đẳng thức xảy ra?`;
const repairedOcr = normalizeStandaloneMath(malformedLiveOcr);
const escapedNewlines = String.raw`BÀI TOÁN KIỂM THỬ MATHAPP\n` + '\nCho hai số thực $a$ và $b$. Chứng minh rằng:\n' + String.raw`\n$$a^2 + b^2 \ge 2ab.$$\n` + '\nKhi nào đẳng thức xảy ra?';
const repairedNewlines = normalizeStandaloneMath(escapedNewlines);
assert.equal(repairedNewlines.includes(String.raw`\n`), false, 'Live OCR literal newline escapes must become real line breaks');
assert.match(repairedNewlines, /\$\$a\^2/);
assert.equal(repairedOcr, 'BÀI TOÁN KIỂM THỬ MATHAPP\nCho hai số thực a và b. Chứng minh rằng:$$a^2 + b^2 \\ge 2ab.$$\nKhi nào đẳng thức xảy ra?');
for (const statement of [String.raw`$x$$y$`, String.raw`Cho $a,b\in\mathbb R$. Chứng minh $$a^2+b^2\ge2ab.$$`, String.raw`$$\begin{aligned}a&=b\\c&=d\end{aligned}$$`]) {
  assert.equal(normalizeStandaloneMath(statement), statement, 'Preserve already balanced math and aligned line breaks');
}

const ocrSource = fs.readFileSync(new URL('../api/ai-ocr-math.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async function handler', 'async function handler');
let ocrTopic = MATH_SUPPORT_TOPICS[0], ocrOptions, openAiOcrOptions, failGeminiOcr = false, failOpenAiOcr = false;
const ocrRoute = new Function('allows', 'MATH_SUPPORT_TOPICS', 'normalizeStandaloneMath', 'getSession', 'checkRateLimit', 'prepare', 'parseBody', 'text', 'generateJson', 'generateOpenAIJson', 'handleAiError', `${ocrSource}\nreturn handler;`)(
  allows,   MATH_SUPPORT_TOPICS, normalizeStandaloneMath, () => ({ username: 'tester' }), () => true, () => {}, req => req.body,
  value => String(value || ''), async options => {
    ocrOptions = options;
    if (failGeminiOcr) { const error = new Error('AI_TIMEOUT'); error.code = 'AI_TIMEOUT'; throw error; }
    return { model: 'fixture', data: { latexText: malformedLiveOcr, summary: 'test', confidence: 'high', topic: ocrTopic } };
  }, async options => {
    openAiOcrOptions = options;
    if (failOpenAiOcr) { const error = new Error('OPENAI_HTTP_429'); error.code = 'OPENAI_HTTP_429'; error.status = 429; throw error; }
    return { model: 'openai-fixture', data: { latexText: malformedLiveOcr, summary: 'fallback', confidence: 'medium', topic: ocrTopic } };
  }, handleAiError);
const ocrResponse = { status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
await ocrRoute({ method: 'POST', body: { image: 'data:image/png;base64,iVBORw0KGgo=', purpose: 'standalone_problem' } }, ocrResponse);
assert.equal(ocrResponse.code, 200); assert.equal(ocrResponse.body.data.latexText, repairedOcr);
assert.equal(ocrOptions.timeoutMs, 45_000, 'Handwritten math OCR gets a realistic Gemini request budget');
assert.equal(ocrOptions.totalTimeoutMs, 45_000);

for (const topic of [...MATH_SUPPORT_TOPICS, 'Đại số', undefined]) {
  ocrTopic = topic;
  await ocrRoute({ method: 'POST', body: { image: 'data:image/png;base64,iVBORw0KGgo=', purpose: 'standalone_problem' } }, ocrResponse);
  assert.equal(ocrResponse.body.data.topic, MATH_SUPPORT_TOPICS.includes(topic) ? topic : '');
  assert.deepEqual(ocrOptions.schema.properties.topic.enum, [...MATH_SUPPORT_TOPICS, '']);
  assert.ok(ocrOptions.schema.required.includes('topic'));
  assert.match(ocrOptions.contents.parts[1].text, /đồng dư/);
  assert.match(ocrOptions.contents.parts[1].text, /Cauchy–Schwarz/);
}
await ocrRoute({ method: 'POST', body: { image: 'data:image/png;base64,iVBORw0KGgo=' } }, ocrResponse);
assert.equal(ocrOptions.schema.properties.topic, undefined, 'Submission OCR keeps its original response schema');
failGeminiOcr = true;
await ocrRoute({ method: 'POST', body: { image: 'data:image/png;base64,iVBORw0KGgo=', purpose: 'standalone_problem' } }, ocrResponse);
assert.equal(ocrResponse.code, 200, 'A failed Gemini OCR attempt falls back to vision OCR');
assert.equal(ocrResponse.body.source, 'openai-fallback');
assert.equal(openAiOcrOptions.imageDataUrl, 'data:image/png;base64,iVBORw0KGgo=');
assert.equal(openAiOcrOptions.timeoutMs, 60_000);
assert.equal(ocrResponse.body.data.latexText, repairedOcr);
failOpenAiOcr = true;
await ocrRoute({ method: 'POST', body: { image: 'data:image/png;base64,iVBORw0KGgo=', purpose: 'standalone_problem' } }, ocrResponse);
assert.equal(ocrResponse.code, 503);
assert.match(ocrResponse.body.error, /quá tải hoặc hết hạn mức/);
assert.equal(ocrResponse.body.code, 'OPENAI_HTTP_429');
failGeminiOcr = false; failOpenAiOcr = false;

// Isolated database with real BSON identities and the operators used by the routes.
const rows = new Map();
let failImageOnce = false;
function match(row, query = {}) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => match(row, part));
    if (key === '$and') return value.every(part => match(row, part));
    const actual = key.split('.').reduce((item, path) => item?.[path], row);
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      if ('$regex' in value) return new RegExp(value.$regex, value.$options).test(actual || '');
      return Object.entries(value).every(([op, operand]) => {
        if (op === '$ne') return String(actual) !== String(operand);
        if (op === '$in') return operand.some(item => String(item) === String(actual));
        if (op === '$exists') return (actual !== undefined) === operand;
        throw new Error(`Unsupported operator ${op}`);
      });
    }
    return String(actual) === String(value);
  });
}
const cursor = items => ({ items: items.slice(), sort(spec) { this.items.sort((a,b) => { for (const [key, dir] of Object.entries(spec)) { if (a[key] > b[key]) return dir; if (a[key] < b[key]) return -dir; } return 0; }); return this; },
  skip(n) { this.items = this.items.slice(n); return this; }, limit(n) { this.items = this.items.slice(0,n); return this; }, async toArray() { return this.items; } });
const db = { collection(name) {
  if (!rows.has(name)) rows.set(name, []);
  const items = rows.get(name);
  function update(query, changes, options = {}) {
    let row = items.find(item => match(item, query));
    if (!row && options.upsert) { row = { _id: new ObjectId(), ...query, ...changes.$setOnInsert }; items.push(row); }
    if (!row) return null;
    Object.assign(row, changes.$set); return row;
  }
  return {
    aggregate: pipeline => {
      const counts = new Map();
      for (const item of items.filter(row => match(row, pipeline[0].$match))) {
        counts.set(item.category, (counts.get(item.category) || 0) + 1);
      }
      return cursor([...counts].map(([_id, count]) => ({ _id, count })));
    },
    createIndex: async () => {}, find: query => cursor(items.filter(item => match(item, query))),
    findOne: async query => items.find(item => match(item, query)) || null,
    countDocuments: async query => items.filter(item => match(item, query)).length,
    findOneAndUpdate: async (query, changes, options) => update(query, changes, options),
    updateOne: async (query, changes, options) => {
      if (name === 'math_support_images' && failImageOnce) { failImageOnce = false; throw new Error('Simulated interrupted image save'); }
      return { matchedCount: update(query, changes, options) ? 1 : 0 };
    },
    insertOne: async row => { row._id ||= new ObjectId(); items.push(row); return { insertedId: row._id }; }
  };
} };
let session = { sub: 'owner-1', username: 'student1', role: 'student' };
const owner = { ...session }, other = { sub: 'owner-2', username: 'student2', role: 'student' }, admin = { sub: 'admin-1', username: 'admin', role: 'admin' };
const routeSource = fs.readFileSync(new URL('../api/data.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export default async function handler', 'async function handler');
const handler = new Function('educationDb', 'allows', 'getDb','getSession','ObjectId','recordActivity','handleMathSupport','canAccessProblem','supportVisibility','getCatalogTotals','cleanGeometryDiagram', `${routeSource}\nreturn handler;`)(
  educationDb, allows,   async () => db, () => session, ObjectId, async () => {}, handleMathSupport, canAccessProblem, supportVisibility, getCatalogTotals, cleanGeometryDiagram);
async function call({ action, payload, query } = {}) {
  const res = { code: 0, setHeader() {}, status(n) { this.code = n; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
  await handler({ method: action ? 'POST' : 'GET', query, body: { action, payload } }, res);
  return res;
}
const image = 'data:image/png;base64,iVBORw0KGgo=';
const payload = { uploadKey: randomUUID(), title: 'Bất đẳng thức', topic: 'Bất đẳng thức', maxScore: 5, image, content: 'Chứng minh $a^2+b^2\\ge 2ab$.' };
const create = value => call({ action: 'create_math_support', payload: value });
const first = await create({ ...payload, ownerId: other.sub });
assert.equal(first.code, 201); assert.equal(first.body.item.ownerId, owner.sub, 'Ownership is taken from signed session');
assert.equal(first.body.item.referenceSolutionVerified, false);
assert.equal(first.body.item.topic, 'Bất đẳng thức', 'Inequality topic is accepted and stored verbatim');
assert.equal(MATH_SUPPORT_TOPICS.length, 7);
assert.equal(new Set(MATH_SUPPORT_TOPICS).size, 7);
assert.equal((await create({ ...payload, content: 'Retry cannot overwrite saved statement' })).body.item.content, payload.content);
assert.equal(rows.get('problems').length, 1, 'Saving twice does not duplicate the problem');
assert.equal(rows.get('math_support_images').length, 1);
for (const invalid of [{ content: '' }, { image: 'data:text/html;base64,YQ==' }, { image: `data:image/png;base64,${'a'.repeat(3_000_000)}` }, { uploadKey: '../other' }, { maxScore: 0 }, { maxScore: 21 }, { topic: '' }, { topic: 'Đại số' }, { topic: 'Hình học' }]) {
  assert.equal((await create({ ...payload, ...invalid })).code, 400);
}
const p = first.body.item, id = p._id;
session = other;
assert.equal((await call({ query: { resource: 'math_support' } })).body.items.length, 0);
assert.equal((await call({ query: { resource: 'problems', contentKey: p.contentKey } })).body.items.length, 0, 'Generic catalog endpoint also respects ownership');
assert.equal((await call({ query: { resource: 'math_support_image', problemId: id } })).code, 404);
assert.equal((await call({ action: 'submit_solution', payload: { problemId: p.contentKey, solutionContent: 'Bài giải' } })).code, 403);
assert.equal((await call({ action: 'update_catalog_content', payload: { id, content: 'Bài sửa' } })).code, 403);
assert.equal((await retrieveVerifiedContext({ problemRef: p.contentKey, statement: 'client', session }, { db })).blocked, true, 'Other accounts cannot fetch canonical statement through AI');
session = owner;
assert.equal((await call({ query: { resource: 'math_support_image', problemId: id } })).body.item.image, image);
const submitted = await call({ action: 'submit_solution', payload: { problemId: p.contentKey, solutionContent: 'Ta có $(a-b)^2\\ge0$.' } });
assert.equal(submitted.code, 201); assert.equal(submitted.body.item.problemSnapshot.content, payload.content);
assert.equal(submitted.body.item.sourceGroup, 'math_support');
const updated = await call({ action: 'update_catalog_content', payload: { id, content: 'Nội dung đã sửa $x^2$.', expectedVersion: 1,
  referenceLinks: [{ label: 'Nguồn', url: 'https://example.test/math' }], referenceSolution: 'Bài giải', referenceSolutionVerified: true } });
assert.equal(updated.code, 200); assert.equal(updated.body.item.version, 2);
assert.equal(rows.get('problems')[0].referenceSolutionVerified, false, 'Owner cannot mark a solution verified');
assert.equal((await call({ action: 'update_catalog_content', payload: { id, content: 'Stale edit', expectedVersion: 1 } })).code, 409);
assert.equal(rows.get('content_revisions').length, 1);
rows.get('problems').push({ _id: new ObjectId(), contentKey: 'exam:regular', status: 'published', sourceGroup: 'tst' });
assert.equal((await call({ action: 'update_catalog_content', payload: { id: String(rows.get('problems')[1]._id), content: 'Unauthorized' } })).code, 403, 'Owners cannot edit exam catalogs');
for (let i = 0; i < 10; i++) assert.equal((await create({ ...payload, uploadKey: randomUUID(), title: `Bài ${i}` })).code, 201);
const page = await call({ query: { resource: 'math_support', page: '2' } });
assert.equal(page.body.pagination.total, 11); assert.equal(page.body.items.length, 1);
assert.equal(page.body.items[0].image, undefined, 'List does not include image bytes');
assert.equal((await call({ query: { resource: 'math_support', q: 'Bài 9' } })).body.items.length, 1);
session = other;
await create({ ...payload, uploadKey: randomUUID() });
session = admin;
assert.equal((await call({ query: { resource: 'math_support' } })).body.pagination.total, 12);
assert.equal((await call({ query: { resource: 'math_support_image', problemId: id } })).code, 200);
assert.equal(sourceFresh({}, { adminVerified: true, solutionContent: 'Verified' }, rows.get('problems')[0]), false, 'Private uploads never become shared RAG sources');
session = null;
assert.equal((await create(payload)).code, 401);
session = owner;
const interruptedUpload = { ...payload, uploadKey: randomUUID() };
const countBeforeRetry = rows.get('problems').length;
failImageOnce = true;
const originalError = console.error;
try { console.error = () => {}; assert.equal((await create(interruptedUpload)).code, 500); }
finally { console.error = originalError; }
assert.equal((await create(interruptedUpload)).code, 201);
assert.equal(rows.get('problems').length, countBeforeRetry + 1, 'Retry after image-save failure repairs the upload without duplicating the problem');

// Real client service -> real route -> isolated DB -> rendered card and existing actions.
const html = fs.readFileSync(new URL('../src/content/tab-support.html', import.meta.url), 'utf8');
const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'outside-only', url: 'https://math.test' });
const { window } = dom;
window.CSS ||= {}; window.CSS.escape ||= value => String(value);
window.VMOAuth = { getSession: () => ({ username: owner.username, role: owner.role }) };
window.confirm = () => true; window.alert = () => {};
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.scrollTo = () => {};
let clientOcrTopic = MATH_SUPPORT_TOPICS[6];
const guideData = { knowledge: 'Kiến thức kiểm tra $a^2+b^2\\ge2ab$.', intuition: 'Ý tưởng dùng bình phương không âm.',
  solution: 'Ta có $(a-b)^2\\ge0$, suy ra $a^2+b^2\\ge2ab$.', pitfalls: 'Kiểm tra trường hợp đẳng thức.' };
let guideRequest, failGuideMessage = '';
window.fetch = async (url, options = {}) => {
  let res;
  if (String(url).startsWith('/api/ai-ocr-math')) {
    assert.equal(JSON.parse(options.body).image, image);
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: { latexText: payload.content, confidence: 'high', topic: clientOcrTopic } }) };
  }
  if (String(url).startsWith('/api/ai-guide')) {
    guideRequest = JSON.parse(options.body);
    if (failGuideMessage) return { ok: false, status: 502, json: async () => ({ success: false, error: failGuideMessage, code: 'OPENAI_HTTP_401' }) };
    return { ok: true, json: async () => ({ success: true, data: guideData }) };
  }
  const parsed = new URL(url, window.location.href);
  res = await call(options.method === 'POST' ? JSON.parse(options.body) : { query: Object.fromEntries(parsed.searchParams) });
  return { ok: res.code < 400, status: res.code, headers: { get: () => 'application/json' }, json: async () => res.body };
};
window.eval(fs.readFileSync(new URL('../vmo_data_service.js', import.meta.url), 'utf8').replace(/^export /gm, ''));
window.eval(fs.readFileSync(new URL('../vmo_db_ui.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../ai_guide_engine.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../math_support.js', import.meta.url), 'utf8'));
await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
window.document.body.insertAdjacentHTML('beforeend', '<div id="sidebar-support" style="display:none"></div><div id="sidebar-danang"></div>');
window.eval(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
await window.switchTab('tab-support');
assert.equal(window.document.getElementById('sidebar-support').style.display, 'block');
assert.equal(window.document.getElementById('sidebar-danang').style.display, 'none');
assert.ok(window.document.getElementById('tab-support').classList.contains('active'));
// Bypass browser image decoding only; all OCR/save/service/actions below remain real.
const safePreview = window.document.createElement('div');
window.safeRenderMathJaxToElement(safePreview, '$<img src=x onerror=alert(1)>$');
assert.equal(safePreview.querySelector('img'), null, 'Math delimiters must not allow HTML injection');
window.prepareMathSupportImage = async () => image;
const fileInput = window.document.getElementById('supportImage');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const png = new window.File(['png'], 'math.png', { type: 'image/png' });
function paste(file, target = window.document) {
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { items: file ? [{ type: file.type, getAsFile: () => file }] : [{ type: 'text/plain' }] } });
  target.dispatchEvent(event); return event;
}
const supportTab = window.document.getElementById('tab-support');
supportTab.classList.remove('active');
assert.equal(paste(png).defaultPrevented, false, 'Other tabs retain their paste behavior');
supportTab.classList.add('active');
assert.equal(paste(null).defaultPrevented, false, 'Text paste remains native');
window.document.body.insertAdjacentHTML('beforeend', '<div class="vmo-modal active" id="pasteTestModal"></div>');
assert.equal(paste(png).defaultPrevented, false, 'Open modals retain their own image paste behavior');
window.document.getElementById('pasteTestModal').remove();
assert.equal(paste(png, window.document.getElementById('supportPasteHint')).defaultPrevented, true);
await tick();
assert.equal(fileInput.files.length, 0, 'Pasted image does not require a file picker selection');
assert.deepEqual(Array.from(window.document.getElementById('supportTopic').options).slice(1).map(option => option.value), [...MATH_SUPPORT_TOPICS], 'UI topics exactly match the shared catalog taxonomy');
assert.equal(fileInput.required, false, 'Browser validation must allow saving a pasted image');
assert.equal(window.document.getElementById('supportImagePreview').hidden, false);
// Replacing a draft clears stale OCR; invalid/failed replacements retain the good draft.
window.document.getElementById('supportOcrButton').click(); await tick();
assert.equal(window.document.getElementById('supportContent').value, payload.content);
paste(new window.File(['gif'], 'bad.gif', { type: 'image/gif' })); await tick();
assert.match(window.document.getElementById('supportUploadStatus').textContent, /JPEG, PNG/);
assert.equal(window.document.getElementById('supportContent').value, payload.content);
const oversized = new window.File(['png'], 'big.png', { type: 'image/png' });
Object.defineProperty(oversized, 'size', { value: 21 * 1024 * 1024 });
paste(oversized); await tick();
assert.match(window.document.getElementById('supportUploadStatus').textContent, /20 MB/);
window.prepareMathSupportImage = async () => { throw new Error('Ảnh hỏng'); };
paste(png); await tick();
assert.equal(window.document.getElementById('supportContent').value, payload.content);
let finishImage, prepareCalls = 0;
window.prepareMathSupportImage = () => { prepareCalls++; return new Promise(resolve => { finishImage = resolve; }); };
paste(png);
paste(png); // A second paste while preparing must not start a racing image load.
assert.equal(prepareCalls, 1, 'Busy state prevents concurrent image preparation');
finishImage(image); await tick();
assert.equal(window.document.getElementById('supportContent').value, '');
assert.equal(window.document.getElementById('supportTopic').value, '', 'New image clears the previous topic');
assert.equal(window.document.getElementById('supportOcrEditor').hidden, true);
window.prepareMathSupportImage = async () => image;
window.document.getElementById('supportOcrButton').click(); await tick();
assert.equal(window.document.getElementById('supportContent').value, payload.content);
assert.equal(window.document.getElementById('supportOcrEditor').hidden, false);
assert.equal(window.document.getElementById('supportSolveButton').disabled, false);
window.document.getElementById('supportSolveButton').click(); await tick(); await tick();
assert.equal(guideRequest.problemContent, payload.content, 'AI solving uses the checked OCR text');
assert.equal(guideRequest.contentKey.startsWith('math_support:draft:'), true, `Unexpected draft key: ${guideRequest.contentKey}`);
assert.match(window.document.getElementById('supportSolveResult').textContent, /Ta có/);
assert.match(window.document.getElementById('supportSolveStatus').textContent, /Đã tạo lời giải/);
failGuideMessage = 'OpenAI từ chối xác thực hoặc quyền truy cập model kiểm định.';
window.document.getElementById('supportSolveButton').click(); await tick(); await tick();
assert.match(window.document.getElementById('supportSolveStatus').textContent, /OpenAI từ chối xác thực/,
  'Math support displays the actionable AI error instead of replacing it with a generic quality message');
assert.match(window.document.querySelector('#supportSolveResult [data-guide-error-message]').textContent, /OpenAI từ chối xác thực/);
failGuideMessage = '';
const topicSelect = window.document.getElementById('supportTopic');
assert.equal(topicSelect.value, clientOcrTopic, 'OCR automatically selects a canonical topic');
clientOcrTopic = 'Đại số';
window.document.getElementById('supportOcrButton').click(); await tick();
assert.equal(topicSelect.value, '', 'Unknown labels do not retain a stale topic');
assert.equal(window.document.getElementById('mathSupportForm').checkValidity(), false, 'Unclassified drafts require a manual choice');
assert.match(window.document.getElementById('supportTopicHint').textContent, /Chưa xác định/);
clientOcrTopic = MATH_SUPPORT_TOPICS[2];
window.document.getElementById('supportOcrButton').click(); await tick();
assert.equal(topicSelect.value, MATH_SUPPORT_TOPICS[2]);
topicSelect.value = MATH_SUPPORT_TOPICS[6]; // User can correct the OCR suggestion.
window.document.getElementById('supportContent').value = 'Đề đã được kiểm tra $a+b$.';
window.document.getElementById('supportContent').dispatchEvent(new window.Event('input'));
assert.equal(window.document.getElementById('supportSolveResult').childElementCount, 0,
  'Editing OCR text clears a stale AI solution');
assert.equal(window.document.getElementById('mathSupportForm').checkValidity(), true, 'Pasted draft passes native form validation');
window.document.getElementById('mathSupportForm').dispatchEvent(new window.Event('submit', { cancelable: true })); await tick(); await tick();
assert.match(window.document.getElementById('supportUploadStatus').textContent, /Đã lưu bài toán/);
const card = window.document.querySelector('#supportProblems .problem-item');
assert.ok(card); assert.equal(card.dataset.sourceGroup, 'math_support');
assert.equal(card.querySelector('.badge-topic').textContent, MATH_SUPPORT_TOPICS[6], 'Manual correction is persisted and rendered');
assert.ok(card.querySelector('.btn-copy')); assert.ok(card.querySelector('.btn-submit-solution'));
assert.ok(card.querySelector('.btn-ai-guide')); assert.ok(card.querySelector('.btn-manage-reference-links'), 'Regular uploader has source manager');
assert.match(card.querySelector('.problem-content').textContent, /Đề đã được kiểm tra/);
card.querySelector('.btn-manage-reference-links').click(); await tick();
assert.equal(window.document.getElementById('referenceManagerProblemContent').value, 'Đề đã được kiểm tra $a+b$.');
window.document.getElementById('referenceManagerProblemContent').value = 'Đề được sửa trong Quản lý nguồn $a-b$.';
await window.saveReferenceLinksManager();
assert.match(card.querySelector('.problem-content').textContent, /Đề được sửa trong Quản lý nguồn/);
let clipboardText = '';
Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async value => { clipboardText = value; } } });
card.querySelector('.btn-copy').click(); await tick();
assert.ok(clipboardText.includes('$a-b$'), 'Copy preserves source LaTeX instead of MathJax visual fragments');
// File selection continues to use the same preparation path after clipboard support.
Object.defineProperty(fileInput, 'files', { value: [png] });
fileInput.dispatchEvent(new window.Event('change')); await tick();
assert.equal(window.document.getElementById('supportImagePreview').hidden, false);
assert.equal(window.document.getElementById('supportOcrButton').disabled, false);
session = owner;
const ownStats = await call({ query: { resource: 'home_stats' } });
assert.equal(ownStats.code, 200);
assert.equal(ownStats.body.items[0].supportScope, 'own');
assert.equal(ownStats.body.items[0].standaloneProblems, rows.get('problems').filter(row => row.sourceGroup === 'math_support' && row.status === 'published' && row.ownerId === owner.sub).length);
session = admin;
const systemStats = await call({ query: { resource: 'home_stats' } });
assert.equal(systemStats.code, 200);
assert.equal(systemStats.body.items[0].supportScope, 'all');
assert.equal(systemStats.body.items[0].standaloneProblems, rows.get('problems').filter(row => row.sourceGroup === 'math_support' && row.status === 'published').length);
window.close();
console.log('Math support: OCR -> client service -> route -> DB -> actions, owner isolation, revisions, pagination and retry safety: OK');
