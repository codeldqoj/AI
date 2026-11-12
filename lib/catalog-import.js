import { contentHash } from './rag-core.js';

const CATEGORIES = Object.freeze({
  'vmo-mock': { group: 'mock_exam', type: 'mock_exam', questionType: 'mock_exam_question' },
  'tst-national': { group: 'tst', type: 'tst_exam', questionType: 'tst_question' },
  'history-dn-qn': { group: 'danang_quangnam', type: 'regional_exam', questionType: 'regional_question' },
  'vmo-official': { group: 'vmo_official', type: 'vmo_official_exam', questionType: 'vmo_official_question' },
  'imo-olympic': { group: 'imo_olympic', type: 'imo_olympic_exam', questionType: 'imo_olympic_question' },
  'olympic-30-4': { group: 'olympic_30_4', type: 'olympic_30_4_exam', questionType: 'olympic_30_4_question' },
  'duyen-hai-bac': { group: 'duyen_hai_bac', type: 'duyen_hai_bac_exam', questionType: 'duyen_hai_bac_question' },
  'specialized-admission': { group: 'specialized_admission', type: 'specialized_admission_exam', questionType: 'specialized_admission_question' }
});

const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function optionalFields(source, fields) {
  return Object.fromEntries(fields.flatMap(([key, max]) => {
    const value = text(source[key], max);
    return value ? [[key, value]] : [];
  }));
}

function cleanReferenceLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(item => {
    const label = text(Array.isArray(item) ? item[0] : item?.label, 300);
    const url = text(Array.isArray(item) ? item[1] : item?.url, 2000);
    return label && /^https?:\/\//i.test(url) ? { label, url } : null;
  }).filter(Boolean);
}

function cleanSourceUrls(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap(item => {
    const url = text(typeof item === 'string' ? item : item?.url, 2000);
    return /^https?:\/\//i.test(url) ? [url] : [];
  });
}

