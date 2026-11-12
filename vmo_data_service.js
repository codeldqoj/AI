/**
 * VMO DATA SERVICE — MongoDB Atlas qua Vercel API.
 *
 * Trình duyệt chỉ giao tiếp với /api/data. Mọi kiểm tra phiên đăng nhập,
 * phân quyền và truy cập MongoDB đều được thực hiện tại server.
 * File này không sử dụng Firebase/Firestore.
 */

const DATA_API_URL = '/api/data';
const REQUEST_TIMEOUT_MS = 30_000;
const EXAM_SAVE_TIMEOUT_MS = 105_000;
const MATH_OCR_TIMEOUT_MS = 110_000;
const READ_CACHE_TTL_MS = 5 * 60_000;
const MAX_EXAM_IMAGE_BATCH_CHARS = 3_500_000;
const readCache = new Map();
const inflightReads = new Map();

function createServiceError(message, status = 0, code = '') {
  const error = new Error(message);
  error.name = 'VMODataServiceError';
  error.status = status;
  error.code = code;
  return error;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw createServiceError(
      text || `Máy chủ trả về dữ liệu không hợp lệ (HTTP ${response.status})`,
      response.status,
      'INVALID_RESPONSE'
    );
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw createServiceError(
      `Không đọc được phản hồi từ máy chủ (HTTP ${response.status})`,
      response.status,
      'INVALID_JSON'
    );
  }

  if (!response.ok || data.success !== true) {
    const code = response.status === 401
      ? 'AUTH_REQUIRED'
      : response.status === 403
        ? 'FORBIDDEN'
        : 'API_ERROR';

    throw createServiceError(
      data.error || data.message || `Yêu cầu thất bại (HTTP ${response.status})`,
      response.status,
      code
    );
  }

  return data;
}

async function apiFetch(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    return await parseResponse(response);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createServiceError(
        'Máy chủ phản hồi quá chậm. Vui lòng thử lại.',
        0,
        'TIMEOUT'
      );
    }

    if (error?.name === 'VMODataServiceError') throw error;

    throw createServiceError(
      error?.message || 'Không thể kết nối tới API cơ sở dữ liệu',
      0,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function invalidateReadCache() {
  readCache.clear();
  inflightReads.clear();
}

async function cachedApiFetch(url, ttlMs = READ_CACHE_TTL_MS) {
  const now = Date.now();
  const cached = readCache.get(url);
  if (cached && now - cached.storedAt < ttlMs) return cached.data;
  if (inflightReads.has(url)) return inflightReads.get(url);

  const pending = apiFetch(url)
    .then(data => {
      readCache.set(url, { data, storedAt: Date.now() });
      return data;
    })
    .finally(() => inflightReads.delete(url));
  inflightReads.set(url, pending);
  return pending;
}

async function request(resource, params = {}) {
  const query = new URLSearchParams({ resource });

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });

  const data = await cachedApiFetch(`${DATA_API_URL}?${query.toString()}`);
  return Array.isArray(data.items) ? data.items : [];
}

async function requestPage(resource, params = {}) {
  const query = new URLSearchParams({ resource });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  });
  const data = await apiFetch(`${DATA_API_URL}?${query.toString()}`);
  return {
    items: normalizeList(Array.isArray(data.items) ? data.items : []),
    pagination: data.pagination || { page: 1, limit: 10, total: 0, pages: 1 }
  };
}

async function mutate(action, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const data = await apiFetch(DATA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  }, timeoutMs);

  // Mutation thành công có thể làm thay đổi catalog hoặc dữ liệu quản trị.
  invalidateReadCache();
  if (['create_exam_from_ocr', 'create_math_support', 'add_exam', 'update_exam', 'delete_exam', 'save_problem'].includes(action)) {
    window.dispatchEvent(new CustomEvent('vmo:data-changed', { detail: { action } }));
  }

  return data.item ?? true;
}

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.$oid === 'string') return value.$oid;
  return String(value);
}

function normalize(item) {
  if (!item || typeof item !== 'object') return item;

  const mongoId = normalizeId(item._id);
  return {
    ...item,
    id: item.id || mongoId,
    _id: mongoId || item._id
  };
}

function normalizeList(items) {
  return items.map(normalize);
}

/**
 * Hồ sơ người dùng được quản lý qua /api/auth.
 * Hàm này được giữ lại để tương thích với mã giao diện cũ.
 */
