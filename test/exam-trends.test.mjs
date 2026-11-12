import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  TREND_TOPICS, approvedTrendReview, classifyTrendTopic, normalizeTrendReport,
  selectTrendEvidence, selectTrendPracticeEvidence, trendAnalysisSettings
} from '../lib/exam-trends.js';
import { assessTrendTheory } from '../api/ai-trend-theory.js';
import { auditTrendReport } from '../api/ai-exam-trends.js';
import { trendTheorySources } from '../lib/trend-theory-sources.js';
import { cleanTrendTheory } from '../lib/trend-theory-storage.js';
import { historicalExams } from '../data/exam-prediction-history.js';

assert.equal(classifyTrendTopic('Phương trình hàm – Cauchy'), 'Phương trình hàm');
assert.equal(classifyTrendTopic('Số học – Dãy số nguyên'), 'Số học và dãy số');
assert.equal(classifyTrendTopic('Dãy số – Giới hạn'), 'Dãy số và Giới hạn dãy số');
assert.equal(classifyTrendTopic('Hình học đường tròn'), 'Hình học phẳng');
assert.equal(classifyTrendTopic('Đa thức – nghiệm'), 'Đa thức');
assert.equal(classifyTrendTopic('Tổ hợp – Trò chơi'), 'Tổ hợp');
assert.equal(classifyTrendTopic('Bất đẳng thức'), '');

const yearSettings = trendAnalysisSettings({ mode: 'year', year: '2026-2027' });
const yearEvidence = selectTrendEvidence(yearSettings, historicalExams);
assert.equal(yearEvidence.examCount, 25, 'Tập kiểm thử gồm đủ 25 đề TST');
assert.equal(selectTrendEvidence(yearSettings).examCount, 0, 'Không tự đọc HTML ở chế độ sản phẩm');
assert.equal(yearEvidence.topicStats.length, 6);
assert.equal(yearEvidence.topicStats.reduce((sum, item) => sum + item.questionCount, 0) + yearEvidence.otherQuestionCount,
  yearEvidence.questionCount, 'Mỗi câu phải được tính đúng một lần hoặc nằm ngoài 6 tiêu chí');
assert.ok(yearEvidence.samples.every(item => item.sourceId && item.excerpt));

const targetSettings = trendAnalysisSettings({
  mode: 'target', year: '2026-2027', targetType: 'tst', targetAnchor: 'tst-da-nang',
  province: 'Đà Nẵng', lookback: 10
});
const targetEvidence = selectTrendEvidence(targetSettings, historicalExams);
assert.ok(targetEvidence.examCount >= 5, 'Có dữ liệu lịch sử Đà Nẵng để phân tích');
assert.deepEqual(targetEvidence.historyMembers, ['Quảng Nam', 'Đà Nẵng']);
assert.deepEqual(new Set(targetEvidence.sources.map(item => item.historicalUnit)), new Set(['ĐÀ NẴNG', 'QUẢNG NAM']),
  'Phân tích Đà Nẵng phải bao gồm dữ liệu lịch sử Quảng Nam');
assert.ok(targetEvidence.missingYears.length > 0);
assert.equal(targetEvidence.unitCount, 1, 'Đà Nẵng và Quảng Nam phải được quy về một đơn vị hiện hành');
assert.ok(targetEvidence.years.every(year => Number(year.slice(0, 4)) < 2026 && Number(year.slice(0, 4)) >= 2016));
assert.throws(() => trendAnalysisSettings({ mode: 'target', year: '2026-2027', targetType: 'tst', lookback: 10 }));
assert.throws(() => trendAnalysisSettings({ mode: 'year', year: '2026-2030' }));

const practiceEvidence = selectTrendPracticeEvidence(historicalExams);
const sharedPracticeTopic = TREND_TOPICS.find(topic =>
  practiceEvidence.samples.some(item => item.criterion === topic && item.sourceId.startsWith('hist-')) &&
  practiceEvidence.samples.some(item => item.criterion === topic && !item.sourceId.startsWith('hist-')));
