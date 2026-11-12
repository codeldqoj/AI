import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildSubmissionContentUpdate, buildSubmissionVerificationUpdate } from '../lib/submission-verification.js';

const admin = { sub: 'admin-id', username: 'admin', role: 'admin' };
const member = { sub: 'member-id', username: 'member', role: 'student' };
const submission = { _id: '507f1f77bcf86cd799439011', solutionContent: 'Lời giải đã được kiểm tra.' };
const now = new Date('2026-09-21T12:00:00.000Z');

assert.throws(() => buildSubmissionVerificationUpdate(member, submission, { verified: true }, now), error =>
  error.status === 403 && error.code === 'ADMIN_REQUIRED', 'Thành viên không được xác minh bài nộp');
assert.throws(() => buildSubmissionVerificationUpdate(admin, { solutionContent: '' }, { verified: true }, now),
  /lời giải văn bản/, 'Không xác minh bài chỉ có ảnh vì AI không thể dùng làm nguồn văn bản');

const verified = buildSubmissionVerificationUpdate(admin, submission,
  { verified: true, note: 'Đã kiểm tra đầy đủ các bước.' }, now);
assert.equal(verified.update.$set.adminVerified, true);
assert.equal(verified.update.$set.adminVerifiedBy, 'admin');
assert.equal(verified.update.$set.adminVerifiedAt.toISOString(), now.toISOString());
assert.equal(verified.update.$push.adminVerificationHistory.$each[0].action, 'verified');
assert.equal(verified.update.$push.adminVerificationHistory.$slice, -50);

const revoked = buildSubmissionVerificationUpdate(admin, submission,
  { verified: false, note: 'Phát hiện bước suy luận chưa chặt chẽ.' }, now);
assert.equal(revoked.update.$set.adminVerified, false);
assert.equal(revoked.update.$set.adminVerifiedAt, null);
assert.equal(revoked.historyEntry.action, 'revoked');

assert.throws(() => buildSubmissionContentUpdate(member, submission, { solutionContent: 'Bản sửa' }, now), error =>
  error.status === 403 && error.code === 'ADMIN_REQUIRED', 'Thành viên không được sửa nội dung bài nộp');
assert.throws(() => buildSubmissionContentUpdate(admin, submission, { solutionContent: '   ' }, now),
  /không được để trống/, 'Không được lưu nội dung MathJax rỗng');

const editedVerified = buildSubmissionContentUpdate(admin,
  { ...submission, adminVerified: true }, { solutionContent: '  Lời giải MathJax đã sửa $x^2$.  ' }, now);
assert.equal(editedVerified.solutionContent, 'Lời giải MathJax đã sửa $x^2$.');
assert.equal(editedVerified.revokedVerification, true);
assert.equal(editedVerified.update.$set.adminVerified, false, 'Sửa nội dung phải tự hủy xác minh cũ');
assert.equal(editedVerified.update.$push.adminVerificationHistory.$each[0].action, 'revoked');

const editedUnverified = buildSubmissionContentUpdate(admin, submission,
  { solutionContent: 'Nội dung OCR mới.' }, now);
assert.equal(editedUnverified.revokedVerification, false);
assert.equal(editedUnverified.update.$push, undefined);

const uiSource = fs.readFileSync(new URL('../vmo_db_ui.js', import.meta.url), 'utf8');
async function submissionHub(role) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="dataHubModal"><div class="vmo-modal-body"><div>
      <button id="hub-tab-events" class="hub-tab-btn"></button>
      <button id="hub-tab-subs" class="hub-tab-btn"></button>
    </div><div id="hub-panel-events"><div id="hubEventsList"></div></div>
    <div id="hub-panel-subs"><div id="hubSubsList"></div></div></div></div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  const calls = [];
  const contentCalls = [];
  window.confirm = () => true;
  window.prompt = () => 'Đã kiểm tra toán học.';
  window.alert = () => {};
  window.VMOAuth = { getSession: () => ({ role, username: role === 'admin' ? 'admin' : 'member' }) };
  window.VMODataService = {
    getCatalogProblems: async () => [], getCatalogRules: async () => [], getEvents: async () => [],
    getSubmissionsPage: async () => ({ items: [{
      _id: submission._id, username: 'member', authorName: 'Thành viên', solutionContent: submission.solutionContent,
      problemTitle: 'Câu kiểm thử', createdAt: now.toISOString(), adminVerified: false
    }, {
      _id: '507f1f77bcf86cd799439012', username: 'member', authorName: 'Thành viên', solutionContent: '', hasImage: true,
      problemTitle: 'Câu chỉ có ảnh', createdAt: now.toISOString(), adminVerified: false
    }], pagination: { page: 1, limit: 10, total: 2, pages: 1 } }),
    verifySubmission: async (...args) => { calls.push(args); return { adminVerified: args[1] }; },
    updateSubmissionContent: async (...args) => { contentCalls.push(args); return { solutionContent: args[1] }; }
  };
  window.eval(uiSource);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.openDataHubModal();
  window.switchHubTab('subs');
  await new Promise(resolve => setTimeout(resolve, 0));
  return { window, calls, contentCalls };
}

const adminHub = await submissionHub('admin');
assert.match(adminHub.window.document.getElementById('hubSubsList').textContent, /Xác minh bài nộp/);
assert.match(adminHub.window.document.getElementById('hubSubsList').textContent, /Sửa MathJax/);
assert.match(adminHub.window.document.getElementById('hubSubsList').textContent, /Thiếu lời giải văn bản/,
  'Bài chỉ có ảnh phải hiển thị trạng thái khóa rõ ràng');
await adminHub.window.setSubmissionVerification(submission._id, true);
assert.deepEqual(adminHub.calls[0], [submission._id, true, 'Đã kiểm tra toán học.']);
adminHub.window.openSubmissionContentEditor(submission._id, 0);
adminHub.window.document.getElementById('submissionContentEditorText').value = 'Nội dung MathJax admin đã sửa.';
await adminHub.window.saveSubmissionContentEditor();
assert.deepEqual(adminHub.contentCalls[0], [submission._id, 'Nội dung MathJax admin đã sửa.']);

const memberHub = await submissionHub('student');
assert.ok(!memberHub.window.document.getElementById('hubSubsList').textContent.includes('Xác minh bài nộp'),
  'Thành viên không được thấy thao tác xác minh');
assert.ok(!memberHub.window.document.getElementById('hubSubsList').textContent.includes('Sửa MathJax'),
  'Thành viên không được thấy thao tác sửa nội dung bài nộp');

const evaluationApiSource = fs.readFileSync(new URL('../api/ai-evaluate-solution.js', import.meta.url), 'utf8');
assert.match(evaluationApiSource, /finalData\.studentWorkTranscription\s*=\s*text\(observedStudentWork,\s*50_000\)/,
  'API đánh giá phải trả lại bản chép bài làm đã được Gemini–GPT sử dụng');
assert.match(uiSource, /currentEvaluationResult\?\.studentWorkTranscription/,
  'Frontend phải ưu tiên lưu bản chép đã kiểm định vào solutionContent');

console.log('Admin submission verification workflow: OK');
