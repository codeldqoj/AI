import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { approvedPrediction, predictionQuestionReviews, examStructure, predictionStructure, predictionSettings, selectPredictionEvidence } from '../lib/exam-prediction.js';
import { historicalExams } from '../data/exam-prediction-history.js';

const projectRoot = new URL('../', import.meta.url);
for (const path of ['src/content/tab-tst.html', 'src/content/tab-history.html']) {
  const source = new JSDOM(fs.readFileSync(new URL(path, projectRoot), 'utf8')).window.document;
  const present = new Set(Array.from(source.querySelectorAll('.exam-card[id]')).map(card => card.id));
  const category = path.includes('tab-tst') ? 'tst' : 'regional';
  assert.ok(historicalExams.filter(item => item.category === category).every(item => present.has(item.anchor)), 'Chỉ dùng nguồn lưu trữ còn trong ứng dụng');
}
assert.equal(historicalExams.filter(item => item.category === 'tst').length, 25);
assert.equal(examStructure[1].reduce((total, question) => total + question.maxScore, 0), 20);
assert.equal(examStructure[2].reduce((total, question) => total + question.maxScore, 0), 20);
assert.deepEqual(examStructure[2].map(item => item.questionNumber), [5, 6, 7]);
assert.deepEqual(predictionStructure('', 2), examStructure[2]);
assert.equal(predictionStructure('1 | 10 | Đại số\n2 | 10 | Hình học', 1).length, 2);
assert.throws(() => predictionStructure('1 | 10 | Đại số\n2 | 5 | Hình học', 1));

const settings = predictionSettings({ targetType: 'tst', targetAnchor: 'tst-da-nang', year: '2027-2028', dayNumber: 1, lookback: 10 });
settings.province = 'Đà Nẵng';
const evidence = selectPredictionEvidence(settings, historicalExams);
assert.ok(evidence.ownExamCount > 0, 'Đà Nẵng có đề lưu trữ trong 10 năm');
assert.deepEqual(evidence.historyMembers, ['Quảng Nam', 'Đà Nẵng']);
assert.deepEqual(new Set(evidence.sources.map(item => item.unit)), new Set(['ĐÀ NẴNG', 'QUẢNG NAM']),
  'Dự đoán Đà Nẵng phải học cả dữ liệu Đà Nẵng và Quảng Nam');
assert.deepEqual(new Set(evidence.examples.map(item => item.unit)), new Set(['ĐÀ NẴNG', 'QUẢNG NAM']),
  'Đoạn đề mẫu phải được lấy cân bằng từ cả hai địa phương cũ');
assert.ok(evidence.years.length < 10, 'Phải báo số năm có dữ liệu thực thay vì giả định đủ 10 năm');
assert.ok(evidence.years.every(year => Number(year.slice(0, 4)) < 2027 && Number(year.slice(0, 4)) >= 2017));
assert.ok(evidence.peerExamCount > 0, 'Dùng xu hướng TST 2026–2027');
assert.ok(evidence.missingYears.length > 0, 'Nêu các năm thiếu dữ liệu');
assert.equal(selectPredictionEvidence(settings).ownExamCount, 0, 'Không tự đọc dữ liệu HTML trong sản phẩm');
const vmo = selectPredictionEvidence(predictionSettings({ targetType: 'vmo', year: '2027-2028', dayNumber: 2, lookback: 10 }), historicalExams);
assert.equal(vmo.ownExamCount, 0, 'Không nhầm đề thi thử với kho đề VMO chính thức');
assert.throws(() => predictionSettings({ targetType: 'tst', targetAnchor: 'tst-da-nang', year: '2027-2031', dayNumber: 1, lookback: 10 }));
const reviewed = { approved: true, score: 4.8, structureCorrect: true, allProblemsWellPosed: true,
  mathematicalConsistency: true, originalEnough: true, topicAndScoresMatch: true,
  criticalIssues: [], questionChecks: [{ questionNumber: 1, valid: true }, { questionNumber: 2, valid: true }] };