assert.ok(sharedPracticeTopic, 'Kho luyện tập phải có ít nhất một chủ đề chung giữa TST và lịch sử');
const fourSources = ['tst', 'regional', 'vmo', 'olympic'].map((category, index) => ({
  category, anchor: ['tst-thu', 'hist-dn-thu', 'vmo-thu', 'olympic-thu'][index],
  province: 'Đơn vị thử', year: '2026-2027', dayNumber: 1, title: 'Đề thử',
  problems: [{ number: 1, topic: 'Dãy số – Giới hạn', content: 'Câu thử' }]
}));
const fourPractice = selectTrendPracticeEvidence(fourSources);
assert.equal(fourPractice.questionCount, 4);
assert.deepEqual([fourPractice.tstQuestionCount, fourPractice.historyQuestionCount,
  fourPractice.vmoQuestionCount, fourPractice.olympicQuestionCount], [1, 1, 1, 1]);
const fourReport = normalizeTrendReport({ topicTrends: [{ topic: TREND_TOPICS[0], frequentMethods: [{
  name: 'Giới hạn', practiceEvidenceIds: [fourPractice.samples[0].sourceId]
}] }] }, yearEvidence, fourPractice);
assert.equal(fourReport.topicTrends[0].frequentMethods[0].practiceEvidenceIds.length, 4,
  'Một nhãn vi chủ đề chi tiết phải lấy đủ câu từ bốn kho');
const practiceSample = yearEvidence.samples.find(item => item.criterion === sharedPracticeTopic);
assert.ok(practiceSample, 'Cần có câu nguồn để kiểm thử chế độ luyện tập');
const tstPracticeSample = practiceEvidence.samples.find(item =>
  item.criterion === sharedPracticeTopic && !item.sourceId.startsWith('hist-'));
const historyPracticeSample = practiceEvidence.samples.find(item =>
  item.criterion === sharedPracticeTopic && item.sourceId.startsWith('hist-'));
assert.ok(tstPracticeSample && historyPracticeSample, 'Phải có câu luyện tập từ cả hai kho');
const rawReport = {
  title: 'Xu hướng thử', executiveSummary: 'Tóm tắt',
  topicTrends: TREND_TOPICS.map(topic => ({ topic, questionCount: 999, prevalencePercent: 999,
    trendLevel: 'Cao', observations: 'Nhận xét', frequentMethods: topic === practiceSample.criterion ? [{
      name: 'Dãy số xác định bởi nghiệm duy nhất của dãy phương trình', frequency: 99,
      evidenceIds: [practiceSample.sourceId, practiceSample.sourceId, 'khong-ton-tai:2026-2027:0:1'],
      practiceEvidenceIds: [tstPracticeSample.sourceId, historyPracticeSample.sourceId,
        historyPracticeSample.sourceId, 'khong-ton-tai:2026-2027:0:1'], note: 'Luyện tập'
    }] : [] })),
  recurringPatterns: [], unitInsights: [], limitations: [], conclusion: 'Kết luận'
};
const normalizedReport = normalizeTrendReport(rawReport, yearEvidence, practiceEvidence);
assert.deepEqual(normalizedReport.topicTrends.map(item => item.questionCount), yearEvidence.topicStats.map(item => item.questionCount),
  'Số liệu do server tính phải ghi đè số liệu AI');
const normalizedMethod = normalizedReport.topicTrends.find(item => item.topic === practiceSample.criterion).frequentMethods[0];
assert.deepEqual(normalizedMethod.evidenceIds, [practiceSample.sourceId], 'Phải bỏ mã trùng và mã không tồn tại');
assert.ok(normalizedMethod.practiceEvidenceIds.includes(tstPracticeSample.sourceId) &&
  normalizedMethod.practiceEvidenceIds.includes(historyPracticeSample.sourceId) &&
  normalizedMethod.practiceEvidenceIds.length > 2,
  'Kho luyện tập phải mở rộng tới mọi câu cùng nhãn chi tiết thay vì chỉ hai mã AI đã dẫn');