export async function syncUserProfile(user) {
  return user || null;
}

export async function getAllUsers() {
  if (!window.VMOAuth?.listUsers) {
    throw createServiceError(
      'Dịch vụ quản lý tài khoản chưa sẵn sàng',
      0,
      'AUTH_SERVICE_UNAVAILABLE'
    );
  }

  const result = await window.VMOAuth.listUsers();
  if (!result?.success) {
    throw createServiceError(
      result?.message || result?.error || 'Không thể đọc danh sách tài khoản',
      result?.status || 0,
      'USER_LIST_ERROR'
    );
  }

  return Array.isArray(result.users) ? result.users : [];
}

export async function getDocuments(topicFilter = null) {
  return normalizeList(await request('documents', { topic: topicFilter }));
}

export async function addDocument(documentData) {
  return normalize(await mutate('add_document', documentData));
}

export async function deleteDocument(id) {
  return mutate('delete_document', { id: normalizeId(id) });
}

export async function getExams(categoryFilter = null) {
  return normalizeList(await request('exams', { category: categoryFilter }));
}

export async function addExam(examData) {
  return normalize(await mutate('add_exam', examData));
}

export async function updateExam(id, fields) {
  return normalize(await mutate('update_exam', { id: normalizeId(id), ...fields }));
}

export async function deleteExam(id) {
  return mutate('delete_exam', { id: normalizeId(id) });
}

export async function addExamQuestion(examId, question) {
  return normalize(await mutate('add_exam_question', { examId: normalizeId(examId), ...question }));
}

export async function deleteExamQuestion(examId, problemId) {
  return mutate('delete_exam_question', { examId: normalizeId(examId), problemId: normalizeId(problemId) });
}

export async function createExamFromOcr(examData) {
  return normalize(await mutate('create_exam_from_ocr', examData, EXAM_SAVE_TIMEOUT_MS));
}

export async function getExamCatalog(category = 'tst-national') {
  const exams = normalizeList(await request('exam_catalog', { category }));
  return exams.map(exam => ({
    ...exam,
    problems: normalizeList(Array.isArray(exam.problems) ? exam.problems : [])
  }));
}

export async function getExamCatalogSummary(category = 'tst-national', courseId = '') {
  return normalizeList(await request('exam_catalog', { category, view: 'summary', ...(courseId ? { courseId } : {}) }));
}

export async function getExamCatalogDetail(category, anchor, year = '') {
  const exams = normalizeList(await request('exam_catalog', { category, view: 'detail', anchor, ...(year ? { year } : {}) }));
  return exams.map(exam => ({
    ...exam, problems: normalizeList(Array.isArray(exam.problems) ? exam.problems : [])
  }));
}

export async function searchExamCatalog(category, query) {
  return normalizeList(await request('exam_catalog', { category, view: 'search', q: query }));
}

export async function getHomeStats() {
  const items = normalizeList(await request('home_stats'));
  return items[0] || { exams: [] };
}

export async function saveExamImage(examId, pageNumber, image) {
  return normalize(await mutate('save_exam_image', { examId: normalizeId(examId), pageNumber, image }, EXAM_SAVE_TIMEOUT_MS));
}