const sampleQuestions = [{ questionNumber: 1 }, { questionNumber: 2 }];
assert.equal(approvedPrediction(reviewed, sampleQuestions), true);
assert.equal(approvedPrediction({ ...reviewed, questionChecks: [{ questionNumber: 1, valid: true }] }, sampleQuestions), false, 'Không bỏ sót câu');
assert.equal(approvedPrediction({ ...reviewed, criticalIssues: ['Giả thiết mâu thuẫn'] }, sampleQuestions), false, 'Lỗi nghiêm trọng phải chặn lưu');
assert.equal(approvedPrediction({ ...reviewed, score: 4.4 }, sampleQuestions), false, 'Điểm dưới ngưỡng phải bị từ chối');
const rejected = { ...reviewed, approved: false, score: 3.5, allProblemsWellPosed: false,
  criticalIssues: ['Câu 2(c) sai: phản ví dụ có tọa độ cụ thể.'],
  questionChecks: [{ questionNumber: 1, valid: true, reason: 'Đúng' },
    { questionNumber: 2, valid: false, reason: 'Mệnh đề đồng viên sai' }] };
const checks = predictionQuestionReviews(rejected, sampleQuestions);
assert.equal(checks[0].approved, true, 'Câu được duyệt vẫn có thể công bố');
assert.equal(checks[1].approved, false, 'Câu sai phải ở trạng thái chờ sửa');
assert.match(checks[1].issues[0], /phản ví dụ/);
assert.ok(predictionQuestionReviews({ ...rejected, criticalIssues: ['Cấu trúc đề sai.'] }, sampleQuestions)
  .every(check => !check.approved), 'Lỗi toàn đề phải giữ mọi câu ở trạng thái chờ sửa');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="sidebar-mock"><nav class="book-toc"><div class="nav-year-group"><a class="nav-link" href="#mock-set1-day1">01. Bộ 1</a><a class="nav-link" href="#mock-set2-day2">06. Bộ 2</a></div></nav></div>
  <div id="tab-mock"><div class="feed-container"></div></div>
  <div id="dataHubModal"><div class="vmo-modal-body"><div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div><div id="hub-panel-events"></div>
    <form id="formAddDoc" style="display:none"></form><form id="formAddExam" style="display:none"></form>
  </div></div>