assert.equal(normalizedReport.topicTrends.find(item => item.topic === sharedPracticeTopic).evidenceIds.length,
  yearEvidence.topicStats.find(item => item.topic === sharedPracticeTopic).questionCount,
  'Số câu ở cấp chủ đề phải có đủ mã để mở toàn bộ câu trong phạm vi thống kê');
assert.equal(normalizedMethod.frequency, 1, 'Tần suất phải bằng số câu truy nguyên được');
const validReview = {
  approved: true, score: 4.6, countsConsistent: true, evidenceFaithful: true,
  sixTopicsCovered: true, noUnsupportedClaims: true, criticalIssues: [],
  topicChecks: TREND_TOPICS.map(topic => ({ topic, valid: true }))
};
assert.equal(approvedTrendReview(validReview), true);
assert.equal(approvedTrendReview({ ...validReview, criticalIssues: ['Dẫn chứng sai'] }), false);
assert.equal(approvedTrendReview({ ...validReview, topicChecks: validReview.topicChecks.slice(0, 5) }), false);
const reference = trendTheorySources('Dãy số và Giới hạn dãy số')[0];
const auditEvidence = { questionCount: 2, otherQuestionCount: 0,
  topicStats: TREND_TOPICS.map((topic, index) => ({ topic, questionCount: index ? 0 : 2,
    prevalencePercent: index ? 0 : 100 })) };
const auditSamples = [{ sourceId: 'q1', criterion: TREND_TOPICS[0] }];
const auditRaw = { topicTrends: TREND_TOPICS.map((topic, index) => ({ topic,
  questionCount: index ? 0 : 2, prevalencePercent: index ? 0 : 100,
  frequentMethods: index ? [] : [{ name: 'Phương pháp A', frequency: 1,
    evidenceIds: ['q1'], practiceEvidenceIds: ['q1'] }] })), recurringPatterns: [] };
const auditNormalized = { topicTrends: auditRaw.topicTrends };
assert.deepEqual(auditTrendReport(auditRaw, auditNormalized, auditEvidence, auditSamples, auditSamples), []);
assert.ok(auditTrendReport({ ...auditRaw, topicTrends: auditRaw.topicTrends.map((item, index) =>
  index ? item : { ...item, frequentMethods: [{ ...item.frequentMethods[0], evidenceIds: ['fake'] }] }) },
  auditNormalized, auditEvidence, auditSamples, auditSamples).length,
'Mã dẫn không có trong mẫu Atlas phải bị phát hiện');
assert.ok(auditTrendReport({ ...auditRaw, topicTrends: auditRaw.topicTrends.slice(0, 5) },
  auditNormalized, auditEvidence, auditSamples, auditSamples).length,
'Báo cáo thiếu một chủ đề phải bị phát hiện');

const theorySample = { introduction: 'Dãy hội tụ', workedExample: 'a_n=1/n', selfCheck: 'Thế n=1,2',
  definitions: [], theorems: [{ statement: 'Dãy đơn điệu bị chặn hội tụ', assumptions: 'Dãy thực',
    proof: 'Dựa trên tính đầy đủ của số thực.', sourceIds: [reference.id], sourceScope: 'Định lý hội tụ đơn điệu' }] };
assert.equal(assessTrendTheory(theorySample, [reference]).approved, true);
assert.equal(assessTrendTheory({ ...theorySample, theorems: [{ ...theorySample.theorems[0],
  sourceIds: ['FAKE-URL'] }] }, [reference]).approved, false, 'Không chấp nhận mã tài liệu do model bịa');