export async function saveExamImages(examId, images) {
  const batches = [];
  let batch = [];
  let batchChars = 0;

  images.forEach((image, index) => {
    if (batch.length && batchChars + image.length > MAX_EXAM_IMAGE_BATCH_CHARS) {
      batches.push(batch);
      batch = [];
      batchChars = 0;
    }
    batch.push({ pageNumber: index + 1, image });
    batchChars += image.length;
  });
  if (batch.length) batches.push(batch);

  let nextBatch = 0;
  const workers = Array.from({ length: Math.min(3, batches.length) }, async () => {
    while (nextBatch < batches.length) {
      const currentBatch = batches[nextBatch++];
      await mutate('save_exam_images', { examId: normalizeId(examId), images: currentBatch }, EXAM_SAVE_TIMEOUT_MS);
    }
  });
  const results = await Promise.allSettled(workers);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

export async function getExamImage(examId, pageNumber = 1) {
  const items = await request('exam_image', { examId: normalizeId(examId), pageNumber });
  return items[0] || null;
}

export async function getProblemsByExam(examId) {
  return normalizeList(await request('problems', { examId }));
}

export async function updateExamQuestionMetadata(examId, problemId, changes) {
  const cleanExamId = normalizeId(examId).trim();
  const cleanProblemId = normalizeId(problemId).trim();
  if (!cleanExamId || !cleanProblemId) throw createServiceError('Thiếu mã đề hoặc câu hỏi', 0, 'VALIDATION_ERROR');
  return normalize(await mutate('update_exam_question_metadata', {
    examId: cleanExamId, problemId: cleanProblemId, topic: changes.topic, maxScore: changes.maxScore
  }));
}

export async function getContentSets(group = null) {
  return normalizeList(await request('content_sets', { group }));
}

export async function getContentBlocks(group = null) {
  return normalizeList(await request('content_blocks', { group }));
}

export async function getCatalogProblems(filters = {}) {
  return normalizeList(await request('problems', {
    setId: filters.setId,
    sourceGroup: filters.sourceGroup,
    contentKey: filters.contentKey,
    view: filters.runtime ? 'runtime' : ''
  }));
}

export async function getCatalogRules() {
  return normalizeList(await request('problems', { catalogRules: 1 }));
}

export async function updateCatalogItem(itemType, id, changes = {}) {
  return normalize(await mutate('update_catalog_item', { itemType, id, ...changes }));
}

export async function getContentRevisions(problemId) {
  return normalizeList(await request('content_revisions', { problemId }));
}

export async function getMathSupportProblems(page = 1, q = '') {
  const data = await apiFetch(`${DATA_API_URL}?${new URLSearchParams({ resource: 'math_support', page: String(page), q })}`);
  return { items: normalizeList(data.items), pagination: data.pagination };
}
export async function createMathSupport(payload) { return normalize(await mutate('create_math_support', payload)); }
export async function getMathSupportImage(problemId) {
  const data = await apiFetch(`${DATA_API_URL}?${new URLSearchParams({ resource: 'math_support_image', problemId })}`);
  return data.item;
}
export async function ocrMathSupport(image) {
  const data = await apiFetch('/api/ai-ocr-math', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, purpose: 'standalone_problem' }) }, MATH_OCR_TIMEOUT_MS);
  return data.data;
}

export async function updateUniversityTheory(payload) { return normalize(await mutate('update_university_theory',payload)); }

export async function updateCatalogContent(id, contentData = {}) {
  return normalize(await mutate('update_catalog_content', { id, ...contentData }));
}

export async function migrateTstReferenceLinks(sourceMap = {}) {
  return normalize(await mutate('migrate_tst_reference_links', { sourceMap }));
}

export async function updateProblemReferenceLinks(contentKey, referenceLinks = []) {
  return normalize(await mutate('update_problem_reference_links', { contentKey, referenceLinks }));
}

export async function restoreCatalogRevision(revisionId) {
  return normalize(await mutate('restore_catalog_revision', { revisionId }));
}

export async function saveProblem(problemData) {
  return normalize(await mutate('save_problem', problemData));
}

export async function submitSolution(
  problemId,
  problemTitle,
  solutionContent,
  evaluation = null,
  solutionImage = '',
  problemContext = {}
) {
  const cleanProblemId = String(problemId ?? '').trim();
  const cleanSolution = String(solutionContent ?? '').trim();
  const cleanImage = String(solutionImage ?? '').trim();

  if (!cleanProblemId) {
    throw createServiceError('Thiếu mã bài toán', 0, 'VALIDATION_ERROR');
  }

  if (!cleanSolution && !cleanImage) {
    throw createServiceError('Vui lòng nhập nội dung hoặc tải ảnh bài giải', 0, 'VALIDATION_ERROR');
  }

  return normalize(await mutate('submit_solution', {
    problemId: cleanProblemId,
    problemKey: String(problemContext?.problemKey ?? cleanProblemId).trim(),
    setId: normalizeId(problemContext?.setId).trim(),
    setTitle: String(problemContext?.setTitle ?? '').trim(),
    sourceType: String(problemContext?.sourceType ?? '').trim(),
    sourceGroup: String(problemContext?.sourceGroup ?? '').trim(),
    topic: String(problemContext?.topic ?? '').trim(),
    problemContent: String(problemContext?.problemContent ?? '').trim(),
    submissionKind: String(problemContext?.submissionKind ?? 'student_solution').trim(),
    aiGuide: problemContext?.aiGuide && typeof problemContext.aiGuide === 'object'
      ? problemContext.aiGuide
      : null,
    aiGuideAdminEdited: problemContext?.aiGuideAdminEdited === true,
    problemTitle: String(problemTitle ?? '').trim(),
    solutionContent: cleanSolution,
    evaluation: evaluation && typeof evaluation === 'object' ? evaluation : null,
    solutionImage: cleanImage
  }));
}

