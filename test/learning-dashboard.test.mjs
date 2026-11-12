import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { deleteAiGuideRecord, learningScope, recordActivity, summarizeLearning } from '../lib/learning.js';

const member = { sub: 'member-id', username: 'hoangkien', role: 'student' };
const admin = { sub: 'admin-id', username: 'admin', role: 'admin' };
assert.deepEqual(learningScope(member), { userId: 'member-id' });
assert.equal(learningScope(member, 'otheruser'), null, 'Thành viên không thể yêu cầu dữ liệu người khác');
assert.deepEqual(learningScope(admin), {});
assert.deepEqual(learningScope(admin, 'HoangKien'), { username: 'hoangkien' });

const entries = [
  { _id: 'a1', userId: 'member-id', username: 'hoangkien', problemKey: 'specialty:1', submissionKind: 'ai_guide', solutionContent: 'Lời giải AI', problemSnapshot: { title: 'Ví dụ 1', setTitle: 'Chuyên đề dãy số' }, updatedAt: '2026-09-17T00:00:00Z' },
  { _id: '507f1f77bcf86cd799439011', userId: 'member-id', username: 'hoangkien', problemKey: 'specialty:1', submissionKind: 'ai_guide', solutionContent: 'Lời giải mới', problemSnapshot: { title: 'Ví dụ 1', setTitle: 'Chuyên đề dãy số' }, updatedAt: '2026-09-18T00:00:00Z' },
  { _id: 'a3', userId: 'member-id', username: 'hoangkien', problemKey: 'specialty:1', evaluation: { estimatedScore: '2.5/5.0' }, problemSnapshot: { title: 'Ví dụ 1', setTitle: 'Chuyên đề dãy số' }, updatedAt: '2026-09-17T00:00:00Z' },
  { _id: 'a4', userId: 'member-id', username: 'hoangkien', problemKey: 'specialty:1', evaluation: { estimatedScore: '4.0/5.0' }, problemSnapshot: { title: 'Ví dụ 1', setTitle: 'Chuyên đề dãy số' }, updatedAt: '2026-09-19T00:00:00Z' },
  { _id: 'b1', userId: 'other-id', username: 'otheruser', problemKey: 'tst:quang-ngai:1', evaluation: { estimatedScore: '3.5/5.0đ (Đánh giá dự phòng)' }, problemSnapshot: { title: 'Câu 1', setTitle: 'Đề Quảng Ngãi' }, updatedAt: '2026-09-18T00:00:00Z' },
  { _id: 'b2', userId: 'other-id', username: 'otheruser', problemKey: 'tst:quang-ngai:2', solutionContent: 'Chưa chấm', updatedAt: '2026-09-18T00:00:00Z' }
];
const users = [
  { _id: 'member-id', username: 'hoangkien', fullName: 'Hoàng Kiên' },
  { _id: 'other-id', username: 'otheruser', fullName: 'Thành viên khác' }
];
const all = summarizeLearning(entries, users);
assert.deepEqual(all.totals, { guideCount: 1, evaluationCount: 2, scoreEarned: 7.5, scoreMaximum: 10 });
assert.equal(all.guides.length, 1);
assert.equal(all.evaluations.find(item => item.username === 'hoangkien').score, '4/5');
assert.equal(all.evaluations.find(item => item.username === 'otheruser').score, '3.5/5');
assert.equal(all.evaluations.find(item => item.username === 'hoangkien').setTitle, 'Chuyên đề dãy số');
const own = summarizeLearning(entries.filter(row => row.userId === learningScope(member).userId), [users[0]]);
assert.deepEqual(own.totals, { guideCount: 1, evaluationCount: 1, scoreEarned: 4, scoreMaximum: 5 });

const savedEvents = [];
const db = { collection: () => ({ insertOne: async doc => savedEvents.push(doc) }) };
await recordActivity(db, member, 'evaluation.saved', { problemKey: 'specialty:1', score: '4.0/5.0', password: 'SECRET', solutionContent: 'Private answer' });
assert.equal(savedEvents.length, 1);
assert.equal(savedEvents[0].userId, member.sub);
assert.equal(savedEvents[0].details.password, undefined);
assert.equal(savedEvents[0].details.solutionContent, undefined);

const deletedQueries = [];
const removedImages = [];
const auditEvents = [];
const guideDb = { collection: name => name === 'submissions'
  ? { findOneAndDelete: async query => {
      deletedQueries.push(query);
      return query.submissionKind === 'ai_guide'
        ? { username: 'hoangkien', problemKey: 'specialty:1', problemTitle: 'Ví dụ 1' } : null;
    } }
  : name === 'submission_images'
    ? { deleteMany: async query => removedImages.push(query) }
    : { insertOne: async event => auditEvents.push(event) } };
const guideId = '507f1f77bcf86cd799439011';
await deleteAiGuideRecord(guideDb, admin, guideId);
assert.deepEqual(deletedQueries[0], { _id: guideId, submissionKind: 'ai_guide' }, 'Không xóa nhầm bài nộp của thành viên');
assert.deepEqual(removedImages[0], { submissionId: guideId });
assert.equal(auditEvents[0].action, 'guide.deleted');
assert.equal(auditEvents[0].details.ownerUsername, 'hoangkien');