assert.equal(assessTrendTheory({ ...theorySample, workedExample: '' }, [reference]).approved, false);
const cleanTheory = cleanTrendTheory({ topic: 'Dãy số và Giới hạn dãy số', method: 'Khảo sát dãy đơn điệu',
  theory: { ...theorySample, theorems: [{ ...theorySample.theorems[0], name: 'Hội tụ', sourceIds: [reference.id, 'FAKE'] }] } });
assert.deepEqual(cleanTheory.theory.theorems[0].sourceIds, [reference.id]);
assert.equal(cleanTrendTheory({ topic: 'Tổ hợp', method: 'abcde', theory: theorySample }), null,
  'Bản thiếu tên định lý phải bị từ chối khi lưu');


const dom = new JSDOM(`<!doctype html><html><body>
  <div id="dataHubModal"><div class="vmo-modal-container"><div class="vmo-modal-title"><span></span><span></span></div><div class="vmo-modal-body"><div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div><div id="hub-panel-events"></div>
  <form id="formAddDoc" style="display:none"></form><form id="formAddExam" style="display:none"></form></div></div></div>
</body></html>`, { url: 'https://example.test', runScripts: 'outside-only' });
const { window } = dom;
window.CSS ||= {};
window.CSS.escape ||= value => value;
window.VMOAuth = { getSession: () => ({ username: 'admin', role: 'admin' }) };
window.confirm = () => true;
window.alert = () => {};
let savedPayload;
let storedReports = [];
let storedTheory = null;
window.VMODataService = {
  getCatalogProblems: async () => [], getContentSets: async () => [], getEvents: async () => [],
  getDocuments: async () => [], getExams: async () => [], getExamCatalog: async () => [],
  getExamTrendReports: async () => storedReports,
  getTrendTheory: async () => storedTheory,
  saveTrendTheory: async data => (storedTheory = { ...data, id: '507f1f77bcf86cd799439012' }),
  updateTrendTheory: async data => (storedTheory = { ...storedTheory, theory: data.theory }),
  deleteTrendTheory: async () => { storedTheory = null; },
  saveExamTrendReport: async payload => {
    savedPayload = payload;
    storedReports = [{ ...payload, id: '507f1f77bcf86cd799439011', createdAt: new Date().toISOString() }];
    return storedReports[0];
  },
  updateExamTrendReport: async (id, edits) => {
    assert.equal(id, storedReports[0].id);
    storedReports[0] = { ...storedReports[0], report: { ...storedReports[0].report,
      title: edits.title, executiveSummary: edits.executiveSummary, conclusion: edits.conclusion,
      topicTrends: storedReports[0].report.topicTrends.map((topic, index) => ({
        ...topic, observations: edits.observations[index]
      })) }, updatedBy: 'admin' };
    return storedReports[0];
  },
  deleteExamTrendReport: async id => {
    assert.equal(id, storedReports[0].id);
    storedReports = [];
    return { id };
  }
};
const root = new URL('../', import.meta.url);
window.eval(fs.readFileSync(new URL('tst-locations.js', root), 'utf8'));
window.eval(fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
window.openDataHubModal();
assert.ok(window.document.getElementById('hub-tab-trends'), 'Admin phải thấy tab AI xu hướng đề');
window.switchHubTab('trends');
const byId = id => window.document.getElementById(id);
assert.equal(byId('trendTarget').options.length, 38);
window.fetch = async (_, options) => {
  assert.equal(JSON.parse(options.body).preview, true);
  assert.equal(JSON.parse(options.body).includeCurrentYear, true);
  return { ok: true, json: async () => ({ success: true, data: {
    examCount: 1, questionCount: 3, years: ['2025-2026'], missingYears: ['2024-2025']
  } }) };
};
await window.previewExamTrendEvidence();
assert.match(byId('trendStatus').textContent, /năm thiếu: 2024-2025/);
const resultData = {
  settings: yearSettings, evidence: yearEvidence, report: normalizedReport, model: 'gemini-test',
  generatedAt: new Date().toISOString(), quality: {
    status: 'rejected', verified: false, score: 3.5, summary: 'Một dẫn chứng chưa đủ mạnh.',
    criticalIssues: ['Tần suất phương pháp A chưa được chứng minh.'], corrections: ['Bổ sung mã nguồn.'],
    topicChecks: [], verifierModel: 'gpt-test', pipeline: 'Gemini → GPT'
  }
};
let requestBody;
window.fetch = async (_, options) => {
  requestBody = JSON.parse(options.body);
  return { ok: true, json: async () => ({ success: true, data: resultData }) };
};
await window.runExamTrendAnalysis();
assert.equal(requestBody.mode, 'year');
assert.equal(requestBody.year, '2026-2027');
assert.equal(requestBody.includeCurrentYear, true);
assert.equal(byId('trendSaveButton').disabled, false, 'GPT bác vẫn phải cho admin lưu báo cáo Gemini');
assert.match(byId('trendResult').textContent, /Gia sư Toán AI chưa duyệt/);
assert.match(byId('trendResult').textContent, /Tần suất phương pháp A/);
assert.equal(byId('trendResult').querySelectorAll('.trend-topic-practice-button').length, 6);
assert.ok(byId('trendResult').querySelector('.trend-collapse-report'), 'Báo cáo có nút thu gọn');
assert.ok(byId('trendResult').querySelector('.trend-theory-button'), 'Vi chủ đề có nút cơ sở lý thuyết');
let theoryRequests = 0;
window.fetch = async (url, options) => {
  assert.equal(url, '/api/ai-trend-theory');
  assert.equal(JSON.parse(options.body).method, normalizedMethod.name);
  theoryRequests++;
  return { ok: true, json: async () => ({ success: true, data: {
    theory: { introduction: 'Tổng quan $a_n$', definitions: [], theorems: [{
      name: 'Định lý', statement: 'Phát biểu', assumptions: 'Giả thiết', proof: 'Chứng minh', application: 'Ứng dụng', sourceIds: [reference.id], sourceScope: 'Kiến thức nền'
    }], workedExample: 'Ví dụ', pitfalls: 'Lưu ý', selfCheck: 'Đã tự kiểm tra' },
    sources: [reference], quality: { summary: 'GPT biên soạn và tự kiểm tra' }
  } }) };
};
byId('trendResult').querySelector('.trend-theory-button').click();
await new Promise(resolve => setTimeout(resolve, 20));
assert.match(byId('trendTheoryModal').textContent, /Tổng quan/);
assert.match(byId('trendTheoryModal').textContent, /Định lý/);
assert.equal(byId('trendTheoryModal').querySelector('a').href, reference.url);
assert.match(byId('trendTheoryModal').textContent, /tự kiểm tra/);
const theoryBody = byId('trendTheoryBody');
[...theoryBody.querySelectorAll('button')].find(button => button.textContent.includes('Chỉnh sửa')).click();
assert.ok(theoryBody.querySelector('form'), 'Cho phép sửa trước khi lưu');
theoryBody.querySelector('form textarea').value = 'Tổng quan đã sửa';
theoryBody.querySelector('form textarea').dispatchEvent(new window.Event('input'));
theoryBody.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 10));
assert.match(theoryBody.textContent, /Tổng quan đã sửa/);
[...theoryBody.querySelectorAll('button')].find(button => button.textContent.includes('cơ sở dữ liệu')).click();
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(storedTheory.theory.introduction, 'Tổng quan đã sửa');
[...theoryBody.querySelectorAll('button')].find(button => button.textContent.includes('Chỉnh sửa')).click();
theoryBody.querySelector('form textarea').value = 'Sau khi lưu';
theoryBody.querySelector('form textarea').dispatchEvent(new window.Event('input'));
theoryBody.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(storedTheory.theory.introduction, 'Sau khi lưu');