export async function getSubmissionImage(submissionId) {
  const cleanId = normalizeId(submissionId).trim();
  if (!cleanId) {
    throw createServiceError('Thiếu mã bài nộp', 0, 'VALIDATION_ERROR');
  }
  const items = await request('submission_image', { submissionId: cleanId });
  return items[0] || null;
}

export async function getSubmissionsForProblem(problemId) {
  return normalizeList(await request('submissions', { problemId }));
}

export async function getLatestAiGuide(problemId) {
  const items = normalizeList(await request('submissions', {
    problemId,
    submissionKind: 'ai_guide',
    own: 1,
    latest: 1
  }));
  return items[0] || null;
}

export async function getAllSubmissions() {
  return normalizeList(await request('submissions'));
}

export async function getSubmissionsPage(filters = {}) {
  return requestPage('submissions', {
    paged: 1,
    page: filters.page || 1,
    limit: filters.limit || 10,
    q: filters.q,
    username: filters.username,
    sourceGroup: filters.sourceGroup,
    evaluation: filters.evaluation,
    adminVerified: filters.adminVerified,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo
  });
}

export async function getActivityFeed(filters = {}) {
  return requestPage('activity_feed', {
    page: filters.page || 1,
    limit: filters.limit || 20,
    username: filters.username || ''
  });
}

export async function getLearningOverview(username = '') {
  const query = new URLSearchParams({ resource: 'learning_overview' });
  if (username) query.set('username', username);
  const data = await apiFetch(`${DATA_API_URL}?${query}`);
  return { overview: data.overview, accounts: Array.isArray(data.accounts) ? data.accounts : [] };
}

export async function getRagStatus() { return (await apiFetch(`${DATA_API_URL}?resource=rag_status`)).items?.[0]; }
export async function getRagLogs() { return normalizeList((await apiFetch(`${DATA_API_URL}?resource=rag_logs`)).items || []); }
export async function manageRag(action, payload = {}) {
  if (!['rag_setup', 'rag_backfill', 'rag_process', 'rag_benchmark'].includes(action)) throw new Error('Thao tác không hợp lệ');
  return mutate(action, payload);
}

export async function getTrendTheory(topic, method) {
  const items = normalizeList(await request('trend_theories', { topic, method }));
  return items[0] || null;
}

export async function saveTrendTheory(data) {
  return normalize(await mutate('save_trend_theory', data));
}

export async function updateTrendTheory(data) {
  return normalize(await mutate('update_trend_theory', data));
}

export async function deleteTrendTheory(topic, method) {
  return normalize(await mutate('delete_trend_theory', { topic, method }));
}

export async function getExamTrendReports() {
  return normalizeList(await request('exam_trend_reports'));
}

export async function saveExamTrendReport(reportData) {
  if (!reportData || typeof reportData !== 'object') {
    throw createServiceError('Báo cáo xu hướng không hợp lệ', 0, 'VALIDATION_ERROR');
  }
  return normalize(await mutate('save_exam_trend_report', reportData));
}

export async function updateExamTrendReport(id, edits) {
  const cleanId = normalizeId(id).trim();
  if (!cleanId) throw createServiceError('Thiếu mã báo cáo', 0, 'VALIDATION_ERROR');
  return normalize(await mutate('update_exam_trend_report', { id: cleanId, edits }));
}

export async function deleteExamTrendReport(id) {
  const cleanId = normalizeId(id).trim();
  if (!cleanId) throw createServiceError('Thiếu mã báo cáo', 0, 'VALIDATION_ERROR');
  return normalize(await mutate('delete_exam_trend_report', { id: cleanId }));
}

export async function deleteSubmission(id) {
  const cleanId = normalizeId(id).trim();
  if (!cleanId) {
    throw createServiceError('Thiếu mã bài nộp', 0, 'VALIDATION_ERROR');
  }
  return mutate('delete_submission', { id: cleanId });
}