</body></html>`, { url: 'https://example.test', runScripts: 'outside-only' });
const { window } = dom;
window.CSS ||= {};
window.CSS.escape ||= value => value;
window.VMOAuth = { getSession: () => ({ username: 'admin', role: 'admin' }) };
window.confirm = () => true;
window.alert = () => {};
window.VMODataService = {
  getCatalogProblems: async () => [], getContentSets: async () => [], getEvents: async () => [],
  getDocuments: async () => [], getExams: async () => [], getExamCatalog: async () => []
};
const root = new URL('../', import.meta.url);
window.eval(fs.readFileSync(new URL('tst-locations.js', root), 'utf8'));
window.eval(fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
window.openDataHubModal();
window.toggleAddExamForm();
const byId = id => window.document.getElementById(id);
assert.equal(byId('examPredictionTarget').options.length, 38);
byId('examCreationMode').value = 'prediction';
window.syncExamCreationMode();
assert.equal(byId('examImages').required, false);
assert.equal(byId('examImageBox').style.display, 'none');
byId('examPredictionType').value = 'tst';
byId('examPredictionTarget').value = 'tst-da-nang';
window.syncExamPredictionTarget();
assert.equal(byId('examRegion').value, 'TRUNG');
byId('examPredictionYear').value = '2027-2028';
byId('examDayNumber').value = '2';
window.fetch = async (_, options) => {
  const payload = JSON.parse(options.body);
  assert.equal(payload.preview, true);
  return { ok: true, json: async () => ({ success: true, data: {
    ownExamCount: 1, peerExamCount: 2, years: ['2026-2027'], missingYears: ['2025-2026']
  } }) };
};
await window.previewExamPredictionEvidence();
assert.match(byId('examPredictionStatus').textContent, /thiếu 1 năm/);
let request;
let responseQuality = { verified: true, score: 4.8, verifierModel: 'gpt-test', summary: 'Đạt',
  questionChecks: examStructure[2].map(item => ({ questionNumber: item.questionNumber, approved: true, reason: 'Đã kiểm tra', issues: [] })) };
window.fetch = async (_, options) => {
  request = JSON.parse(options.body);
  return { ok: true, json: async () => ({ success: true, data: {
    title: 'Đề dự đoán thử', model: 'test', reasoning: 'Có 3 năm nguồn.',
    quality: responseQuality,
    evidence: { requestedYears: 10, years: ['2026-2027'], ownExamCount: 1, peerExamCount: 24,
      trendYear: '2026-2027', sources: [], historyCurrentProvince: 'Đà Nẵng',
      historyMembers: ['Quảng Nam', 'Đà Nẵng'], mergedProvinceHistory: true },
    questions: examStructure[2].map(item => ({ ...item, content: `Xét bài toán mới ở câu ${item.questionNumber}: chứng minh kết luận này.` }))
  } }) };
};
await window.runPredictExam();
assert.equal(request.year, '2027-2028');
assert.equal(request.targetAnchor, 'tst-da-nang');
assert.equal(request.lookback, 10);
assert.equal(byId('examSaveButton').disabled, false);
let stored;
window.VMODataService.createExamFromOcr = async payload => { stored = payload; return { id: 'test', problemCount: 3 }; };
window.VMODataService.saveExamImage = async () => { throw new Error('Đề dự đoán không có ảnh OCR'); };
byId('examPredictionLookback').value = '9';
await window.handleCreateExam({ preventDefault() {}, target: byId('formAddExam') });
assert.equal(stored, undefined, 'Không lưu nếu đã đổi số năm sau khi AI tạo bản dự đoán');
byId('examPredictionLookback').value = '10';
await window.handleCreateExam({ preventDefault() {}, target: byId('formAddExam') });
assert.equal(stored.origin, 'prediction');
assert.equal(stored.sourceImageCount, 0);
assert.equal(stored.year, '2027-2028');
assert.equal(stored.questions.length, 3);
assert.equal(stored.predictionInfo.actualYears.length, 1);
assert.equal(stored.predictionInfo.verifierModel, 'gpt-test');
assert.equal(stored.predictionInfo.verificationScore, 4.8);
assert.deepEqual(stored.predictionInfo.historyMembers, ['Quảng Nam', 'Đà Nẵng']);
responseQuality = { verified: false, score: 3.3, verifierModel: 'gpt-test', summary: 'Câu 7 sai.',
  criticalIssues: ['Câu 7(c) sai: phản ví dụ cụ thể.'],
  questionChecks: examStructure[2].map(item => ({ questionNumber: item.questionNumber,
    approved: item.questionNumber !== 7, reason: item.questionNumber === 7 ? 'Kết luận không đồng viên' : 'Đã kiểm tra',
    issues: item.questionNumber === 7 ? ['Câu 7(c) sai: phản ví dụ cụ thể.'] : [] })) };
byId('examCreationMode').value = 'prediction';
window.syncExamCreationMode();
byId('examPredictionTarget').value = 'tst-da-nang';
byId('examPredictionYear').value = '2027-2028';
byId('examDayNumber').value = '2';
await window.runPredictExam();
assert.equal(byId('examSaveButton').disabled, false, 'Đề bị GPT bác vẫn mở nút lưu cho admin');
assert.match(byId('examOcrPreview').textContent, /Câu 7\(c\) sai/);
await window.handleCreateExam({ preventDefault() {}, target: byId('formAddExam') });
assert.equal(stored.predictionInfo.verified, false);
assert.equal(stored.questions.find(item => item.questionNumber === 7).predictionReview.approved, false);
assert.match(stored.questions.find(item => item.questionNumber === 7).predictionReview.issues[0], /phản ví dụ/);
const rejectedQuestion = stored.questions.find(item => item.questionNumber === 7);
let correction;
window.VMODataService.getCatalogProblems = async () => [{
  id: '507f1f77bcf86cd799439011', contentKey: 'mock:mock-set3-day2:question-7',
  content: rejectedQuestion.content, version: 1, predictionReview: {
    status: 'gpt_rejected', reason: rejectedQuestion.predictionReview.reason,
    issues: rejectedQuestion.predictionReview.issues
  }
}];
window.VMODataService.updateCatalogContent = async (_, payload) => { correction = payload; return { version: 2 }; };
await window.openReferenceLinksManager('mock:mock-set3-day2:question-7');
assert.match(byId('referenceManagerPredictionReview').textContent, /phản ví dụ/);
byId('referenceManagerProblemContent').value += ' Bổ sung giả thiết cần thiết.';
byId('referenceManagerResolve').checked = true;
await window.saveReferenceLinksManager();
assert.equal(correction.resolvePredictionReview, true, 'Admin có thể sửa và xác nhận lại câu bị bác');
console.log('Exam prediction evidence and form: OK');