window.closeTrendTheory();
byId('trendResult').querySelector('.trend-theory-button').click();
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(theoryRequests, 1, 'Bản lưu được mở lại, không gọi GPT lần nữa');
assert.match(theoryBody.textContent, /Sau khi lưu/);
[...theoryBody.querySelectorAll('button')].find(button => button.textContent.includes('Xóa bản')).click();
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(storedTheory, null);
window.closeTrendTheory();
byId('trendResult').querySelector('.trend-collapse-report').click();
assert.equal(byId('trendResult').textContent, '', 'Thu gọn trả lại danh sách báo cáo');
requestBody = null;
window.fetch = async (_, options) => {
  requestBody = JSON.parse(options.body);
  return { ok: true, json: async () => ({ success: true, data: resultData }) };
};
await window.runExamTrendAnalysis();
function practiceSource(sample, tabId, label) {
  const parts = sample.sourceId.split(':');
  const questionNumber = Number(parts.pop());
  parts.pop();
  parts.pop();
  const anchor = parts.join(':');
  const rootElement = window.document.createElement('div');
  rootElement.id = tabId;
  rootElement.className = 'tab-pane';
  rootElement.innerHTML = `<article class="exam-card" id="${anchor}"><div class="exam-header"><div class="exam-top-tags"><span class="tag tag-year">${sample.year}</span><span class="tag tag-province">${label}</span></div><h3 class="exam-title">ĐỀ NGUỒN ${label}</h3></div><div class="exam-body">${Array.from({ length: questionNumber }, (_, index) => `<div class="problem-item"><div class="problem-header"><div class="problem-id"><span>Câu ${index + 1}</span><span class="badge-topic">${sharedPracticeTopic}</span></div><button class="btn-copy">📋 Sao chép</button></div><div class="problem-content">Nội dung ${label} câu ${index + 1}</div>${index + 1 === questionNumber ? '<div class="solution-box source-solution-box"><button class="toggle-btn">🔗 Lời giải tham khảo</button><div class="solution-content"><a href="https://example.test/solution">Nguồn thử</a></div></div>' : ''}</div>`).join('')}</div></article>`;
  window.document.body.appendChild(rootElement);
  return rootElement;
}
const tstSourceRoot = practiceSource(tstPracticeSample, 'tab-tst', 'TST');
const historySourceRoot = practiceSource(historyPracticeSample, 'tab-history', 'ĐÀ NẴNG–QUẢNG NAM');
window.ensureVMOTabContent = async tabId => tabId === 'tab-history' ? historySourceRoot : tstSourceRoot;
window.injectTstSources = () => {};
window.toggleSolution = () => {};
window.renderMathInContainer = async () => {};
window.reinitAIGuide = rootElement => rootElement.querySelectorAll('.problem-header').forEach(header => {
  if (!header.querySelector('.btn-ai-guide')) header.insertAdjacentHTML('beforeend', '<button class="btn-ai-guide">AI Hướng dẫn giải</button>');
});
const practiceButton = byId('trendResult').querySelector('.trend-practice-button');
assert.ok(practiceButton, 'Vi chủ đề phải có nút luyện tập');
practiceButton.click();
await new Promise(resolve => setTimeout(resolve, 20));
const practiceModal = byId('trendPracticeModal');
assert.ok(practiceModal.classList.contains('active'));
assert.match(practiceModal.textContent, /Nguồn: Đề TST/);
assert.match(practiceModal.textContent, /Nguồn: Đề Đà Nẵng–Quảng Nam/);
assert.equal(practiceModal.querySelectorAll('.trend-practice-exam').length, 2,
  'Phải hiển thị câu luyện tập của cả hai kho');