export async function verifySubmission(id, verified, note = '') {
  const cleanId = normalizeId(id).trim();
  if (!/^[a-f0-9]{24}$/i.test(cleanId)) {
    throw createServiceError('ID bài nộp không hợp lệ', 0, 'VALIDATION_ERROR');
  }
  if (typeof verified !== 'boolean') {
    throw createServiceError('Trạng thái xác minh không hợp lệ', 0, 'VALIDATION_ERROR');
  }
  return normalize(await mutate('verify_submission', {
    id: cleanId,
    verified,
    note: String(note || '').trim().slice(0, 1000)
  }));
}

export async function updateSubmissionContent(id, solutionContent) {
  const cleanId = normalizeId(id).trim();
  const cleanContent = String(solutionContent || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(cleanId)) {
    throw createServiceError('ID bài nộp không hợp lệ', 0, 'VALIDATION_ERROR');
  }
  if (!cleanContent) {
    throw createServiceError('Nội dung lời giải văn bản không được để trống', 0, 'VALIDATION_ERROR');
  }
  return normalize(await mutate('update_submission_content', {
    id: cleanId,
    solutionContent: cleanContent.slice(0, 50_000)
  }));
}

export async function updateAiGuide(id, aiGuide, solutionContent) {
  const cleanId = normalizeId(id).trim();
  const cleanContent = String(solutionContent || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(cleanId)) {
    throw createServiceError('ID lời giải AI không hợp lệ', 0, 'VALIDATION_ERROR');
  }
  if (!aiGuide || typeof aiGuide !== 'object' || !String(aiGuide.solution || '').trim() || !cleanContent) {
    throw createServiceError('Nội dung AI hướng dẫn giải không hợp lệ', 0, 'VALIDATION_ERROR');
  }
  return normalize(await mutate('update_ai_guide', {
    id: cleanId,
    aiGuide,
    solutionContent: cleanContent.slice(0, 50_000)
  }));
}

export async function deleteAiGuide(id) {
  const cleanId = normalizeId(id).trim();
  if (!/^[a-f0-9]{24}$/i.test(cleanId)) {
    throw createServiceError('ID lời giải AI không hợp lệ', 0, 'VALIDATION_ERROR');
  }
  return mutate('delete_ai_guide', { id: cleanId });
}

export async function getEvents() {
  return normalizeList(await request('events'));
}

export async function addEvent(eventData) {
  return normalize(await mutate('add_event', eventData));
}

export async function deleteEvent(id) {
  return mutate('delete_event', { id: normalizeId(id) });
}

const VMODataService = Object.freeze({
  syncUserProfile,
  getAllUsers,
  getDocuments,
  addDocument,
  deleteDocument,
  getExams,
  addExam,
  updateExam,
  deleteExam,
  addExamQuestion,
  deleteExamQuestion,
  createExamFromOcr,
  getExamCatalog,
  getExamCatalogSummary,
  getExamCatalogDetail,
  searchExamCatalog,
  getHomeStats,
  saveExamImage,
  saveExamImages,
  getExamImage,
  getProblemsByExam,
  updateExamQuestionMetadata,
  getContentSets,
  getContentBlocks,
  getCatalogProblems,
  getCatalogRules,
  updateCatalogItem,
  getContentRevisions,
  updateCatalogContent,
  updateUniversityTheory,
  getMathSupportProblems, createMathSupport, getMathSupportImage, ocrMathSupport,
  migrateTstReferenceLinks,
  updateProblemReferenceLinks,
  restoreCatalogRevision,
  saveProblem,
  submitSolution,
  getSubmissionImage,
  getSubmissionsForProblem,
  getLatestAiGuide,
  getAllSubmissions,
  getSubmissionsPage,
  getActivityFeed,
  getLearningOverview,
  getRagStatus,
  getRagLogs,
  manageRag,
  getTrendTheory,
  saveTrendTheory,
  updateTrendTheory,
  deleteTrendTheory,
  getExamTrendReports,
  saveExamTrendReport,
  updateExamTrendReport,
  deleteExamTrendReport,
  deleteSubmission,
  verifySubmission,
  updateSubmissionContent,
  updateAiGuide,
  deleteAiGuide,
  getEvents,
  addEvent,
  deleteEvent
});

window.VMODataService = VMODataService;
window.invalidateVMODataCache = invalidateReadCache;
window.dispatchEvent(new CustomEvent('vmo:data-service-ready'));

console.info('[VMODataService] MongoDB Atlas API đã sẵn sàng');