const ui = fs.readFileSync(new URL('../vmo_db_ui.js', import.meta.url), 'utf8');
async function dashboardFor(role) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="dataHubModal"><div class="vmo-modal-body"><div><button id="hub-tab-events" class="hub-tab-btn"></button></div><div id="hub-panel-events"><div id="hubEventsList"></div></div></div></div></body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  const activityFilters = [];
  let dashboardOverview = role === 'admin' ? all : own;
  window.confirm = () => true;
  window.activityFilters = activityFilters;
  window.deletedGuideIds = [];
  window.VMOAuth = { getSession: () => ({ role, username: role === 'admin' ? 'admin' : 'hoangkien' }) };
  window.VMODataService = {
    getCatalogProblems: async () => [], getCatalogRules: async () => [], getEvents: async () => [],
    getLearningOverview: async () => ({ overview: dashboardOverview, accounts: role === 'admin' ? users : [users[0]] }),
    deleteAiGuide: async id => {
      window.deletedGuideIds.push(id);
      dashboardOverview = summarizeLearning(entries.filter(row => row.submissionKind !== 'ai_guide'), users);
    },
    getActivityFeed: async filters => {
      activityFilters.push(filters);
      return { items: [{ action: 'login', username: filters.username || 'hoangkien', createdAt: '2026-09-19T00:00:00Z' }], pagination: { page: 1, pages: 1, total: 1 } };
    }
  };
  window.eval(ui);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.openDataHubModal();
  window.switchHubTab('progress');
  await new Promise(resolve => setTimeout(resolve, 0));
  return window;
}

const adminWindow = await dashboardFor('admin');
assert.match(adminWindow.document.getElementById('hubLearningSummary').textContent, /7,5 \/ 10/);
assert.equal(adminWindow.document.getElementById('hubLearningAccount').options.length, 3);
assert.match(adminWindow.document.getElementById('hubActivityList').textContent, /Đăng nhập/);
assert.equal(adminWindow.document.querySelectorAll('[data-delete-ai-guide]').length, 1);
await adminWindow.deleteLearningAiGuide('507f1f77bcf86cd799439011');
assert.deepEqual(adminWindow.deletedGuideIds, ['507f1f77bcf86cd799439011']);
assert.equal(adminWindow.document.querySelectorAll('[data-delete-ai-guide]').length, 0);
assert.match(adminWindow.document.getElementById('hubLearningSummary').textContent, /0Ví dụ\/câu đã lưu hướng dẫn AI/);
const accountSelect = adminWindow.document.getElementById('hubLearningAccount');
accountSelect.value = 'otheruser';
accountSelect.dispatchEvent(new adminWindow.Event('change'));
await new Promise(resolve => setTimeout(resolve, 0));
assert.match(adminWindow.document.getElementById('hubLearningSummary').textContent, /3,5 \/ 5/);
assert.equal(adminWindow.activityFilters.at(-1).username, 'otheruser');
assert.ok(!adminWindow.document.getElementById('hubLearningEvaluations').textContent.includes('Chuyên đề dãy số'));
const memberWindow = await dashboardFor('student');
assert.match(memberWindow.document.getElementById('hubLearningSummary').textContent, /4 \/ 5/);
assert.equal(memberWindow.document.getElementById('hubLearningAccount').parentElement.style.display, 'none');
assert.ok(!memberWindow.document.getElementById('hubLearningEvaluations').textContent.includes('Đề Quảng Ngãi'));
assert.equal(memberWindow.document.querySelectorAll('[data-delete-ai-guide]').length, 0);

async function guidePanelFor(role) {
  const dom = new JSDOM('<!doctype html><html><body><div class="problem-item" id="question-one"><div class="problem-header"><div class="problem-id"><span>Câu 1</span></div><button class="btn-ai-guide">AI Hướng dẫn giải</button></div><div class="problem-content">Cho $x>0$.</div></div></body></html>',
    { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  window.VMOAuth = { getSession: () => ({ role, username: 'admin' }) };
  window.confirm = () => true;
  window.showVMOToast = () => {};
  window.VMODataService = {
    getLatestAiGuide: async () => ({ id: '507f1f77bcf86cd799439011', aiGuide: {
      solution: 'Lời giải đã lưu', knowledge: 'Định lý', intuition: 'Ý tưởng', pitfalls: 'Lưu ý'
    } }),
    deleteAiGuide: async id => { window.deletedId = id; }
  };
  window.eval(fs.readFileSync(new URL('../ai_guide_engine.js', import.meta.url), 'utf8'));
  await window.openAIGuide(window.document.querySelector('.btn-ai-guide'));
  return window;
}
const adminGuide = await guidePanelFor('admin');
assert.equal(adminGuide.document.querySelectorAll('.btn-ai-guide-delete').length, 1);
await adminGuide.deleteSavedAIGuide(adminGuide.document.querySelector('.ai-guide-panel').id.slice('ai-panel-'.length));
assert.equal(adminGuide.deletedId, '507f1f77bcf86cd799439011');
assert.equal(adminGuide.document.querySelector('.ai-guide-panel'), null);
const memberGuide = await guidePanelFor('student');
assert.equal(memberGuide.document.querySelectorAll('.btn-ai-guide-delete').length, 0);
console.log('Learning dashboard summary, activity and member access: OK');