assert.ok(practiceModal.querySelector('.btn-ai-guide'), 'Phải giữ AI Hướng dẫn giải');
assert.ok(practiceModal.querySelector('.btn-submit-solution'), 'Phải giữ Nộp bài giải');
assert.ok(practiceModal.querySelector('.source-solution-box'), 'Phải giữ Lời giải tham khảo');
assert.ok(practiceModal.querySelector('.btn-manage-reference-links'), 'Admin phải có Quản lý nguồn');
const submissionModal = window.document.createElement('div');
submissionModal.id = 'submissionModal';
submissionModal.className = 'vmo-modal-overlay';
submissionModal.innerHTML = '<button id="submissionModalClose" class="vmo-modal-close"></button>';
window.document.body.appendChild(submissionModal);
window.openSubmissionModal('test-problem', 'Câu thử', practiceModal.querySelector('.problem-item'));
assert.ok(submissionModal.classList.contains('trend-practice-child-modal'),
  'Giao diện Nộp bài phải nằm trên giao diện luyện tập');
window.closeSubmissionModal();
assert.equal(window.document.body.style.overflow, 'hidden',
  'Đóng giao diện con vẫn phải khóa cuộn khi giao diện luyện tập còn mở');
await window.openReferenceLinksManager('test-problem');
assert.ok(byId('referenceLinksAdminModal').classList.contains('trend-practice-child-modal'),
  'Giao diện Quản lý nguồn phải nằm trên giao diện luyện tập');