export async function importCatalogExam(db, payload, username, now = new Date()) {
  const source = payload?.exam;
  const category = text(source?.category, 80);
  const mapping = CATEGORIES[category];
  const examKey = text(source?.examKey, 220);
  const title = text(source?.title, 500);
  const targetAnchor = text(source?.targetAnchor, 220);
  const sourceProblems = Array.isArray(source?.problems) ? source.problems : [];
  if (!mapping || !examKey || !title || !targetAnchor || sourceProblems.length > 1000) {
    const error = new Error('Dữ liệu đề thi không hợp lệ hoặc danh mục không được hỗ trợ');
    error.status = 400;
    throw error;
  }
  const status = source.status === 'published' ? 'published' : 'draft';
  const dayNumber = Math.max(1, Math.floor(number(source.dayNumber, 1, 1, 999)));
  const setKey = text(source.setKey, 220) || text(sourceProblems[0]?.setKey, 220) || examKey;
  const province = text(source.province, 120);
  const year = text(source.year, 40);
  const examDoc = {
    examKey, category, targetAnchor, title, year, province,
    dayNumber, duration: number(source.duration, 180, 1, 600),
    region: text(source.region, 40), regionName: text(source.regionName, 120),
    description: text(source.description, 5000), examDate: text(source.examDate, 20),
    filter: text(source.filter, 120), parentAnchor: text(source.parentAnchor, 220),
    provinceOrder: number(source.provinceOrder, 0, 0, 100000),
    metaText: text(source.metaText, 5000), sourceUrls: cleanSourceUrls(source.sourceUrls),
    grade: number(source.grade, 0, 0, 12) || undefined,
    setKey, setNumber: number(source.setNumber, 0, 0, 1000) || undefined,
    provinceId: text(source.provinceId, 120), schoolId: text(source.schoolId, 150),
    schoolName: text(source.schoolName, 200), schoolAuthority: text(source.schoolAuthority, 80),
    status, origin: 'vmo-import', importedFrom: 'vmo-tst',
    importedBy: username, importedAt: now, updatedBy: username, updatedAt: now
  };
  for (const key of ['grade', 'setNumber']) if (examDoc[key] === undefined) delete examDoc[key];
  const contentKeys = new Set();
  for (const problem of sourceProblems) {
    const contentKey = text(problem?.contentKey, 220);
    if (!contentKey || typeof problem?.content !== 'string' || !problem.content.trim() ||
        problem.content.length > 50000 ||
        problem.referenceSolution != null && (typeof problem.referenceSolution !== 'string' ||
          problem.referenceSolution.length > 100000) ||
        !Math.floor(number(problem?.questionNumber, 0, 1, 1000)) || contentKeys.has(contentKey)) {
      const error = new Error('Câu hỏi thiếu khóa, nội dung, số thứ tự hợp lệ hoặc bị trùng');
      error.status = 400;
      throw error;
    }
    contentKeys.add(contentKey);
  }
  const existingExam = await db.collection('exams').findOne(
    { examKey },
    { projection: { _id: 1, category: 1, targetAnchor: 1, title: 1 } }
  );
  if (existingExam && (existingExam.category !== category ||
      existingExam.targetAnchor !== targetAnchor || existingExam.title !== title)) {
    const error = new Error('Mã đề đã tồn tại và không thuộc dữ liệu nhập từ VMO');
    error.status = 409;
    throw error;
  }
  const existingSet = await db.collection('content_sets').findOne(
    { key: setKey },
    { projection: { group: 1, title: 1, examKey: 1 } }
  );
  if (existingSet && (existingSet.group !== mapping.group || existingSet.title !== title ||
      existingSet.examKey && existingSet.examKey !== examKey)) {
    const error = new Error('Mã nhóm đề đã tồn tại và không thuộc dữ liệu nhập từ VMO');
    error.status = 409;
    throw error;
  }
  const existingProblems = await db.collection('problems').find(
    { contentKey: { $in: [...contentKeys] } },
    { projection: { contentKey: 1, examId: 1, examKey: 1, importedFrom: 1 } }
  ).toArray();
  if (existingProblems.some(problem => problem.importedFrom !== 'vmo-tst' ||
      (problem.examKey ? problem.examKey !== examKey
        : !existingExam || String(problem.examId) !== String(existingExam._id)))) {
    const error = new Error('Khóa câu hỏi trùng với một đề khác trong cơ sở dữ liệu');
    error.status = 409;
    throw error;
  }
  const exams = db.collection('exams');
  const savedExam = await exams.findOneAndUpdate(
    { examKey },
    { $set: examDoc, $setOnInsert: { createdBy: username, createdAt: now } },
    { upsert: true, returnDocument: 'after' }
  );
  const examId = savedExam?._id;
  if (!examId) throw new Error('Không thể tạo đề trong cơ sở dữ liệu');

  const sets = db.collection('content_sets');
  const savedSet = await sets.findOneAndUpdate(
    { key: setKey },
    { $set: {
      key: setKey, contentType: mapping.type, title,
      group: mapping.group, year, province, status,
      examId: String(examId), examKey,
      ...(examDoc.grade ? { grade: examDoc.grade } : {}),
      origin: 'vmo-import', importedFrom: 'vmo-tst',
      updatedBy: username, updatedAt: now
    }, $setOnInsert: { createdAt: now } },
    { upsert: true, returnDocument: 'after' }
  );
  if (!savedSet?._id) throw new Error('Không thể tạo nhóm đề trong cơ sở dữ liệu');

  const seen = new Set();
  const operations = sourceProblems.map(problem => {
    const contentKey = text(problem?.contentKey, 220);
    const content = problem?.content;
    const questionNumber = Math.floor(number(problem?.questionNumber, 0, 1, 1000));
    if (!contentKey || !content || !questionNumber || seen.has(contentKey)) {
      const error = new Error('Câu hỏi thiếu khóa, nội dung, số thứ tự hợp lệ hoặc bị trùng');
      error.status = 400;
      throw error;
    }
    seen.add(contentKey);
    const referenceSolution = typeof problem.referenceSolution === 'string' ? problem.referenceSolution : '';
    const referenceSolutionVerified = Boolean(referenceSolution && problem.referenceSolutionVerified === true);
    const sourceVerifiedAt = problem.referenceSolutionVerifiedAt ? new Date(problem.referenceSolutionVerifiedAt) : null;
    const guideReview = problem.generatedGuide?.success === true && problem.generatedGuide?.guide &&
      typeof problem.generatedGuide.guide.solution === 'string' && problem.generatedGuide.guide.solution.trim()
      ? {
          pipeline: 'vmo-ai-guide',
          model: text(problem.generatedGuide.model, 160),
          solverProvider: text(problem.generatedGuide.providers?.solver, 40),
          verifierProvider: text(problem.generatedGuide.providers?.verifier, 40),
          score: text(problem.generatedGuide.guide.quality?.score, 20),
          automatedReviewPassed: problem.generatedGuide.guide.quality?.verified === true,
          summary: text(problem.generatedGuide.guide.quality?.summary, 1000),
          generatedAt: problem.generatedGuide.generatedAt && Number.isFinite(new Date(problem.generatedGuide.generatedAt).getTime())
            ? new Date(problem.generatedGuide.generatedAt) : now
        }
      : null;
    const problemDoc = {
      contentKey, setId: savedSet._id, setKey, setTitle: title,
      examId: String(examId), examKey,
      sourceGroup: mapping.group,
      sourceType: mapping.questionType,
      frontendAnchor: targetAnchor,
      title: text(problem.title, 500) || `Câu ${questionNumber}`,
      shortLabel: text(problem.shortLabel, 120) || `Câu ${questionNumber}`,
      questionNumber, dayNumber,
      day: text(problem.day, 80) || `Ngày ${dayNumber}`,
      order: number(problem.order, dayNumber * 100 + questionNumber, 0, 1000000),
      orderNumber: number(problem.orderNumber, questionNumber, 0, 1000000),
      topic: text(problem.topic, 120) || 'Toán Olympic',
      maxScore: number(problem.maxScore, 0, 0, 20),
      content, contentFormat: text(problem.contentFormat, 40) || 'html-latex',
      referenceSolution,
      referenceSolutionVerified,
      referenceSolutionProblemHash: referenceSolutionVerified ? contentHash(content) : '',
      referenceSolutionVerifiedBy: referenceSolutionVerified ? text(problem.referenceSolutionVerifiedBy, 120) : '',
      referenceSolutionVerifiedAt: referenceSolutionVerified && sourceVerifiedAt && Number.isFinite(sourceVerifiedAt.getTime())
        ? sourceVerifiedAt : null,
      referenceSolutionOrigin: guideReview ? 'vmo-ai-guide' : (referenceSolution ? 'vmo-tst' : ''),
      ...(guideReview ? { referenceSolutionReview: guideReview } : {}),
      referenceLinks: cleanReferenceLinks(problem.referenceLinks),
      allowSubmission: problem.allowSubmission !== false,
      allowAiEvaluation: problem.allowAiEvaluation !== false,
      status: status === 'published' && problem.status === 'published' ? 'published' : 'draft',
      difficulty: text(problem.difficulty, 40),
      chapterNumber: number(problem.chapterNumber, 0, 0, 1000),
      catalogSourceKey: text(problem.catalogSourceKey, 220),
      legacyIds: Array.isArray(problem.legacyIds) ? problem.legacyIds.slice(0, 20).map(value => text(value, 220)).filter(Boolean) : [],
      ...(examDoc.grade ? { grade: examDoc.grade } : {}),
      ...optionalFields(problem, [['schoolId', 150], ['schoolName', 200], ['schoolAuthority', 80], ['provinceId', 120]]),
      importedFrom: 'vmo-tst', sourceContentKey: contentKey,
      updatedBy: username, updatedAt: now
    };
    return { updateOne: {
      filter: { contentKey },
      update: { $set: problemDoc, $setOnInsert: { createdAt: now, version: 1 } },
      upsert: true
    } };
  });

  if (operations.length) await db.collection('problems').bulkWrite(operations, { ordered: true });

  return { examKey, category, examId: String(examId), problemCount: operations.length,
    verifiedSolutionCount: sourceProblems.filter(problem => problem?.referenceSolutionVerified === true &&
      text(problem.referenceSolution, 100000)).length, status };
}