window.closeReferenceLinksManager();
await window.saveExamTrendReport();
assert.equal(savedPayload.quality.status, 'rejected');
assert.equal(savedPayload.report.topicTrends.length, 6);
assert.ok(byId('trendSavedReports').querySelector('[data-trend-edit]'));
byId('trendSavedReports').querySelector('[data-trend-report]').click();
assert.match(byId('trendResult').textContent, /Báo cáo đã lưu/);
byId('trendSavedReports').querySelector('[data-trend-report]').click();
assert.equal(byId('trendResult').textContent, '', 'Nhấp lại báo cáo đang chọn sẽ đóng nội dung');
byId('trendSavedReports').querySelector('[data-trend-edit]').click();
const editForm = byId('trendReportEditForm');
editForm.elements.title.value = 'Báo cáo đã sửa';
editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(storedReports[0].report.title, 'Báo cáo đã sửa');
assert.match(byId('trendSavedReports').textContent, /Báo cáo đã sửa/);
byId('trendSavedReports').querySelector('[data-trend-delete]').click();
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(storedReports.length, 0, 'Admin xóa báo cáo khỏi danh sách');
const sourceRoots = Object.fromEntries(['tab-tst', 'tab-history', 'tab-vmo', 'tab-olympic']
  .map((tab, index) => [tab, practiceSource(fourPractice.samples[index], tab, tab)]));
window.ensureVMOTabContent = async tabId => sourceRoots[tabId];
window.loadDatabaseCompetitionExams = async () => {};
resultData.report = fourReport;
await window.runExamTrendAnalysis();
byId('trendResult').querySelector('.trend-practice-button').click();
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(practiceModal.querySelectorAll('.trend-practice-exam').length, 4,
  'Luyện tập vi chủ đề phải mở câu từ cả TST, khu vực, VMO và IMO');
assert.match(practiceModal.textContent, /Nguồn: Đề VMO/);
assert.match(practiceModal.textContent, /Nguồn: Đề IMO–Olympic/);
const topicButton = byId('trendResult').querySelector('.trend-topic-practice-button');
assert.ok(topicButton && !topicButton.disabled, 'Số câu thống kê chủ đề phải bấm được');
resultData.report.topicTrends[0].evidenceIds = [fourPractice.samples[0].sourceId];
topicButton.click();
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(practiceModal.querySelectorAll('.trend-practice-exam').length, 1,
  'Nút số câu chủ đề phải mở các câu thuộc phạm vi phân tích năm TST');
console.log('Exam trend analysis and admin UI: OK');
