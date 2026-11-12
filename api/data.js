import {readBooks, mutateBooks, readBookAsset} from '../lib/books.js';
import { universityCatalog, resolveUniversityCourse, addUniversityCatalogItem, UNIVERSITY_MAX_DAYS, UNIVERSITY_MAX_QUESTIONS } from '../lib/university-catalog.js';
import { getUniversityMaterials, universityMaterialCatalog, updateUniversityTheory } from '../lib/university-materials.js';
import { universityExamSection } from '../lib/university-courses.js';
import { serveEducationPage } from '../lib/app-shell.js';
import { allows } from '../lib/education-access.js';
import { educationDb } from '../lib/education-db.js';
import { getCatalogTotals } from '../lib/home-stats.js';
import { cleanGeometryDiagram } from '../lib/geometry-diagram.js';
import { canAccessProblem, hideUnverifiedReferenceSolution, supportVisibility } from '../lib/problem-access.js';
import { handleMathSupport } from '../lib/math-support.js';
import { specializedSchool } from '../lib/specialized-schools.js';
import { runBenchmarkCase, validateBenchmarkCase } from '../lib/rag-benchmark.js';
import { checkRateLimit } from '../lib/ai.js';
import { RAG_VERSION, contentHash } from '../lib/rag-core.js';
import { queueSource, queueReferenceSolution, setupRag, backfillSources, processRagJobs } from '../lib/rag-store.js';
import { embeddingConfig } from '../lib/rag-embedding.js';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { getSession } from '../lib/session.js';
import { deleteAiGuideRecord, learningScope, recordActivity, summarizeLearning } from '../lib/learning.js';
import { cleanTrendTheory } from '../lib/trend-theory-storage.js';
import { buildSubmissionContentUpdate, buildSubmissionVerificationUpdate } from '../lib/submission-verification.js';
import { importCatalogExam } from '../lib/catalog-import.js';

const ALLOWED_RESOURCES = new Set(['book_asset', 'books', 'university_catalog', 'university_materials', 'math_support', 'math_support_image', 'documents', 'exams', 'exam_catalog', 'home_stats', 'exam_image', 'content_sets', 'content_blocks', 'problems', 'content_revisions', 'submissions', 'submission_image', 'events', 'activity_feed', 'learning_overview', 'exam_trend_reports', 'trend_theories', 'rag_status', 'rag_logs']);
const TST_REGIONS = new Set(['BAC', 'TRUNG', 'NAM']);
const EXAM_TREND_TOPICS = [
  'Dãy số và Giới hạn dãy số', 'Phương trình hàm', 'Số học và dãy số',
  'Hình học phẳng', 'Đa thức', 'Tổ hợp'
];
const MAX_SOLUTION_IMAGE_CHARS = 3_000_000;
const MAX_EXAM_IMAGE_BATCH_CHARS = 3_500_000;
const MAX_EXAM_IMAGE_PAGES = 20;

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body); } catch { return null; }
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanSolutionImage(value) {
  if (!value) return '';
  const image = String(value).trim();
  if (image.length > MAX_SOLUTION_IMAGE_CHARS) return null;
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image)
    ? image
    : null;
}

function cleanReferenceLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(item => {
    const label = cleanText(Array.isArray(item) ? item[0] : item?.label, 300);
    const url = cleanText(Array.isArray(item) ? item[1] : item?.url, 2000);
    if (!label || !/^https?:\/\//i.test(url)) return null;
    return { label, url };
  }).filter(Boolean);
}

function cleanRagProvenance(value) {
  if (!value || typeof value !== 'object') return null;
  return { id: cleanText(value.id, 80), mode: ['exact', 'hybrid', 'none'].includes(value.mode) ? value.mode : 'none',
    sources: (Array.isArray(value.sources) ? value.sources : []).slice(0, 3).map(item => ({
      sourceId: cleanText(item.sourceId, 80), problemKey: cleanText(item.problemKey, 180),
      matchType: item.matchType === 'exact' ? 'exact' : 'similar', problemContentHash: cleanText(item.problemContentHash, 80)
    })) };
}

function cleanAiGuide(value) {
  if (!value || typeof value !== 'object') return null;
  const quality = value.quality && typeof value.quality === 'object'
    ? {
        verified: value.quality.verified === true,
        score: cleanText(value.quality.score, 20),
        verifier: cleanText(value.quality.verifier, 120),
        retrieval: cleanRagProvenance(value.quality.retrieval)
      }
    : null;
  return {
    branch: cleanText(value.branch, 300),
    geometryRequested: value.geometryRequested === true,
    geometry: cleanGeometryDiagram(value.geometry),
    knowledge: cleanText(value.knowledge, 50000),
    intuition: cleanText(value.intuition, 50000),
    solution: cleanText(value.solution, 100000),
    pitfalls: cleanText(value.pitfalls, 50000),
    quality
  };
}

function cleanStringList(value, limit = 20, max = 2500) {
  return (Array.isArray(value) ? value : []).slice(0, limit)
    .map(item => cleanText(item, max)).filter(Boolean);
}

function cleanExamTrendReport(payload) {
  const settings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const evidence = payload?.evidence && typeof payload.evidence === 'object' ? payload.evidence : {};
  const report = payload?.report && typeof payload.report === 'object' ? payload.report : {};
  const quality = payload?.quality && typeof payload.quality === 'object' ? payload.quality : {};
  const topicTrends = (Array.isArray(report.topicTrends) ? report.topicTrends : []).slice(0, 6).map(item => ({
    topic: cleanText(item?.topic, 120),
    questionCount: cleanNumber(item?.questionCount, 0, 0, 10000),
    prevalencePercent: cleanNumber(item?.prevalencePercent, 0, 0, 100),
    evidenceIds: cleanStringList(item?.evidenceIds, 4000, 180),
    trendLevel: cleanText(item?.trendLevel, 80),
    observations: cleanText(item?.observations, 4000),
    frequentMethods: (Array.isArray(item?.frequentMethods) ? item.frequentMethods : []).slice(0, 12).map(method => ({
      name: cleanText(method?.name, 240), frequency: cleanNumber(method?.frequency, 0, 0, 10000),
      evidenceIds: cleanStringList(method?.evidenceIds, 4000, 180),
      practiceEvidenceIds: cleanStringList(method?.practiceEvidenceIds, 4000, 180),
      note: cleanText(method?.note, 1600)
    })).filter(method => method.name)
  })).filter(item => item.topic);
  if (topicTrends.length !== 6 || topicTrends.some((item, index) => item.topic !== EXAM_TREND_TOPICS[index])) return null;
  const qualityStatus = ['approved', 'rejected', 'unavailable', 'checked', 'limited'].includes(quality.status) ? quality.status : 'unavailable';
  return {
    settings: {
      mode: settings.mode === 'year' ? 'year' : settings.mode === 'target' ? 'target' : '',
      year: cleanText(settings.year, 20), targetType: settings.targetType === 'vmo' ? 'vmo' : 'tst',
      lookback: cleanNumber(settings.lookback, 0, 0, 15),
      includeCurrentYear: settings.includeCurrentYear === true,
      anchor: cleanKey(settings.anchor, 100), province: cleanText(settings.province, 120)
    },
    evidence: {
      years: cleanStringList(evidence.years, 15, 20),
      missingYears: cleanStringList(evidence.missingYears, 15, 20),
      sampleCount: cleanNumber(evidence.sampleCount, 0, 0, 10000),
      yearCounts: (Array.isArray(evidence.yearCounts) ? evidence.yearCounts : []).slice(0, 15).map(item => ({
        year: cleanText(item?.year, 20), examCount: cleanNumber(item?.examCount, 0, 0, 1000),
        questionCount: cleanNumber(item?.questionCount, 0, 0, 10000)
      })),
      examCount: cleanNumber(evidence.examCount, 0, 0, 1000),
      questionCount: cleanNumber(evidence.questionCount, 0, 0, 10000),
      otherQuestionCount: cleanNumber(evidence.otherQuestionCount, 0, 0, 10000),
      unitCount: cleanNumber(evidence.unitCount, 0, 0, 1000),
      historyCurrentProvince: cleanText(evidence.historyCurrentProvince, 120),
      historyMembers: cleanStringList(evidence.historyMembers, 5, 120),
      mergedProvinceHistory: evidence.mergedProvinceHistory === true,
      sources: (Array.isArray(evidence.sources) ? evidence.sources : []).slice(0, 80).map(item => ({
        year: cleanText(item?.year, 20), unit: cleanText(item?.unit, 120),
        historicalUnit: cleanText(item?.historicalUnit, 120), title: cleanText(item?.title, 300),
        source: cleanText(item?.source, 1000), questionCount: cleanNumber(item?.questionCount, 0, 0, 100)
      })),
      samples: (Array.isArray(evidence.samples) ? evidence.samples : []).slice(0, 240).map(item => ({
        sourceId: cleanText(item?.sourceId, 180), year: cleanText(item?.year, 20),
        unit: cleanText(item?.unit, 120), historicalUnit: cleanText(item?.historicalUnit, 120),
        title: cleanText(item?.title, 300),
        questionNumber: cleanNumber(item?.questionNumber, 0, 0, 100), rawTopic: cleanText(item?.rawTopic, 120),
        criterion: cleanText(item?.criterion, 120), excerpt: cleanText(item?.excerpt, 600)
      })).filter(item => item.sourceId)
    },
    report: {
      title: cleanText(report.title, 300), executiveSummary: cleanText(report.executiveSummary, 6000), topicTrends,
      recurringPatterns: (Array.isArray(report.recurringPatterns) ? report.recurringPatterns : []).slice(0, 20).map(item => ({
        pattern: cleanText(item?.pattern, 300), frequency: cleanNumber(item?.frequency, 0, 0, 10000),
        evidenceIds: cleanStringList(item?.evidenceIds, 240, 180), analysis: cleanText(item?.analysis, 2400)
      })).filter(item => item.pattern),
      unitInsights: (Array.isArray(report.unitInsights) ? report.unitInsights : []).slice(0, 50).map(item => ({
        unit: cleanText(item?.unit, 160), dominantTopics: cleanStringList(item?.dominantTopics, 6, 160),
        note: cleanText(item?.note, 2000)
      })).filter(item => item.unit),
      limitations: cleanStringList(report.limitations, 15, 1200), conclusion: cleanText(report.conclusion, 5000)
    },
    quality: {
      status: qualityStatus,
      verified: qualityStatus === 'approved' && quality.verified === true,
      score: quality.score !== null && quality.score !== '' && Number.isFinite(Number(quality.score))
        ? cleanNumber(quality.score, 0, 0, 5) : null,
      summary: cleanText(quality.summary, 4000), criticalIssues: cleanStringList(quality.criticalIssues, 20, 2500),
      corrections: cleanStringList(quality.corrections, 20, 2500),
      topicChecks: (Array.isArray(quality.topicChecks) ? quality.topicChecks : []).slice(0, 6).map(item => ({
        topic: cleanText(item?.topic, 120), valid: item?.valid === true, reason: cleanText(item?.reason, 2000)
      })), verifierModel: cleanText(quality.verifierModel, 100), pipeline: 'Gemini → GPT'
    },
    model: cleanText(payload?.model, 100), generatedAt: cleanText(payload?.generatedAt, 50)
  };
}

function objectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function cleanKey(value, max = 180) {
  return cleanText(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugKey(value, max = 120) {
  return cleanText(value, max)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, match => match === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanNumber(value, fallback = 0, min = 0, max = 10000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function accentInsensitiveRegex(value) {
  const variants = {
    a: '[aàáảãạăằắẳẵặâầấẩẫậ]',
    e: '[eèéẻẽẹêềếểễệ]',
    i: '[iìíỉĩị]',
    o: '[oòóỏõọôồốổỗộơờớởỡợ]',
    u: '[uùúủũụưừứửữự]',
    y: '[yỳýỷỹỵ]',
    d: '[dđ]'
  };
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi').replace(/đ/g, 'd').split('')
    .map(char => variants[char] || escapeRegex(char)).join('');
}

function problemSnapshot(problem) {
  if (!problem) return null;
  return {
    contentKey: problem.contentKey,
    title: problem.title,
    setTitle: problem.setTitle,
    sourceType: problem.sourceType,
    sourceGroup: problem.sourceGroup,
    frontendAnchor: problem.frontendAnchor,
    questionNumber: problem.questionNumber,
    chapterNumber: problem.chapterNumber,
    day: problem.day,
    maxScore: problem.maxScore,
    topic: problem.topic,
    content: problem.content,
    version: problem.version || 1
  };
}

function requireContentManager(session, res) {
  if (['admin', 'teacher'].includes(session.role)) return true;
  res.status(403).json({ success: false, error: 'Chỉ Admin hoặc Giáo viên được thực hiện thao tác này' });
  return false;
}

async function refreshRagSource(db, id) {
  try { await queueSource(db, id); }
  catch (error) { console.error('[RAG QUEUE]', String(id), error.message); }
}
async function refreshRagReference(db, id) {
  try { await queueReferenceSolution(db, id); }
  catch (error) { console.error('[RAG REFERENCE QUEUE]', String(id), error.message); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = await getSession(req);
  if (['app_shell', 'protected_asset', 'blocked_static'].includes(req.query?.resource)) {
    if (req.method !== 'GET') return res.status(405).end();
    try { if (await serveEducationPage(req, res, session)) return; }
    catch { return res.status(500).json({ success: false, error: 'Không tải được giao diện học tập' }); }
  }
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });

  try {
    const db = educationDb(await getDb(), session);
    if (await handleMathSupport({ db, req, res, session })) return;

    if (req.method === 'GET') {
      const resource = cleanText(req.query?.resource, 30);
      if (['exam_trend_reports', 'trend_theories', 'rag_status', 'rag_logs'].includes(resource) && !allows(session, 'upper_secondary')) return res.status(403).json({ success: false, error: 'Nội dung thuộc cấp Trung học phổ thông' });
      if (!ALLOWED_RESOURCES.has(resource)) {
        return res.status(400).json({ success: false, error: 'Loại dữ liệu không hợp lệ' });
      }

      if (resource === 'activity_feed' || resource === 'learning_overview') {
        const scope = learningScope(session, cleanText(req.query?.username, 64));
        if (!scope) return res.status(403).json({ success: false, error: 'Bạn chỉ được xem dữ liệu của tài khoản mình' });
        let userFilter = { ...scope };
        if (['admin', 'teacher'].includes(session.role) && scope.username) {
          const account = await db.collection('users').findOne({ username: scope.username }, { projection: { _id: 1 } });
          if (!account) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
          userFilter = { userId: String(account._id) };
        }
        if (resource === 'activity_feed') {
          const page = cleanNumber(req.query?.page, 1, 1, 100000);
          const limit = cleanNumber(req.query?.limit, 20, 5, 50);
          const events = db.collection('activity_events');
          const total = await events.countDocuments(userFilter);
          const pages = Math.max(1, Math.ceil(total / limit));
          const safePage = Math.min(page, pages);
          const items = await events.find(userFilter, { projection: {
            userId: 1, username: 1, action: 1, details: 1, createdAt: 1
          } }).sort({ createdAt: -1, _id: -1 }).skip((safePage - 1) * limit).limit(limit).toArray();
          return res.status(200).json({ success: true, items, pagination: { page: safePage, limit, total, pages } });
        }
        const [users, rows] = await Promise.all([
          db.collection('users').find(['admin', 'teacher'].includes(session.role) ? {} : { _id: objectId(String(session.sub)) }, {
            projection: { username: 1, fullName: 1, role: 1 }
          }).sort({ username: 1 }).toArray(),
          db.collection('submissions').find({ ...userFilter, $or: [
            { submissionKind: 'ai_guide', solutionContent: { $type: 'string', $ne: '' } },
            { submissionKind: { $ne: 'ai_guide' }, evaluation: { $type: 'object' } }
          ] }, { projection: {
            userId: 1, username: 1, authorName: 1, problemId: 1, problemKey: 1,
            problemTitle: 1, 'problemSnapshot.title': 1, 'problemSnapshot.setTitle': 1,
            'problemSnapshot.sourceGroup': 1, 'problemSnapshot.frontendAnchor': 1,
            setTitle: 1, sourceGroup: 1, submissionKind: 1,
            'evaluation.estimatedScore': 1, score: 1, createdAt: 1, updatedAt: 1
          } }).toArray()
        ]);
        const selectedUsers = userFilter.userId ? users.filter(user => String(user._id) === userFilter.userId) : users;
        const overview = summarizeLearning(rows, selectedUsers, scope.username || '');
        return res.status(200).json({ success: true, overview, accounts: users.map(user => ({
          username: user.username, fullName: user.fullName || user.username, role: user.role || 'student'
        })) });
      }

      if (resource === 'submission_image') {
        const submissionId = objectId(cleanText(req.query?.submissionId, 80));
        if (!submissionId) {
          return res.status(400).json({ success: false, error: 'Mã bài nộp không hợp lệ' });
        }

        const submission = await db.collection('submissions').findOne(
          { _id: submissionId },
          { projection: { userId: 1, hasImage: 1 } }
        );
        if (!submission) return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp' });
        if (!['admin', 'teacher'].includes(session.role) && String(submission.userId) !== String(session.sub)) {
          return res.status(403).json({ success: false, error: 'Bạn không có quyền xem ảnh này' });
        }

        const stored = await db.collection('submission_images').findOne(
          { submissionId },
          { projection: { _id: 0, image: 1, mimeType: 1, createdAt: 1 } }
        );
        return res.status(200).json({ success: true, items: stored ? [stored] : [] });
      }

      if (resource === 'exam_image') {
        const examId = objectId(cleanText(req.query?.examId, 80));
        const pageNumber = Math.max(1, Number(req.query?.pageNumber) || 1);
        if (!examId) return res.status(400).json({ success: false, error: 'Mã đề thi không hợp lệ' });
        const exam = await db.collection('exams').findOne({ _id: examId }, { projection: { status: 1 } });
        if (!exam) return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi' });
        if (!['admin', 'teacher'].includes(session.role) && exam.status !== 'published') {
          return res.status(403).json({ success: false, error: 'Đề thi chưa được công khai' });
        }
        const stored = await db.collection('exam_images').findOne(
          { examId, pageNumber },
          { projection: { _id: 0, image: 1, mimeType: 1, pageNumber: 1, createdAt: 1 } }
        );
        return res.status(200).json({ success: true, items: stored ? [stored] : [] });
      }

      if (resource === 'content_revisions') {
        if (!requireContentManager(session, res)) return;
        const problemId = objectId(cleanText(req.query?.problemId, 80));
        if (!problemId) return res.status(400).json({ success: false, error: 'Mã câu hỏi không hợp lệ' });
        if (!await db.collection('problems').findOne({ _id: problemId })) return res.status(403).json({ success: false, error: 'Không có quyền truy cập câu hỏi' });
        const items = await db.collection('content_revisions')
          .find({ problemId })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();
        return res.status(200).json({ success: true, items });
      }

      if (resource === 'rag_status' || resource === 'rag_logs') {
        if (!requireContentManager(session, res)) return;
        if (resource === 'rag_logs') {
          const items = await db.collection('rag_retrieval_logs').find({}).sort({ createdAt: -1 }).limit(30).toArray();
          return res.status(200).json({ success: true, items });
        }
        const knowledge = await db.collection('verified_knowledge').aggregate([
          { $group: { _id: '$status', count: { $sum: 1 }, tokens: { $sum: '$embeddingTokens' },
            estimatedUsd: { $sum: '$estimatedUsd' } } }]).toArray();
        const jobs = await db.collection('rag_index_jobs').aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray();
        const currentMetadataSources = await db.collection('verified_knowledge').countDocuments({ status: 'active', metadataVersion: RAG_VERSION });
        let indexes = [], indexError = '';
        try { indexes = (await db.collection('verified_knowledge').listSearchIndexes().toArray()).map(item => ({ name: item.name, status: item.status, queryable: item.queryable })); }
        catch (error) { indexError = String(error.message).slice(0, 150); }
        return res.status(200).json({ success: true, items: [{ knowledge, jobs, indexes, indexError,
          embeddingConfigured: Boolean(process.env.OPENAI_API_KEY), metadataVersion: RAG_VERSION, currentMetadataSources, config: embeddingConfig() }] });
      }

      if (resource === 'trend_theories') {
        const topic = cleanText(req.query?.topic, 120);
        const method = cleanText(req.query?.method, 240);
        if (!topic || !method) return res.status(400).json({ success: false, error: 'Thiếu chuyên đề' });
        const item = await db.collection('trend_theories').findOne({ topic, method, deletedAt: { $exists: false } });
        return res.status(200).json({ success: true, items: item ? [item] : [] });
      }

      if (resource === 'exam_trend_reports') {
        // Mẫu bằng chứng chi tiết vẫn được lưu để kiểm toán, nhưng không tải lại
        // trong danh sách nhằm tránh làm nặng Database Hub khi đã có nhiều báo cáo.
        const items = await db.collection('exam_trend_reports').find({ deletedAt: { $exists: false }, ...(!['admin', 'teacher'].includes(session.role) ? { ownerId: String(session.sub) } : {}) }, { projection: { 'evidence.samples': 0, revisions: 0 } })
          .sort({ createdAt: -1, _id: -1 }).limit(100).toArray();
        return res.status(200).json({ success: true, items });
      }

      if(resource === 'book_asset') {
        try{const asset=await readBookAsset(session,req.query.asset);res.setHeader('Content-Type',asset.mime);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=3600');return res.status(200).send(asset.bytes);}
        catch(error){if(error.status)return res.status(error.status).json({success:false,error:error.message});throw error;}
      }
      if(resource === 'books') {
        try{return res.status(200).json({success:true,item:await readBooks(db,session,req.query)});}
        catch(error){if(error.status)return res.status(error.status).json({success:false,error:error.message});throw error;}
      }
      if(resource === 'university_catalog') {
        if(!allows(session,'university'))return res.status(403).json({success:false,error:'Nội dung thuộc cấp Đại học'});
        return res.status(200).json({success:true,item:await universityCatalog(db,session)});
      }
      if (resource === 'university_materials') {
        if (!allows(session,'university')) return res.status(403).json({success:false,error:'Tài liệu thuộc cấp Đại học'});
        const courseId=cleanText(req.query?.courseId,90);
        if (!courseId) return res.status(200).json({success:true,item:await universityMaterialCatalog(db,session)});
        if (!await resolveUniversityCourse(db,courseId)) return res.status(400).json({success:false,error:'Học phần không hợp lệ'});
        return res.status(200).json({success:true,item:await getUniversityMaterials(db,session,courseId)});
      }

      if (resource === 'home_stats') {
        // Chỉ lấy khóa định danh và số ví dụ từ MongoDB để hiển thị thống kê.
        // Không tải problems/nội dung đề, nên request này vẫn nhẹ.
        const homeExamFilter = {
          category: { $in: ['tst-national', 'history-dn-qn', 'vmo-mock', 'vmo-official', 'imo-olympic'] },
          status: { $ne: 'deleted' }
        };
        const homeExampleFilter = {
          sourceType: 'specialty_example',
          referenceSolution: { $type: 'string', $ne: '' }
        };
        // Đồng nhất với catalog: admin thấy toàn bộ dữ liệu, thành viên chỉ
        // thấy nội dung đã công khai.
        if (!['admin', 'teacher'].includes(session.role)) {
          homeExamFilter.status = 'published';
          homeExampleFilter.status = 'published';
        }
        const [exams, specialtyExamples, totals] = await Promise.all([
          db.collection('exams').find(
            homeExamFilter,
            {
              projection: {
                _id: 0,
                category: 1,
                targetAnchor: 1,
                setNumber: 1,
                dayNumber: 1
              }
            }
          ).limit(500).toArray(),
          db.collection('problems').countDocuments(homeExampleFilter),
          getCatalogTotals(db, session)
        ]);
        return res.status(200).json({ success: true, items: [{ exams, specialtyExamples, ...totals }] });
      }

      if (resource === 'exam_catalog') {
        const examFilter = { category: cleanText(req.query?.category, 80) || 'tst-national', status: { $ne: 'deleted' } };
        if (!['admin', 'teacher'].includes(session.role)) examFilter.status = 'published';
        if (examFilter.category === 'university' && req.query?.courseId) {
          if (!await resolveUniversityCourse(db,req.query.courseId)) return res.status(400).json({ success: false, error: 'Học phần không hợp lệ' });
          examFilter.courseId = req.query.courseId;
        }
        if (examFilter.category === 'university' && req.query?.sectionId) {
          const section=(await resolveUniversityCourse(db,examFilter.courseId))?.sections.find(s=>s.id===req.query.sectionId);
          if(!section) return res.status(400).json({success:false,error:'Chuyên đề con không hợp lệ'});
          examFilter.sectionId=section.id;
        }
        if (req.query?.grade != null && ['olympic-30-4', 'duyen-hai-bac'].includes(examFilter.category)) {
          const grade = Number(req.query.grade);
          if (![10, 11].includes(grade)) return res.status(400).json({ success: false, error: 'Khối lớp không hợp lệ' });
          examFilter.grade = grade;
        }
        const view = cleanText(req.query?.view, 20);
        if (view === 'summary') {
          const projection = {
            examKey: 1, targetAnchor: 1, category: 1, title: 1, province: 1,
            courseId: 1, courseCode: 1, courseName: 1, sectionId: 1, sectionTitle: 1, sectionNumber: 1, educationLevel: 1, schoolId: 1, schoolName: 1, schoolAuthority: 1, provinceId: 1, provinceOrder: 1, region: 1, regionName: 1, questionCount: 1, year: 1, grade: 1, setNumber: 1, dayNumber: 1,
            examDate: 1, duration: 1, description: 1, status: 1, origin: 1, sourceImageCount: 1
          };
          const exams = await db.collection('exams').find(examFilter, { projection })
            .sort({ provinceOrder: 1, dayNumber: 1, createdAt: 1 }).limit(examFilter.category === 'university' ? 1000 : 200).toArray();
          const problemFilter = { examId: { $in: exams.map(exam => String(exam._id)) }, status: { $ne: 'deleted' } };
          if (!['admin', 'teacher'].includes(session.role)) problemFilter.status = 'published';
          const counts = exams.length ? await db.collection('problems').aggregate([
            { $match: problemFilter }, { $group: { _id: '$examId', count: { $sum: 1 } } }
          ]).toArray() : [];
          const countByExam = new Map(counts.map(item => [String(item._id), item.count]));
          return res.status(200).json({ success: true, items: exams.map(exam => ({
            ...exam, problemCount: countByExam.get(String(exam._id)) || 0
          })) });
        }
        if (view === 'detail') {
          const anchor = cleanText(req.query?.anchor, 220);
          if (!anchor) return res.status(400).json({ success: false, error: 'Thiếu mã đề thi' });
          const year = cleanText(req.query?.year, 20);
          if (year && !/^20\d{2}-20\d{2}$/.test(year)) return res.status(400).json({ success: false, error: 'Năm học không hợp lệ' });
          const yearFilter = year ? { year: { $in: [year, year.replace('-', '–'), year.replace('-', '—')] } } : {};
          const exams = await db.collection('exams').find({ ...examFilter, targetAnchor: anchor, ...yearFilter })
            .sort({ dayNumber: 1, createdAt: 1 }).limit(examFilter.category === 'university' ? UNIVERSITY_MAX_DAYS : 20).toArray();
          if (!exams.length) return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi' });
          const problemFilter = { examId: { $in: exams.map(exam => String(exam._id)) }, status: { $ne: 'deleted' } };
          if (!['admin', 'teacher'].includes(session.role)) problemFilter.status = 'published';
          const problems = await db.collection('problems').find(problemFilter)
            .sort({ orderNumber: 1, questionNumber: 1 }).limit(examFilter.category === 'university' ? UNIVERSITY_MAX_QUESTIONS * exams.length : 500).toArray();
          const byExam = new Map();
          problems.forEach(problem => {
            const key = String(problem.examId);
            if (!byExam.has(key)) byExam.set(key, []);
            byExam.get(key).push(problem);
          });
          return res.status(200).json({ success: true, items: exams.map(exam => ({
            ...exam, problems: (byExam.get(String(exam._id)) || [])
              .map(problem => hideUnverifiedReferenceSolution(problem, session))
          })) });
        }
        if (view === 'search') {
          const query = cleanText(req.query?.q, 100);
          if (query.length < 2) return res.status(200).json({ success: true, items: [] });
          const exams = await db.collection('exams').find(examFilter, { projection: { _id: 1, targetAnchor: 1 } })
            .limit(200).toArray();
          const anchorById = new Map(exams.map(exam => [String(exam._id), exam.targetAnchor]));
          const regex = { $regex: accentInsensitiveRegex(query), $options: 'i' };
          const problemFilter = {
            status: { $ne: 'deleted' },
            examId: { $in: [...anchorById.keys()] },
            $or: [{ content: regex }, { title: regex }, { shortLabel: regex }, { topic: regex }]
          };
          if (!['admin', 'teacher'].includes(session.role)) problemFilter.status = 'published';
          const matches = exams.length ? await db.collection('problems').find(problemFilter, {
            projection: { _id: 0, examId: 1 }
          }).limit(1000).toArray() : [];
          return res.status(200).json({ success: true, items: [...new Set(matches
            .map(problem => anchorById.get(String(problem.examId))).filter(Boolean))].map(targetAnchor => ({ targetAnchor })) });
        }
        const exams = await db.collection('exams').find(examFilter).sort({ provinceOrder: 1, dayNumber: 1, createdAt: 1 }).limit(examFilter.category === 'university' ? 1000 : 200).toArray();
        const examIds = exams.map(item => String(item._id));
        const problemFilter = { examId: { $in: examIds }, status: { $ne: 'deleted' } };
        if (!['admin', 'teacher'].includes(session.role)) problemFilter.status = 'published';
        const problems = examIds.length
          ? await db.collection('problems').find(problemFilter).sort({ orderNumber: 1, questionNumber: 1 }).limit(1000).toArray()
          : [];
        const grouped = new Map();
        problems.forEach(problem => {
          const key = String(problem.examId || '');
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(problem);
        });
        return res.status(200).json({
          success: true,
          items: exams.map(exam => ({ ...exam, problems: (grouped.get(String(exam._id)) || [])
            .map(problem => hideUnverifiedReferenceSolution(problem, session)) }))
        });
      }

      const filter = ['problems', 'content_sets'].includes(resource) ? supportVisibility(session, resource === 'content_sets' ? 'group' : 'sourceGroup') : {};
      let projection;
      if (resource === 'content_sets') {
        if (req.query?.group) filter.group = cleanText(req.query.group, 80);
        if (req.query?.key) filter.key = cleanKey(req.query.key);
        if (!['admin', 'teacher'].includes(session.role)) filter.status = 'published';
      }
      if (resource === 'content_blocks') {
        if (req.query?.group) filter.group = cleanText(req.query.group, 80);
        if (req.query?.blockKey) filter.blockKey = cleanKey(req.query.blockKey);
        if (!['admin', 'teacher'].includes(session.role)) filter.status = 'published';
      }
      if (resource === 'problems') {
        if (req.query?.examId) filter.examId = cleanText(req.query.examId, 120);
        if (req.query?.setId) {
          const setId = objectId(cleanText(req.query.setId, 80));
          if (!setId) return res.status(400).json({ success: false, error: 'Mã nhóm nội dung không hợp lệ' });
          filter.setId = setId;
        }
        if (req.query?.sourceGroup) filter.sourceGroup = cleanText(req.query.sourceGroup, 80);
        if (req.query?.contentKey) filter.contentKey = cleanKey(req.query.contentKey);
        if (req.query?.view === 'runtime') {
          projection = {
            contentKey: 1,
            content: 1,
            referenceLinks: 1,
            title: 1,
            topic: 1,
            setTitle: 1,
            version: 1
          };
        }
        if (req.query?.catalogRules === '1' && !['admin', 'teacher'].includes(session.role)) {
          const [sets, problems] = await Promise.all([
            db.collection('content_sets').find(supportVisibility(session, 'group'), { projection: { status: 1 } }).toArray(),
            db.collection('problems').find(supportVisibility(session), { projection: {
              contentKey: 1, setId: 1, setTitle: 1, title: 1, shortLabel: 1,
              topic: 1, maxScore: 1, order: 1, status: 1,
              allowSubmission: 1, allowAiEvaluation: 1
            } }).limit(1000).toArray()
          ]);
          const setStatus = new Map(sets.map(item => [String(item._id), item.status]));
          const items = problems.map(item => ({
            contentKey: item.contentKey,
            setTitle: item.setTitle,
            title: item.title,
            shortLabel: item.shortLabel,
            topic: item.topic,
            maxScore: item.maxScore,
            order: item.order,
            published: item.status === 'published' && setStatus.get(String(item.setId)) === 'published',
            allowSubmission: item.allowSubmission !== false,
            allowAiEvaluation: item.allowAiEvaluation !== false
          }));
          return res.status(200).json({ success: true, items });
        }
        if (!['admin', 'teacher'].includes(session.role)) {
          filter.status = 'published';
          const publishedSets = await db.collection('content_sets')
            .find({ status: 'published', ...supportVisibility(session, 'group') }, { projection: { _id: 1 } })
            .toArray();
          const publishedSetIds = publishedSets.map(item => item._id);
          if (filter.setId) {
            if (!publishedSetIds.some(id => String(id) === String(filter.setId))) {
              return res.status(200).json({ success: true, items: [] });
            }
          } else {
            filter.setId = { $in: publishedSetIds };
          }
        }
      }
      if (resource === 'exams' && req.query?.category && req.query.category !== 'all') {
        filter.category = cleanText(req.query.category, 80);
      }
      if (resource === 'exams' || resource === 'problems') {
        filter.status = ['admin', 'teacher'].includes(session.role) ? { $ne: 'deleted' } : 'published';
      }
      if (resource === 'documents' && req.query?.topic && req.query.topic !== 'all') {
        filter.topic = cleanText(req.query.topic, 120);
      }
      if (resource === 'submissions') {
        if (!['admin', 'teacher'].includes(session.role) || req.query?.own === '1') filter.userId = String(session.sub);
        if (req.query?.submissionKind) {
          filter.submissionKind = cleanText(req.query.submissionKind, 40);
        }
        if (req.query?.problemId) {
          const requestedProblem = cleanText(req.query.problemId, 180);
          filter.$or = [
            { problemId: requestedProblem },
            { problemKey: requestedProblem },
            { legacyProblemId: requestedProblem }
          ];
        }
        if (req.query?.problemKey) filter.problemKey = cleanKey(req.query.problemKey);
        if (req.query?.setId) filter.setId = cleanText(req.query.setId, 80);

        if (req.query?.paged === '1') {
          if (req.query?.sourceGroup) filter.sourceGroup = cleanText(req.query.sourceGroup, 80);
          if (['admin', 'teacher'].includes(session.role) && req.query?.username) {
            const username = cleanText(req.query.username, 80);
            filter.username = { $regex: `^${escapeRegex(username)}$`, $options: 'i' };
          }
          if (req.query?.evaluation === 'yes') filter.evaluation = { $type: 'object' };
          if (req.query?.evaluation === 'no') filter.evaluation = null;
          if (req.query?.adminVerified === 'yes') filter.adminVerified = true;
          if (req.query?.adminVerified === 'no') filter.adminVerified = { $ne: true };

          const from = req.query?.dateFrom ? new Date(cleanText(req.query.dateFrom, 40)) : null;
          const to = req.query?.dateTo ? new Date(cleanText(req.query.dateTo, 40)) : null;
          if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
            filter.createdAt = {};
            if (from && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
            if (to && !Number.isNaN(to.getTime())) {
              to.setUTCHours(23, 59, 59, 999);
              filter.createdAt.$lte = to;
            }
          }

          const keyword = cleanText(req.query?.q, 120);
          if (keyword) {
            const search = { $regex: escapeRegex(keyword), $options: 'i' };
            filter.$and = [
              ...(filter.$or ? [{ $or: filter.$or }] : []),
              { $or: [
                { username: search },
                { authorName: search },
                { problemTitle: search },
                { 'problemSnapshot.title': search },
                { 'problemSnapshot.setTitle': search },
                { solutionContent: search }
              ] }
            ];
            delete filter.$or;
          }
        }
      }

      const sort = resource === 'events'
        ? { startDate: 1 }
        : resource === 'content_sets' || resource === 'content_blocks' || resource === 'problems'
          ? { order: 1, orderNumber: 1 }
          : { createdAt: -1 };
      if (resource === 'submissions' && req.query?.paged === '1') {
        const page = cleanNumber(req.query?.page, 1, 1, 100000);
        const limit = cleanNumber(req.query?.limit, 10, 5, 50);
        const total = await db.collection(resource).countDocuments(filter);
        const pages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, pages);
        const items = await db.collection(resource)
          .find(filter)
          .sort(sort)
          .skip((safePage - 1) * limit)
          .limit(limit)
          .toArray();
        return res.status(200).json({
          success: true,
          items,
          pagination: { page: safePage, limit, total, pages }
        });
      }

      const items = await db.collection(resource)
        .find(filter, projection ? { projection } : undefined)
        .sort(sort)
        .limit(req.query?.latest === '1' ? 1 : 500)
        .toArray();
      return res.status(200).json({ success: true, items: resource === 'problems'
        ? items.map(problem => hideUnverifiedReferenceSolution(problem, session))
        : items });
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const body = parseBody(req);
    if (!body) return res.status(400).json({ success: false, error: 'JSON không hợp lệ' });
    const { action, payload = {} } = body;
    if (!allows(session, 'shared')) return res.status(403).json({ success: false, error: 'Tài khoản chưa được cấp quyền cấp học' });
    if (/trend|^rag_|^migrate_tst/.test(action) && !allows(session, 'upper_secondary')) return res.status(403).json({ success: false, error: 'Nội dung thuộc cấp Trung học phổ thông' });
    const now = new Date();
    if (await handleMathSupport({ db, req, res, session, action, payload })) return;
    if (action === 'import_catalog_exam') {
      if (session.role !== 'admin') return res.status(403).json({ success: false, error: 'Chỉ Admin được nhập dữ liệu đề thi hàng loạt' });
      if (!checkRateLimit(`${session.username}:catalog-import`, 60)) {
        return res.status(429).json({ success: false, error: 'Đã đạt giới hạn nhập dữ liệu. Vui lòng tiếp tục sau.' });
      }
      if (Buffer.byteLength(JSON.stringify(payload?.exam || {}), 'utf8') > 1_000_000) {
        return res.status(413).json({ success: false, error: 'Mỗi đề nhập không được vượt quá 1 MB' });
      }
      try {
        const result = await importCatalogExam(db, payload, session.username, now);
        const verifiedReferences = await db.collection('problems').find(
          { examKey: result.examKey, referenceSolutionVerified: true },
          { projection: { _id: 1 } }
        ).toArray();
        for (const problem of verifiedReferences) await refreshRagReference(db, problem._id);
        await recordActivity(db, session, 'exam.imported', {
          itemTitle: result.examKey, examId: result.examId
        });
        return res.status(200).json({ success: true, item: result });
      } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, error: error.message });
        throw error;
      }
    }
    if(typeof action==='string' && action.startsWith('books_')) {
      try{return res.status(200).json({success:true,item:await mutateBooks(db,session,action,payload)});}
      catch(error){if(error.status)return res.status(error.status).json({success:false,error:error.message});throw error;}
    }
    if(action === 'add_university_catalog_item') {
      try{return res.status(201).json({success:true,item:await addUniversityCatalogItem(db,session,payload)});}
      catch(error){if(error.status)return res.status(error.status).json({success:false,error:error.message});throw error;}
    }
    if(action === 'update_university_theory') {
      try { return res.status(200).json({success:true,item:await updateUniversityTheory(db,session,payload)}); }
      catch(error) { if(error.status)return res.status(error.status).json({success:false,error:error.message});throw error; }
    }


    if (action === 'submit_solution') {
      const submittedProblemId = cleanText(payload.problemId, 180);
      const submittedProblemKey = cleanKey(payload.problemKey || submittedProblemId);
      const solutionContent = cleanText(payload.solutionContent, 50000);
      const solutionImage = cleanSolutionImage(payload.solutionImage);
      if (solutionImage === null) {
        return res.status(413).json({ success: false, error: 'Ảnh không hợp lệ hoặc vượt quá giới hạn 3 MB' });
      }
      if (!submittedProblemId || (!solutionContent && !solutionImage)) {
        return res.status(400).json({ success: false, error: 'Thiếu mã bài toán hoặc nội dung bài giải/ảnh bài làm' });
      }
      const submittedObjectId = objectId(submittedProblemId);
      const problemFilters = [];
      if (submittedObjectId) problemFilters.push({ _id: submittedObjectId });
      if (submittedProblemKey) problemFilters.push({ contentKey: submittedProblemKey });
      problemFilters.push({ id: submittedProblemId });
      const registeredProblem = await db.collection('problems').findOne({ $or: problemFilters });
      if (!registeredProblem && Object.hasOwn(session, 'educationLevels')) return res.status(403).json({ success: false, error: 'Bài toán chưa đăng ký hoặc không thuộc cấp học được cấp quyền' });
      if (registeredProblem && !canAccessProblem(registeredProblem, session)) return res.status(403).json({ success: false, error: 'Bạn không có quyền truy cập bài toán này' });
      if (registeredProblem && !['admin', 'teacher'].includes(session.role)) {
        const registeredSet = registeredProblem.setId
          ? await db.collection('content_sets').findOne({ _id: registeredProblem.setId }, { projection: { status: 1 } })
          : null;
        if (registeredProblem.status !== 'published' || registeredSet?.status !== 'published') {
          return res.status(403).json({ success: false, error: 'Câu hỏi hiện chưa được công khai' });
        }
        if (registeredProblem.allowSubmission === false) {
          return res.status(403).json({ success: false, error: 'Câu hỏi hiện tạm khóa chức năng nộp bài' });
        }
      }
      const registeredProblemId = registeredProblem ? String(registeredProblem._id) : submittedProblemId;
      const registeredProblemKey = registeredProblem?.contentKey || submittedProblemKey || submittedProblemId;
      const evaluation = payload.evaluation && typeof payload.evaluation === 'object' ? payload.evaluation : null;
      const submissionKind = payload.submissionKind === 'ai_guide' ? 'ai_guide' : 'student_solution';
      const aiGuide = submissionKind === 'ai_guide' ? cleanAiGuide(payload.aiGuide) : null;
      const aiGuideAdminEdited = submissionKind === 'ai_guide' && payload.aiGuideAdminEdited === true;
      if (aiGuideAdminEdited && !['admin', 'teacher'].includes(session.role)) {
        return res.status(403).json({ success: false, error: 'Chỉ Admin hoặc Giáo viên được chỉnh sửa nội dung AI hướng dẫn giải' });
      }
      if (aiGuideAdminEdited && aiGuide?.quality) {
        aiGuide.quality.verified = false;
        aiGuide.quality.score = '';
      }
      const doc = {
        problemId: registeredProblemId,
        problemKey: registeredProblemKey,
        legacyProblemId: submittedProblemId !== registeredProblemId ? submittedProblemId : undefined,
        setId: registeredProblem?.setId ? String(registeredProblem.setId) : cleanText(payload.setId, 80),
        sourceType: registeredProblem?.sourceType || cleanText(payload.sourceType, 80),
        sourceGroup: registeredProblem?.sourceGroup || cleanText(payload.sourceGroup, 80),
        problemTitle: registeredProblem?.title || cleanText(payload.problemTitle, 500),
        problemSnapshot: problemSnapshot(registeredProblem) || {
          contentKey: registeredProblemKey,
          title: cleanText(payload.problemTitle, 500),
          setTitle: cleanText(payload.setTitle, 500),
          sourceType: cleanText(payload.sourceType, 80),
          sourceGroup: cleanText(payload.sourceGroup, 80),
          topic: cleanText(payload.topic, 120),
          content: cleanText(payload.problemContent, 50000),
          version: 1
        },
        userId: String(session.sub),
        username: session.username,
        authorName: session.fullName || session.username,
        solutionContent,
        hasImage: Boolean(solutionImage),
        status: evaluation?.verdict || 'submitted',
        verdictLabel: cleanText(evaluation?.verdictLabel, 500),
        score: evaluation?.estimatedScore ?? null,
        evaluation,
        submissionKind,
        aiGuide,
        aiGuideAdminEdited,
        aiGuideEditedBy: aiGuideAdminEdited ? session.username : '',
        aiGuideEditedAt: aiGuideAdminEdited ? now : null,
        createdAt: now,
        updatedAt: now
      };
      if (submissionKind === 'ai_guide') {
        const aiGuideDoc = { ...doc, adminVerified: false, adminVerifiedAt: null };
        delete aiGuideDoc.createdAt;
        const savedGuide = await db.collection('submissions').findOneAndUpdate(
          {
            userId: String(session.sub),
            problemKey: registeredProblemKey,
            submissionKind: 'ai_guide'
          },
          {
            $set: aiGuideDoc,
            $setOnInsert: { createdAt: now }
          },
          { upsert: true, returnDocument: 'after' }
        );
        if (!savedGuide?._id) return res.status(500).json({ success: false, error: 'Không thể lưu AI hướng dẫn giải' });
        await refreshRagSource(db, savedGuide._id);
        await recordActivity(db, session, 'guide.saved', {
          submissionId: savedGuide._id, problemKey: registeredProblemKey,
          problemTitle: doc.problemTitle, setTitle: doc.problemSnapshot?.setTitle,
          sourceGroup: doc.sourceGroup
        });
        return res.status(200).json({ success: true, item: savedGuide });
      }
      const result = await db.collection('submissions').insertOne(doc);
      if (solutionImage) {
        const mimeType = solutionImage.slice(5, solutionImage.indexOf(';'));
        await db.collection('submission_images').insertOne({
          submissionId: result.insertedId,
          userId: String(session.sub),
          image: solutionImage,
          mimeType,
          createdAt: now
        });
      }
      const activityDetails = {
        submissionId: result.insertedId, problemKey: registeredProblemKey,
        problemTitle: doc.problemTitle, setTitle: doc.problemSnapshot?.setTitle,
        sourceGroup: doc.sourceGroup, score: evaluation?.estimatedScore
      };
      await recordActivity(db, session, 'solution.saved', activityDetails);
      if (evaluation) await recordActivity(db, session, 'evaluation.saved', activityDetails);
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'update_catalog_content' && !['admin', 'teacher'].includes(session.role)) {
      const id = objectId(cleanText(payload.id, 80));
      const problem = id ? await db.collection('problems').findOne({ _id: id }) : null;
      if (!problem || problem.sourceGroup !== 'math_support' || !canAccessProblem(problem, session)) return res.status(403).json({ success: false, error: 'Chỉ được chỉnh sửa bài toán của bạn' });
    } else if (!['save_exam_trend_report', 'update_exam_trend_report', 'delete_exam_trend_report'].includes(action) && !requireContentManager(session, res)) return;

    if (action === 'rag_benchmark') {
      if (!checkRateLimit(`${session.username}:rag-benchmark`, 30)) return res.status(429).json({ success: false, error: 'Tối đa 30 ca benchmark/phút.' });
      try { validateBenchmarkCase(payload); }
      catch (error) { return res.status(400).json({ success: false, error: error.message }); }
      return res.status(200).json({ success: true, item: await runBenchmarkCase(db, payload, session) });
    }
    if (action === 'rag_setup') return res.status(200).json({ success: true, item: await setupRag(db) });
    if (action === 'rag_backfill') return res.status(200).json({ success: true, item: await backfillSources(db, 100, cleanText(payload.after, 80)) });
    if (action === 'rag_process') return res.status(200).json({ success: true, item: await processRagJobs(db, 3) });

    if (action === 'add_exam_question' || action === 'delete_exam_question' || action === 'update_exam_question_metadata') {
      const examId = objectId(cleanText(payload.examId, 80));
      if (!examId) return res.status(400).json({ success: false, error: 'ID đề thi không hợp lệ' });
      const exam = await db.collection('exams').findOne({ _id: examId, status: { $ne: 'deleted' } });
      if (!exam || !['tst-national', 'history-dn-qn', 'vmo-mock', 'vmo-official', 'imo-olympic', 'olympic-30-4', 'duyen-hai-bac', 'specialized-admission', 'university'].includes(exam.category) || !exam.targetAnchor) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi trong catalog' });
      }
      const examIdText = String(examId);
      if (action === 'update_exam_question_metadata') {
        const problemId = objectId(cleanText(payload.problemId, 80));
        const topic = cleanText(payload.topic, 120);
        const score = Number(payload.maxScore);
        if (!problemId || !topic || typeof payload.maxScore === 'boolean' || payload.maxScore === '' ||
            !Number.isFinite(score) || score < 0 || score > 20 ||
            Math.abs(score * 100 - Math.round(score * 100)) > 1e-8) {
          return res.status(400).json({ success: false, error: 'Chuyên đề hoặc điểm (0–20, tối đa hai chữ số thập phân) không hợp lệ' });
        }
        const problem = await db.collection('problems').findOne({
          _id: problemId, examId: examIdText, status: { $ne: 'deleted' }
        });
        if (!problem) return res.status(404).json({ success: false, error: 'Câu hỏi không thuộc đề đã chọn' });
        const updated = await db.collection('problems').findOneAndUpdate(
          { _id: problemId, examId: examIdText, status: { $ne: 'deleted' } },
          { $set: { topic, maxScore: score, shortLabel: `Câu ${Number(problem.questionNumber) || 1}`,
            updatedBy: session.username, updatedAt: now }, $inc: { version: 1 } },
          { returnDocument: 'after' }
        );
        await recordActivity(db, session, 'exam.question_updated', {
          examId: examIdText, problemKey: problem.contentKey, itemTitle: problem.title,
          topic, maxScore: score
        });
        return res.status(200).json({ success: true, item: updated });
      }
      if (action === 'delete_exam_question') {
        const problemId = objectId(cleanText(payload.problemId, 80));
        if (!problemId) return res.status(400).json({ success: false, error: 'ID câu hỏi không hợp lệ' });
        const problem = await db.collection('problems').findOne({
          _id: problemId, examId: examIdText, status: { $ne: 'deleted' }
        });
        if (!problem) return res.status(404).json({ success: false, error: 'Câu hỏi không thuộc đề đã chọn' });
        await db.collection('problems').updateOne({ _id: problemId, examId: examIdText },
          { $set: { status: 'deleted', deletedBy: session.username, deletedAt: now, updatedAt: now } });
        await recordActivity(db, session, 'exam.question_deleted', {
          itemTitle: problem.title, problemKey: problem.contentKey, examId: examIdText
        });
        return res.status(200).json({ success: true, item: { id: String(problemId) } });
      }
      const questionNumber = Number(payload.questionNumber);
      const content = cleanText(payload.content, 50000);
      if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > (exam.category==='university'?UNIVERSITY_MAX_QUESTIONS:99) || !content) {
        return res.status(400).json({ success: false, error: `Cần số câu từ 1–${exam.category==='university'?UNIVERSITY_MAX_QUESTIONS:99} và nội dung câu hỏi` });
      }
      const active = await db.collection('problems').findOne({
        examId: examIdText, questionNumber, status: { $ne: 'deleted' }
      });
      if (active) return res.status(409).json({ success: false, error: `Câu ${questionNumber} đã có trong đề này` });
      const isMock = exam.category === 'vmo-mock';
      const isRegional = exam.category === 'history-dn-qn';
      const inheritedCourse = exam.category === 'university' ? await resolveUniversityCourse(db,exam.courseId) : null;
      const inheritedSection = inheritedCourse ? inheritedCourse.sections.find(s=>s.id===exam.sectionId)||universityExamSection(exam) : null;
      const inheritedCourseMetadata = inheritedCourse ? { courseId: inheritedCourse.id, courseCode: inheritedCourse.code, courseName: inheritedCourse.name, ...(inheritedSection ? {sectionId:inheritedSection.id,sectionTitle:inheritedSection.title,sectionNumber:inheritedSection.number} : {}), educationLevel: 'university' } : {};
      const categoryGroup = { 'vmo-official': 'vmo_official', 'imo-olympic': 'imo_olympic', 'olympic-30-4': 'olympic_30_4', 'duyen-hai-bac': 'duyen_hai_bac', 'university': 'university', 'specialized-admission': 'specialized_admission' }[exam.category];
      const day = Number(exam.dayNumber) || 1;
      const setKey = exam.setKey || (isMock ? `mock:${exam.targetAnchor}`
        : `${categoryGroup || (isRegional ? 'danang_quangnam' : 'tst')}:${exam.targetAnchor}:day-${day}${!isRegional && !categoryGroup && exam.year !== '2026-2027' ? `:year-${slugKey(exam.year)}` : ''}`);
      const contentKey = `${setKey}:question-${questionNumber}`;
      const existingKey = await db.collection('problems').findOne({ contentKey });
      if (existingKey && (existingKey.examId !== examIdText || existingKey.status !== 'deleted')) {
        return res.status(409).json({ success: false, error: 'Khóa câu hỏi đã tồn tại trong cơ sở dữ liệu' });
      }
      const group = categoryGroup || (isMock ? 'mock_exam' : isRegional ? 'danang_quangnam' : 'tst');
      const savedSet = await db.collection('content_sets').findOneAndUpdate({ key: setKey },
        { $setOnInsert: { ...inheritedCourseMetadata, key: setKey, contentType: categoryGroup ? `${categoryGroup}_exam` : isMock ? 'mock_exam' : isRegional ? 'regional_exam' : 'tst_exam',
          title: exam.title, group, ...(exam.grade ? { grade: exam.grade } : {}), year: exam.year, province: exam.province, status: 'published', createdAt: now } },
        { upsert: true, returnDocument: 'after' });
      const title = cleanText(payload.title, 500) || `Câu ${questionNumber}`;
      const saved = await db.collection('problems').findOneAndUpdate({ contentKey },
        { $set: {
          ...inheritedCourseMetadata, ...(exam.grade ? { grade: exam.grade } : {}), examId: examIdText, examKey: exam.examKey || '', setId: savedSet._id, setKey, setTitle: exam.title,
          sourceGroup: group, sourceType: categoryGroup ? `${categoryGroup}_question` : isMock ? 'mock_exam_question' : isRegional ? 'regional_question' : 'tst_question',
          title, shortLabel: `Câu ${questionNumber}`, questionNumber, dayNumber: day, day: `Ngày ${day}`,
          order: day * 100 + questionNumber, orderNumber: questionNumber,
          topic: cleanText(payload.topic, 120) || 'Toán Olympic', maxScore: cleanNumber(payload.maxScore, 0, 0, 20),
          content, contentFormat: 'html-latex', frontendAnchor: exam.targetAnchor,
          status: exam.status === 'draft' ? 'draft' : 'published', allowSubmission: true, allowAiEvaluation: true,
          updatedBy: session.username, updatedAt: now
        }, $setOnInsert: { contentKey, version: 1, referenceLinks: [], createdAt: now } },
        { upsert: true, returnDocument: 'after' });
      await recordActivity(db, session, 'exam.question_added', {
        itemTitle: title, problemKey: contentKey, examId: examIdText
      });
      return res.status(201).json({ success: true, item: saved });
    }

    if (action === 'update_exam' || action === 'delete_exam') {
      const id = objectId(cleanText(payload.id, 80));
      if (!id) return res.status(400).json({ success: false, error: 'ID đề thi không hợp lệ' });
      const exam = await db.collection('exams').findOne({ _id: id, status: { $ne: 'deleted' } });
      if (!exam) return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi' });
      if (action === 'update_exam') {
        // Reclassification changes metadata only: existing IDs/keys remain stable
        // so saved guides, submissions and links still belong to the same exam.
        let sectionMetadata = {};
        const universityEdit = ['sectionId', 'courseId', 'dayNumber'].some(key => Object.hasOwn(payload, key));
        if (universityEdit) {
          if (exam.category !== 'university') return res.status(400).json({ success: false, error: 'Chỉ đề Đại học được chọn chuyên đề con tại đây' });
          const courseId = payload.courseId ?? exam.courseId;
          const course = await resolveUniversityCourse(db, courseId);
          const section = course?.sections.find(item => item.id === (payload.sectionId ?? exam.sectionId));
          if (!section) return res.status(400).json({ success: false, error: 'Chuyên đề con không thuộc học phần của đề thi' });
          const dayNumber = Number(payload.dayNumber ?? exam.dayNumber ?? 1);
          if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > UNIVERSITY_MAX_DAYS) return res.status(400).json({success:false,error:'Ngày thi phải là số nguyên từ 1–999'});
          sectionMetadata = { courseId: course.id, courseCode: course.code, courseName: course.name, province: course.code,
            sectionId: section.id, sectionTitle: section.title, sectionNumber: section.number, dayNumber, day: `Ngày ${dayNumber}` };
        }
        const title = cleanText(payload.title, 500);
        const year = cleanText(payload.year, 40);
        const duration = Number(payload.duration);
        const examDate = cleanText(payload.examDate, 20);
        if (!title || !/^\d{4}-\d{4}$/.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1 ||
            !Number.isInteger(duration) || duration < 1 || duration > 600 ||
            (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate))) {
          return res.status(400).json({ success: false, error: 'Tên đề, năm học (YYYY-YYYY), ngày thi hoặc thời lượng không hợp lệ' });
        }
        if (universityEdit) {
          const duplicate = await db.collection('exams').findOne({ category: 'university', courseId: sectionMetadata.courseId,
            sectionId: sectionMetadata.sectionId, dayNumber: sectionMetadata.dayNumber, year, status: {$ne:'deleted'}, _id: {$ne:id} });
          if (duplicate) return res.status(409).json({success:false,error:'Học phần/chuyên đề/năm học đã có đề ở ngày thi này. Hãy chọn ngày khác.'});
        }
        const updated = await db.collection('exams').findOneAndUpdate({ _id: id },
          { $set: { ...sectionMetadata, title, year, duration, examDate, description: cleanText(payload.description, 5000), updatedBy: session.username, updatedAt: now } },
          { returnDocument: 'after' });
        if (exam.targetAnchor) {
          const group = { 'vmo-official': 'vmo_official', 'imo-olympic': 'imo_olympic', 'olympic-30-4': 'olympic_30_4', 'duyen-hai-bac': 'duyen_hai_bac', 'university': 'university', 'specialized-admission': 'specialized_admission',
            'history-dn-qn': 'danang_quangnam' }[exam.category] || 'tst';
          const setKey = exam.setKey || (exam.category === 'vmo-mock' ? `mock:${exam.targetAnchor}`
            : `${group}:${exam.targetAnchor}:day-${Number(exam.dayNumber) || 1}${group === 'tst' && exam.year !== '2026-2027' ? `:year-${slugKey(exam.year)}` : ''}`);
          await db.collection('content_sets').updateOne({ key: setKey },
            { $set: { ...sectionMetadata, title, year, updatedBy: session.username, updatedAt: now } });
        }
        await db.collection('problems').updateMany({ examId: String(id) },
          { $set: { ...sectionMetadata, ...(universityEdit ? {year} : {}), setTitle: title, updatedBy: session.username, updatedAt: now } });
        await recordActivity(db, session, 'exam.updated', { itemTitle: title, examId: String(id) });
        return res.status(200).json({ success: true, item: updated });
      }
      // Giữ bản ghi và bài nộp để có thể đối soát, ẩn đề và câu hỏi khỏi catalog.
      await db.collection('exams').updateOne({ _id: id },
        { $set: { status: 'deleted', deletedBy: session.username, deletedAt: now, updatedAt: now } });
      await db.collection('problems').updateMany({ examId: String(id) },
        { $set: { status: 'deleted', updatedBy: session.username, updatedAt: now } });
      await recordActivity(db, session, 'exam.deleted', { itemTitle: exam.title, examId: String(id) });
      return res.status(200).json({ success: true, item: { id: String(id) } });
    }

    if (action === 'update_ai_guide') {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID lời giải AI không hợp lệ' });
      const guide = cleanAiGuide(payload.aiGuide);
      const solutionContent = cleanText(payload.solutionContent, 50_000);
      if (!guide || !guide.knowledge || !guide.intuition || !guide.solution || !guide.pitfalls || !solutionContent) {
        return res.status(400).json({ success: false, error: 'Bốn phần nội dung AI hướng dẫn giải không được để trống' });
      }
      if (guide.quality) {
        guide.quality.verified = false;
        guide.quality.score = '';
      }
      const updated = await db.collection('submissions').findOneAndUpdate(
        { _id: id, submissionKind: 'ai_guide' },
        { $set: {
          aiGuide: guide,
          solutionContent,
          aiGuideAdminEdited: true,
          aiGuideEditedBy: session.username,
          aiGuideEditedAt: now,
          adminVerified: false, adminVerifiedAt: null,
          updatedAt: now
        } },
        { returnDocument: 'after' }
      );
      if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy AI hướng dẫn giải đã lưu' });
      await refreshRagSource(db, id);
      await recordActivity(db, session, 'guide.updated', {
        submissionId: id,
        problemKey: updated.problemKey,
        problemTitle: updated.problemSnapshot?.title || updated.problemTitle,
        setTitle: updated.problemSnapshot?.setTitle,
        ownerUsername: updated.username
      });
      return res.status(200).json({ success: true, item: updated });
    }

    if (action === 'save_trend_theory' || action === 'update_trend_theory' || action === 'delete_trend_theory') {
      const collection = db.collection('trend_theories');
      const topic = cleanText(payload.topic, 120);
      const method = cleanText(payload.method, 240);
      if (!EXAM_TREND_TOPICS.includes(topic) || method.length < 5) {
        return res.status(400).json({ success: false, error: 'Chuyên đề không hợp lệ' });
      }
      const key = { topic, method, deletedAt: { $exists: false } };
      const previous = await collection.findOne(key);
      if (action === 'delete_trend_theory') {
        if (!previous) return res.status(404).json({ success: false, error: 'Không tìm thấy tài liệu đã lưu' });
        await collection.updateOne({ _id: previous._id, deletedAt: { $exists: false } },
          { $set: { deletedAt: now, deletedBy: session.username, updatedAt: now } });
        await recordActivity(db, session, 'theory.deleted', { itemTitle: method, theoryId: String(previous._id) });
        return res.status(200).json({ success: true, item: { id: String(previous._id) } });
      }
      const cleaned = cleanTrendTheory(payload);
      if (!cleaned) return res.status(400).json({ success: false, error: 'Nội dung lý thuyết không hợp lệ' });
      if (action === 'save_trend_theory') {
        if (previous) return res.status(409).json({ success: false, error: 'Tài liệu đã được lưu; hãy mở lại để chỉnh sửa' });
        const doc = { ...cleaned, quality: { method: 'admin-edited', summary: 'Nội dung do Admin lưu; chưa kiểm định độc lập.' },
          createdAt: now, createdBy: session.username, updatedAt: now };
        const result = await collection.insertOne(doc);
        await recordActivity(db, session, 'theory.saved', { itemTitle: method, theoryId: String(result.insertedId) });
        return res.status(201).json({ success: true, item: { ...doc, _id: result.insertedId } });
      }
      if (!previous) return res.status(404).json({ success: false, error: 'Không tìm thấy tài liệu đã lưu' });
      const updated = await collection.findOneAndUpdate({ _id: previous._id, deletedAt: { $exists: false } },
        { $set: { theory: cleaned.theory, sources: cleaned.sources,
          quality: { method: 'admin-edited', summary: 'Nội dung do Admin chỉnh sửa; chưa kiểm định độc lập.' },
          updatedAt: now, updatedBy: session.username },
          $push: { revisions: { $each: [{ theory: previous.theory, editedAt: now, editedBy: session.username }], $slice: -10 } } },
        { returnDocument: 'after' });
      await recordActivity(db, session, 'theory.updated', { itemTitle: method, theoryId: String(previous._id) });
      return res.status(200).json({ success: true, item: updated });
    }

    if (action === 'save_exam_trend_report') {
      const cleaned = cleanExamTrendReport(payload);
      if (!cleaned || !cleaned.settings.mode || !cleaned.settings.year || !cleaned.report.title) {
        return res.status(400).json({ success: false, error: 'Báo cáo xu hướng không hợp lệ hoặc thiếu 6 chuyên đề' });
      }
      const doc = { ...cleaned, ownerId: String(session.sub), createdBy: session.username, createdAt: now, updatedAt: now };
      const result = await db.collection('exam_trend_reports').insertOne(doc);
      await recordActivity(db, session, 'trend_report.saved', {
        itemTitle: doc.report.title, reportId: result.insertedId, year: doc.settings.year,
        verifierStatus: doc.quality.status
      });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'update_exam_trend_report' || action === 'delete_exam_trend_report') {
      const id = objectId(cleanText(payload.id, 80));
      if (!id) return res.status(400).json({ success: false, error: 'ID báo cáo không hợp lệ' });
      const collection = db.collection('exam_trend_reports');
      const previous = await collection.findOne({ _id: id, deletedAt: { $exists: false } });
      if (!previous) return res.status(404).json({ success: false, error: 'Không tìm thấy báo cáo' });
      if (!['admin', 'teacher'].includes(session.role) && String(previous.ownerId || '') !== String(session.sub)) return res.status(403).json({ success: false, error: 'Bạn chỉ được sửa hoặc xóa báo cáo xu hướng của mình' });
      if (action === 'delete_exam_trend_report') {
        await collection.updateOne({ _id: id, deletedAt: { $exists: false } },
          { $set: { deletedAt: now, deletedBy: session.username, updatedAt: now } });
        await recordActivity(db, session, 'trend_report.deleted', { reportId: String(id), itemTitle: previous.report?.title });
        return res.status(200).json({ success: true, item: { id: String(id) } });
      }
      const edits = payload.edits || {};
      const title = cleanText(edits.title, 300);
      const executiveSummary = cleanText(edits.executiveSummary, 6000);
      const conclusion = cleanText(edits.conclusion, 5000);
      const observations = edits.observations;
      if (!title || !Array.isArray(observations) || observations.length !== 6 ||
          observations.some(value => typeof value !== 'string' || value.length > 4000) ||
          previous.report?.topicTrends?.length !== 6) {
        return res.status(400).json({ success: false, error: 'Tiêu đề hoặc nội dung sáu chuyên đề không hợp lệ' });
      }
      const revisedTopics = previous.report.topicTrends.map((topic, index) => ({
        ...topic, observations: cleanText(observations[index], 4000)
      }));
      const revision = { report: previous.report, quality: previous.quality,
        editedAt: now, editedBy: session.username };
      const updated = await collection.findOneAndUpdate({ _id: id, deletedAt: { $exists: false } }, {
        $set: { 'report.title': title, 'report.executiveSummary': executiveSummary,
          'report.conclusion': conclusion, 'report.topicTrends': revisedTopics,
          'quality.status': 'unavailable', 'quality.verified': false, 'quality.score': null,
          'quality.summary': 'Nội dung đã được chỉnh sửa; cần kiểm định lại nếu sử dụng như báo cáo AI đã duyệt.',
          updatedAt: now, updatedBy: session.username },
        $push: { revisions: { $each: [revision], $slice: -20 } }
      }, { returnDocument: 'after' });
      await recordActivity(db, session, 'trend_report.updated', { reportId: String(id), itemTitle: title });
      return res.status(200).json({ success: true, item: updated });
    }

    if (action === 'delete_ai_guide') {
      const id = objectId(cleanText(payload.id, 80));
      if (!id) return res.status(400).json({ success: false, error: 'ID lời giải AI không hợp lệ' });
      const deleted = await deleteAiGuideRecord(db, session, id);
      if (!deleted) return res.status(404).json({ success: false, error: 'Không tìm thấy AI Hướng dẫn giải đã lưu' });
      await refreshRagSource(db, id);
      return res.status(200).json({ success: true, deletedId: String(id) });
    }

    if (action === 'update_catalog_item') {
      const itemType = cleanText(payload.itemType, 20);
      const id = objectId(cleanText(payload.id, 80));
      if (!id || !['set', 'problem'].includes(itemType)) {
        return res.status(400).json({ success: false, error: 'Mục catalog không hợp lệ' });
      }

      const collectionName = itemType === 'set' ? 'content_sets' : 'problems';
      const changes = { updatedBy: session.username, updatedAt: now };
      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        changes.status = payload.status === 'draft' ? 'draft' : 'published';
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'order')) {
        changes.order = cleanNumber(payload.order, 0, 0, 10000);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
        const title = cleanText(payload.title, 500);
        if (!title) return res.status(400).json({ success: false, error: 'Tiêu đề không được để trống' });
        changes.title = title;
      }
      if (itemType === 'set') {
        if (Object.prototype.hasOwnProperty.call(payload, 'year')) changes.year = cleanText(payload.year, 40);
        if (Object.prototype.hasOwnProperty.call(payload, 'province')) changes.province = cleanText(payload.province, 120);
      }
      if (itemType === 'problem') {
        if (changes.status === 'published' || payload.allowSubmission === true || payload.allowAiEvaluation === true) {
          const pending = await db.collection('problems').findOne({ _id: id }, { projection: { predictionReview: 1 } });
          if (pending?.predictionReview?.status === 'gpt_rejected') {
            return res.status(409).json({ success: false, error: 'Câu chưa được Gia sư Toán AI duyệt cần sửa nội dung và xác nhận trong ⚙️ Quản lý nguồn trước khi công bố.' });
          }
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'shortLabel')) changes.shortLabel = cleanText(payload.shortLabel, 120);
        if (Object.prototype.hasOwnProperty.call(payload, 'topic')) changes.topic = cleanText(payload.topic, 120);
        if (Object.prototype.hasOwnProperty.call(payload, 'maxScore')) {
          changes.maxScore = cleanNumber(payload.maxScore, 5, 0, 20);
        }
        if (typeof payload.allowSubmission === 'boolean') changes.allowSubmission = payload.allowSubmission;
        if (typeof payload.allowAiEvaluation === 'boolean') changes.allowAiEvaluation = payload.allowAiEvaluation;
      }

      const update = { $set: changes };
      if (itemType === 'problem' && ['title', 'shortLabel', 'topic', 'maxScore'].some(field => Object.prototype.hasOwnProperty.call(payload, field))) {
        update.$inc = { version: 1 };
      }
      const result = await db.collection(collectionName).findOneAndUpdate(
        { _id: id },
        update,
        { returnDocument: 'after' }
      );
      if (!result) return res.status(404).json({ success: false, error: 'Không tìm thấy mục catalog' });
      if (itemType === 'set' && changes.title) {
        await db.collection('problems').updateMany(
          { setId: id },
          { $set: { setTitle: changes.title, updatedBy: session.username, updatedAt: now } }
        );
      }
      await recordActivity(db, session, 'catalog.updated', { itemTitle: result.title || result.key || result.contentKey });
      return res.status(200).json({ success: true, item: result });
    }

    if (action === 'update_catalog_content') {
      const id = objectId(cleanText(payload.id, 80));
      const content = cleanText(payload.content, 50000);
      const referenceSolution = cleanText(payload.referenceSolution, 100000);
      const referenceSolutionVerified = ['admin', 'teacher'].includes(session.role) && payload.referenceSolutionVerified === true && Boolean(referenceSolution);
      const referenceLinks = cleanReferenceLinks(payload.referenceLinks);
      const changeNote = cleanText(payload.changeNote, 500);
      if (!id || !content) {
        return res.status(400).json({ success: false, error: 'Thiếu câu hỏi hoặc nội dung đề bài' });
      }
      const current = await db.collection('problems').findOne({ _id: id });
      if (!current) return res.status(404).json({ success: false, error: 'Không tìm thấy câu hỏi' });
      if(current.sourceGroup==='university_books' && session.role!=='admin')return res.status(403).json({success:false,error:'Chỉ Admin được chỉnh sửa bài tập Sách học.'});
      const resolvePredictionReview = ['admin', 'teacher'].includes(session.role) && payload.resolvePredictionReview === true &&
        current.origin === 'prediction' && current.predictionReview?.status === 'gpt_rejected';
      if (resolvePredictionReview && content === current.content) {
        return res.status(400).json({ success: false, error: 'Cần sửa nội dung câu hỏi trước khi xác nhận đã khắc phục nhận xét của Gia sư Toán AI.' });
      }
      const expectedVersion = cleanNumber(payload.expectedVersion, 0, 0, 1000000);
      if (expectedVersion && Number(current.version || 1) !== expectedVersion) {
        return res.status(409).json({ success: false, error: 'Nội dung đã được người khác cập nhật. Hãy tải lại trước khi lưu.' });
      }

      await db.collection('content_revisions').insertOne({
        problemId: id,
        contentKey: current.contentKey,
        version: Number(current.version || 1),
        title: current.title,
        content: current.content || '',
        referenceSolution: current.referenceSolution || '',
        referenceSolutionVerified: current.referenceSolutionVerified === true,
        referenceLinks: cleanReferenceLinks(current.referenceLinks),
        predictionReview: current.predictionReview || null,
        changeNote: changeNote || 'Bản tự động trước khi chỉnh sửa',
        action: 'edit',
        createdBy: session.username,
        createdAt: now
      });
      const nextVersion = Number(current.version || 1) + 1;
      const changed = await db.collection('problems').updateOne(
        { _id: id, version: current.version ?? { $exists: false } },
        { $set: {
          content, referenceSolution, referenceLinks, referenceSolutionVerified,
          referenceSolutionProblemHash: referenceSolutionVerified ? contentHash(content) : '',
          referenceSolutionVerifiedBy: referenceSolutionVerified ? session.username : '',
          referenceSolutionVerifiedAt: referenceSolutionVerified ? now : null,
          version: nextVersion, updatedBy: session.username, updatedAt: now,
          ...(resolvePredictionReview ? {
            predictionReview: { ...current.predictionReview, status: 'admin_corrected',
              correctedBy: session.username, correctedAt: now, correctionNote: changeNote },
            status: 'published', allowSubmission: true, allowAiEvaluation: true
          } : {})
        } }
      );
      if (!changed.matchedCount) return res.status(409).json({ success: false, error: 'Nội dung đã thay đổi. Vui lòng tải lại.' });
      await refreshRagReference(db, id);
      await db.collection('content_revisions').createIndex({ problemId: 1, createdAt: -1 });
      await recordActivity(db, session, 'catalog.updated', { problemKey: current.contentKey, itemTitle: current.title });
      return res.status(200).json({ success: true, item: { id: String(id), version: nextVersion } });
    }

    if (action === 'migrate_tst_reference_links') {
      const sourceMap = payload.sourceMap && typeof payload.sourceMap === 'object' ? payload.sourceMap : {};
      const cardIds = Object.keys(sourceMap).map(value => cleanKey(value, 180)).filter(Boolean).slice(0, 100);
      if (!cardIds.length) return res.status(400).json({ success: false, error: 'Không có nguồn TST để migration' });

      let matchedProblems = 0;
      let updatedProblems = 0;
      const unmatchedCardIds = [];
      for (const cardId of cardIds) {
        const config = sourceMap[cardId] || {};
        const problems = await db.collection('problems').find({
          sourceGroup: 'tst',
          $or: [
            { frontendAnchor: cardId },
            { setKey: { $regex: `^tst:${escapeRegex(cardId)}(?::day-[0-9]+)?$` } }
          ]
        }).sort({ order: 1, questionNumber: 1, createdAt: 1 }).toArray();
        if (!problems.length) {
          unmatchedCardIds.push(cardId);
          continue;
        }
        matchedProblems += problems.length;
        const allLinks = cleanReferenceLinks(config.all);
        const byIndex = config.byIndex && typeof config.byIndex === 'object' ? config.byIndex : {};
        for (const [index, problem] of problems.entries()) {
          const rawLinks = Object.prototype.hasOwnProperty.call(byIndex, index) ? byIndex[index] : allLinks;
          const referenceLinks = cleanReferenceLinks(rawLinks);
          await db.collection('problems').updateOne(
            { _id: problem._id },
            { $set: { referenceLinks, referenceLinksUpdatedBy: session.username, referenceLinksUpdatedAt: now } }
          );
          updatedProblems += 1;
        }
      }
      await recordActivity(db, session, 'catalog.updated', { itemTitle: `${updatedProblems} nguồn TST` });
      return res.status(200).json({
        success: true,
        item: { cardCount: cardIds.length, matchedProblems, updatedProblems, unmatchedCardIds }
      });
    }

    if (action === 'update_problem_reference_links') {
      const contentKey = cleanKey(payload.contentKey, 180);
      if (!contentKey) return res.status(400).json({ success: false, error: 'Khóa câu hỏi không hợp lệ' });
      const referenceLinks = cleanReferenceLinks(payload.referenceLinks);
      const result = await db.collection('problems').findOneAndUpdate(
        { contentKey },
        { $set: {
          referenceLinks,
          referenceLinksUpdatedBy: session.username,
          referenceLinksUpdatedAt: now,
          updatedBy: session.username,
          updatedAt: now
        } },
        { returnDocument: 'after' }
      );
      if (!result) return res.status(404).json({ success: false, error: 'Không tìm thấy câu hỏi trong cơ sở dữ liệu' });
      await recordActivity(db, session, 'catalog.updated', { problemKey: contentKey, itemTitle: result.title });
      return res.status(200).json({ success: true, item: result });
    }

    if (action === 'restore_catalog_revision') {
      const revisionId = objectId(cleanText(payload.revisionId, 80));
      if (!revisionId) return res.status(400).json({ success: false, error: 'Phiên bản khôi phục không hợp lệ' });
      const revision = await db.collection('content_revisions').findOne({ _id: revisionId });
      if (!revision) return res.status(404).json({ success: false, error: 'Không tìm thấy phiên bản' });
      const current = await db.collection('problems').findOne({ _id: revision.problemId });
      if (!current) return res.status(404).json({ success: false, error: 'Không tìm thấy câu hỏi gốc' });

      await db.collection('content_revisions').insertOne({
        problemId: current._id,
        contentKey: current.contentKey,
        version: Number(current.version || 1),
        title: current.title,
        content: current.content || '',
        referenceSolution: current.referenceSolution || '',
        referenceSolutionVerified: current.referenceSolutionVerified === true,
        referenceLinks: cleanReferenceLinks(current.referenceLinks),
        changeNote: `Bản tự động trước khi khôi phục phiên bản ${revision.version}`,
        action: 'restore_backup',
        createdBy: session.username,
        createdAt: now
      });
      const nextVersion = Number(current.version || 1) + 1;
      await db.collection('problems').updateOne(
        { _id: current._id },
        { $set: {
          content: revision.content || '',
          referenceSolution: revision.referenceSolution || '',
          referenceSolutionVerified: revision.referenceSolutionVerified === true && Boolean(revision.referenceSolution),
          referenceSolutionProblemHash: revision.referenceSolutionVerified === true && revision.referenceSolution
            ? contentHash(revision.content || '') : '',
          referenceSolutionVerifiedBy: revision.referenceSolutionVerified === true ? session.username : '',
          referenceSolutionVerifiedAt: revision.referenceSolutionVerified === true ? now : null,
          referenceLinks: cleanReferenceLinks(revision.referenceLinks),
          version: nextVersion,
          updatedBy: session.username,
          updatedAt: now
        } }
      );
      await refreshRagReference(db, current._id);
      await recordActivity(db, session, 'catalog.updated', { problemKey: current.contentKey, itemTitle: current.title });
      return res.status(200).json({ success: true, item: { id: String(current._id), version: nextVersion } });
    }

    if (action === 'add_document') {
      const title = cleanText(payload.title, 300);
      if (!title) return res.status(400).json({ success: false, error: 'Tên tài liệu là bắt buộc' });
      const doc = { title, topic: cleanText(payload.topic, 120) || 'Tổng hợp', author: cleanText(payload.author, 200) || 'Tổ Toán VMO Đà Nẵng', description: cleanText(payload.description, 5000), fileUrl: cleanText(payload.fileUrl, 2000), chapter: cleanText(payload.chapter, 200), createdBy: session.username, createdAt: now };
      const result = await db.collection('documents').insertOne(doc);
      await recordActivity(db, session, 'document.added', { itemTitle: title });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'add_exam') {
      const title = cleanText(payload.title, 300);
      if (!title) return res.status(400).json({ success: false, error: 'Tên đề thi là bắt buộc' });
      const doc = { title, category: cleanText(payload.category, 80) || 'vmo-danang', year: cleanText(payload.year, 30) || '2026-2027', day: cleanText(payload.day, 40) || 'Ngày 1', province: cleanText(payload.province, 100) || 'Đà Nẵng', duration: Math.max(1, Math.min(600, Number(payload.duration) || 180)), description: cleanText(payload.description, 5000), sourceUrl: cleanText(payload.sourceUrl, 2000), createdBy: session.username, createdAt: now };
      const result = await db.collection('exams').insertOne(doc);
      await recordActivity(db, session, 'exam.added', { itemTitle: title });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'create_exam_from_ocr') {
      if (!allows(session, payload.destination === 'university' ? 'university' : payload.destination === 'admission' ? 'lower_secondary' : 'upper_secondary')) return res.status(403).json({ success: false, error: 'Đề thi không thuộc cấp học được cấp quyền' });
      const isMock = payload.destination === 'mock';
      const isRegional = payload.destination === 'regional';
      const catalogDestination = { university: { category: 'university', prefix: 'university-', group: 'university' }, admission: { category: 'specialized-admission', prefix: 'admission-', group: 'specialized_admission' }, vmo: { category: 'vmo-official', prefix: 'vmo-', group: 'vmo_official' }, olympic: { category: 'imo-olympic', prefix: 'olympic-', group: 'imo_olympic' }, olympic30: { category: 'olympic-30-4', prefix: 'olympic30-', group: 'olympic_30_4', graded: true }, duyenhai: { category: 'duyen-hai-bac', prefix: 'duyenhai-', group: 'duyen_hai_bac', graded: true } }[payload.destination];
      if (payload.destination && !['mock', 'tst', 'regional', 'vmo', 'olympic', 'olympic30', 'duyenhai', 'admission', 'university'].includes(payload.destination)) return res.status(400).json({ success: false, error: 'Loại đề thi không hợp lệ' });
      const grade = Number(payload.grade);
      if (catalogDestination?.graded && ![10, 11].includes(grade)) return res.status(400).json({ success: false, error: 'Vui lòng chọn Lớp 10 hoặc Lớp 11' });
      const admission = payload.destination === 'admission';
      const school = admission ? specializedSchool(cleanText(payload.schoolId, 150)) : null;
      if (admission && !school) return res.status(400).json({ success: false, error: 'Vui lòng chọn trường trong danh mục trường chuyên' });
      const schoolMetadata = school ? { schoolId: school.id, schoolName: school.name, schoolAuthority: school.authority, provinceId: school.provinceId } : {};
      const course = payload.destination === 'university' ? await resolveUniversityCourse(db,payload.courseId) : null;
      if (payload.destination === 'university' && !course) return res.status(400).json({ success: false, error: 'Vui lòng chọn học phần Đại học hợp lệ' });
      const section = course ? course.sections.find(s=>s.id===payload.sectionId) : null;
      if (course && !section) return res.status(400).json({success:false,error:'Vui lòng chọn chuyên đề con thuộc học phần đã chọn'});
      const courseMetadata = course ? { courseId: course.id, courseCode: course.code, courseName: course.name, sectionId: section.id, sectionTitle: section.title, sectionNumber: section.number, educationLevel: 'university' } : {};
      const gradeMetadata = { ...courseMetadata, ...(catalogDestination?.graded ? { grade } : {}), ...schoolMetadata };
      const province = cleanText(payload.province, 120);
      const targetAnchor = cleanKey(payload.targetAnchor, 220);
      const requestedRegion = cleanText(payload.region, 20).toUpperCase();
      const region = school?.region || ((TST_REGIONS.has(requestedRegion) || (course && requestedRegion==='OTHER')) ? requestedRegion : 'BAC');
      const regionName=course && requestedRegion==='OTHER' ? cleanText(payload.regionName,120) : '';
      const dayNumber = Number(payload.dayNumber);
      const setNumber = Number(payload.setNumber);
      const year = cleanText(payload.year, 40) || '2026-2027';
      const isPrediction = isMock && payload.origin === 'prediction';
      if (payload.origin === 'prediction' && !isMock) return res.status(400).json({ success: false, error: 'Đề dự đoán phải được lưu trong bộ thi thử' });
      const imageCount = cleanNumber(payload.sourceImageCount, 0, 0, 20);
      if (!isPrediction && imageCount < 1) return res.status(400).json({ success: false, error: 'Đề OCR cần ít nhất một ảnh nguồn' });
      const questions = Array.isArray(payload.questions) ? (course ? payload.questions : payload.questions.slice(0,10)) : [];
      if(course && (questions.length>UNIVERSITY_MAX_QUESTIONS || Buffer.byteLength(JSON.stringify(questions),'utf8')>2500000))return res.status(400).json({success:false,error:'Đề tối đa 1000 câu và 2,5 MB nội dung; hãy chia thành nhiều ngày thi.'});
      const declaredCount=payload.questionCount===undefined?questions.length:Number(payload.questionCount);
      if(course && (!Number.isInteger(declaredCount)||declaredCount<1||declaredCount>UNIVERSITY_MAX_QUESTIONS||declaredCount!==questions.length))return res.status(400).json({success:false,error:'Số câu nhận được không khớp số câu khai báo (1–1000).'});
      const validTarget = isMock
        ? /^mock-set\d+-day[12]$/.test(targetAnchor) && Number.isInteger(setNumber) && setNumber >= 3 && setNumber <= 100 && targetAnchor === `mock-set${setNumber}-day${dayNumber}`
        : (isRegional ? /^hist-(dn|qn)-[a-z0-9._:-]+$/.test(targetAnchor) : catalogDestination ? new RegExp(`^${catalogDestination.prefix}[a-z0-9._:-]+$`).test(targetAnchor) : /^tst-[a-z0-9._:-]+$/.test(targetAnchor));
      if (!province || !validTarget || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > (course ? UNIVERSITY_MAX_DAYS : isMock ? 2 : 4) || !questions.length) {
        return res.status(400).json({ success: false, error: 'Thiếu tỉnh/thành phố, vị trí frontend hoặc danh sách câu hỏi' });
      }

      if (admission && (province !== school.province || targetAnchor !== `admission-${school.id}-${slugKey(year)}` || !/^20\d{2}-20\d{2}$/.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1)) return res.status(400).json({ success: false, error: 'Trường, tỉnh/thành, năm học và mã đề không khớp' });
      if (course && (province !== course.code || targetAnchor !== `university-${course.id}-${section.id}-${slugKey(year)}` || !/^20\d{2}-20\d{2}$/.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1)) return res.status(400).json({ success: false, error: 'Học phần, năm học và mã đề không khớp' });
      const provinceSlug = slugKey(province);
      const yearSlug = slugKey(year);
      if (catalogDestination?.graded && targetAnchor !== `${catalogDestination.prefix}${provinceSlug}-${yearSlug}-grade-${grade}`) return res.status(400).json({ success: false, error: 'Mã đề không khớp kỳ thi, năm và khối lớp' });
      if (isRegional) {
        const expectedUnit = targetAnchor.startsWith('hist-qn-') ? 'quang-nam' : 'da-nang';
        if (provinceSlug !== expectedUnit) {
          return res.status(400).json({ success: false, error: 'Đơn vị lưu trữ không khớp kho Đà Nẵng–Quảng Nam' });
        }
      }
      const examKey = isMock ? `mock:set-${setNumber}:${yearSlug}:day-${dayNumber}` : `${catalogDestination?.group || (isRegional ? 'regional' : 'tst')}:${school?.id || provinceSlug}:${yearSlug}${section ? `:section-${section.id}` : ''}${catalogDestination?.graded ? `:grade-${grade}` : ''}:day-${dayNumber}`;
      if (course) {
        const occupied = await db.collection('exams').findOne({ category:'university', courseId:course.id, sectionId:section.id, year, dayNumber, status:{$ne:'deleted'} });
        if (occupied && occupied.examKey !== examKey) return res.status(409).json({success:false,error:'Ngày thi này đã có đề được chuyển từ học phần/chuyên đề khác. Hãy chỉnh sửa đề hiện có hoặc chọn ngày khác.'});
      }
      // Một tỉnh có thể có hai đề với các số câu trùng nhau. Ngày thi phải
      // thuộc khóa ổn định để ngày 2 không ghi đè câu hỏi/lịch sử của ngày 1.
      const setKey = isMock ? `mock:${targetAnchor}` : `${catalogDestination?.group || (isRegional ? 'danang_quangnam' : 'tst')}:${targetAnchor}:day-${dayNumber}${!isRegional && !catalogDestination && year !== '2026-2027' ? `:year-${yearSlug}` : ''}`;
      const title = cleanText(payload.title, 500) || (isMock ? `Bộ đề thi thử VMO số ${setNumber} — Ngày ${dayNumber}` : catalogDestination ? `Đề ${school?.name || province} ${year} — Ngày ${dayNumber}` : `Đề thi lập đội tuyển ${province} — Ngày ${dayNumber}`);
      const status = payload.status === 'draft' ? 'draft' : 'published';
      const existingExam = await db.collection('exams').findOne({ examKey }, { projection: { _id: 1 } });
      if (existingExam && payload.replaceExisting !== true) {
        return res.status(409).json({
          success: false,
          error: `Đề ngày ${dayNumber} của ${province} đã tồn tại. Cần xác nhận trước khi cập nhật.`
        });
      }

      const normalizedQuestions = [];
      const seenQuestionNumbers = new Set();
      for (const [index, raw] of questions.entries()) {
        const questionNumber = course ? Number(raw?.questionNumber ?? index+1) : Math.max(1, Math.min(99,Number(raw?.questionNumber)||index+1));
        if(course && (!Number.isInteger(questionNumber)||questionNumber<1||questionNumber>UNIVERSITY_MAX_QUESTIONS))return res.status(400).json({success:false,error:'Số thứ tự câu phải là số nguyên từ 1–1000.'});
        const content = cleanText(raw?.content, 50000);
        if (!content) continue;
        if (seenQuestionNumbers.has(questionNumber)) {
          return res.status(400).json({ success: false, error: `Số câu ${questionNumber} bị lặp trong kết quả OCR` });
        }
        seenQuestionNumbers.add(questionNumber);
        normalizedQuestions.push({ raw, questionNumber, content });
      }
      if(course && normalizedQuestions.length!==declaredCount)return res.status(400).json({success:false,error:'Có câu trống; vui lòng hoàn thiện hoặc sửa số câu khai báo.'});
      if (!normalizedQuestions.length) {
        return res.status(400).json({ success: false, error: 'Không có câu hỏi hợp lệ để lưu' });
      }
      if (isPrediction && (normalizedQuestions.length < 2 || normalizedQuestions.length > 6 ||
          Math.abs(normalizedQuestions.reduce((total, item) => total + Number(item.raw?.maxScore || 0), 0) - 20) > 0.001)) {
        return res.status(400).json({ success: false, error: 'Đề dự đoán phải có 2–6 câu và tổng điểm đúng 20' });
      }
      const examDoc = {
        ...gradeMetadata,
        ...(course?{questionCount:declaredCount,regionName}:{}),
        examKey,
        setKey,
        title,
        category: isMock ? 'vmo-mock' : (catalogDestination?.category || (isRegional ? 'history-dn-qn' : 'tst-national')),
        setNumber: isMock ? setNumber : undefined,
        year,
        day: `Ngày ${dayNumber}`,
        dayNumber,
        province,
        region,
        provinceOrder: cleanNumber(payload.provinceOrder, 0, 0, 1000),
        duration: Math.max(1, Math.min(600, Number(payload.duration) || 180)),
        examDate: cleanText(payload.examDate, 20),
        description: cleanText(payload.description, 5000),
        targetAnchor,
        sourceImageCount: imageCount,
        hasImages: imageCount > 0,
        origin: isPrediction ? 'prediction' : 'ocr',
        predictionInfo: isPrediction ? {
          targetType: ['tst', 'vmo'].includes(payload.predictionInfo?.targetType) ? payload.predictionInfo.targetType : '',
          targetAnchor: cleanKey(payload.predictionInfo?.targetAnchor, 100),
          requestedYears: cleanNumber(payload.predictionInfo?.requestedYears, 0, 0, 15),
          actualYears: (Array.isArray(payload.predictionInfo?.actualYears) ? payload.predictionInfo.actualYears : []).slice(0, 15).map(value => cleanText(value, 20)),
          ownExamCount: cleanNumber(payload.predictionInfo?.ownExamCount, 0, 0, 200),
          peerExamCount: cleanNumber(payload.predictionInfo?.peerExamCount, 0, 0, 200),
          model: cleanText(payload.predictionInfo?.model, 80),
          verifierModel: cleanText(payload.predictionInfo?.verifierModel, 80),
          verificationScore: cleanNumber(payload.predictionInfo?.verificationScore, 0, 0, 5),
          verificationSummary: cleanText(payload.predictionInfo?.verificationSummary, 1000),
          verified: payload.predictionInfo?.verified === true,
          historyCurrentProvince: cleanText(payload.predictionInfo?.historyCurrentProvince, 120),
          historyMembers: cleanStringList(payload.predictionInfo?.historyMembers, 5, 120),
          criticalIssues: (Array.isArray(payload.predictionInfo?.criticalIssues) ? payload.predictionInfo.criticalIssues : [])
            .slice(0, 12).map(issue => cleanText(issue, 3000)).filter(Boolean)
        } : null,
        ocrConfidence: cleanText(payload.ocrConfidence, 40),
        status,
        updatedBy: session.username,
        updatedAt: now
      };
      const setDoc = {
        ...gradeMetadata,
        key: setKey,
        contentType: catalogDestination ? `${catalogDestination.group}_exam` : isMock ? 'mock_exam' : (isRegional ? 'regional_exam' : 'tst_exam'),
        title,
        group: catalogDestination?.group || (isMock ? 'mock_exam' : (isRegional ? 'danang_quangnam' : 'tst')),
        origin: isPrediction ? 'prediction' : 'ocr',
        year,
        province,
        region,
        order: cleanNumber(payload.provinceOrder),
        status,
        updatedBy: session.username,
        updatedAt: now
      };
      const [savedExam, savedSet] = await Promise.all([
        db.collection('exams').findOneAndUpdate(
          { examKey },
          { $set: examDoc, $setOnInsert: { createdBy: session.username, createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        ),
        db.collection('content_sets').findOneAndUpdate(
          { key: setKey },
          { $set: setDoc, $setOnInsert: { createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        )
      ]);
      if (!savedExam?._id) return res.status(500).json({ success: false, error: 'Không thể tạo đề thi' });
      if (!savedSet?._id) return res.status(500).json({ success: false, error: 'Không thể tạo nhóm nội dung đề thi' });

      const questionOperations = normalizedQuestions.map(({ raw, questionNumber, content }) => {
        const contentKey = `${setKey}:question-${questionNumber}`;
        const review = isPrediction ? {
          status: raw?.predictionReview?.approved === true ? 'gpt_approved' : 'gpt_rejected',
          approved: raw?.predictionReview?.approved === true,
          reason: cleanText(raw?.predictionReview?.reason, 3000),
          issues: (Array.isArray(raw?.predictionReview?.issues) ? raw.predictionReview.issues : [])
            .slice(0, 12).map(issue => cleanText(issue, 3000)).filter(Boolean),
          verifierModel: cleanText(payload.predictionInfo?.verifierModel, 80),
          reviewedAt: now
        } : null;
        const pendingReview = isPrediction && !review.approved;
        const problemDoc = {
          ...gradeMetadata,
          contentKey,
          setId: savedSet._id,
          setKey,
          setTitle: title,
          examId: String(savedExam._id),
          examKey,
          sourceType: catalogDestination ? `${catalogDestination.group}_question` : isMock ? 'mock_exam_question' : (isRegional ? 'regional_question' : 'tst_question'),
          sourceGroup: catalogDestination?.group || (isMock ? 'mock_exam' : (isRegional ? 'danang_quangnam' : 'tst')),
          origin: isPrediction ? 'prediction' : 'ocr',
          title: cleanText(raw?.title, 500) || `Câu ${questionNumber}`,
          shortLabel: `Câu ${questionNumber}`,
          questionNumber,
          day: `Ngày ${dayNumber}`,
          dayNumber,
          order: dayNumber * (course ? 10000 : 100) + questionNumber,
          orderNumber: questionNumber,
          maxScore: cleanNumber(raw?.maxScore, 0, 0, 20),
          topic: cleanText(raw?.topic, 120) || 'Toán Olympic',
          content,
          predictionReview: review,
          referenceSolution: '',
          contentFormat: 'html-latex',
          frontendAnchor: targetAnchor,
          legacyIds: [`${targetAnchor}-day-${dayNumber}-Cau_${questionNumber}`],
          allowSubmission: !pendingReview,
          allowAiEvaluation: !pendingReview,
          status: pendingReview ? 'draft' : status,
          version: 1,
          updatedBy: session.username,
          updatedAt: now
        };
        return {
          updateOne: {
            filter: { contentKey },
            update: { $set: problemDoc, $setOnInsert: { createdAt: now, referenceLinks: [] } },
            upsert: true
          }
        };
      });
      await db.collection('problems').bulkWrite(questionOperations, { ordered: false });

      const allContentKeys = normalizedQuestions.map(({ questionNumber }) => `${setKey}:question-${questionNumber}`);
      const savedQuestions = await db.collection('problems')
        .find({ contentKey: { $in: allContentKeys } })
        .toArray();
      if (savedQuestions.length !== allContentKeys.length) {
        return res.status(500).json({ success: false, error: 'Không thể lưu đầy đủ câu hỏi của đề thi' });
      }
      const questionsByContentKey = new Map(savedQuestions.map(question => [question.contentKey, question]));
      const orderedQuestions = allContentKeys.map(contentKey => questionsByContentKey.get(contentKey));

      const keptContentKeys = allContentKeys;
      await db.collection('problems').deleteMany({
        examId: String(savedExam._id),
        contentKey: { $nin: keptContentKeys }
      });

      const sourceImageCount = imageCount;
      await db.collection('exam_images').deleteMany({
        examId: savedExam._id,
        pageNumber: { $gt: sourceImageCount }
      });

      await Promise.all([
        db.collection('exams').createIndex(
          { examKey: 1 },
          { unique: true, partialFilterExpression: { examKey: { $type: 'string' } } }
        ),
        db.collection('problems').createIndex({ contentKey: 1 }, { unique: true }),
        db.collection('problems').createIndex({ examId: 1, orderNumber: 1 })
      ]);
      await recordActivity(db, session, 'exam.added', { itemTitle: title });
      return res.status(201).json({
        success: true,
        item: { ...savedExam, problems: orderedQuestions, problemCount: orderedQuestions.length }
      });
    }

    if (action === 'save_exam_image' || action === 'save_exam_images') {
      const examId = objectId(cleanText(payload.examId, 80));
      const batch = action === 'save_exam_images';
      const submittedImages = batch
        ? (Array.isArray(payload.images) ? payload.images : [])
        : [{ pageNumber: payload.pageNumber, image: payload.image }];
      if (!examId || submittedImages.length < 1 || submittedImages.length > MAX_EXAM_IMAGE_PAGES) {
        return res.status(400).json({ success: false, error: 'Mã đề hoặc danh sách ảnh đề thi không hợp lệ' });
      }

      let totalImageChars = 0;
      const pageNumbers = new Set();
      const images = [];
      for (const submitted of submittedImages) {
        const pageNumber = batch
          ? Number(submitted?.pageNumber)
          : Math.max(1, Math.min(MAX_EXAM_IMAGE_PAGES, Number(submitted?.pageNumber) || 1));
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_EXAM_IMAGE_PAGES || pageNumbers.has(pageNumber)) {
          return res.status(400).json({ success: false, error: 'Số trang ảnh đề thi không hợp lệ hoặc bị trùng' });
        }
        const image = cleanSolutionImage(submitted?.image);
        if (!image) {
          return res.status(image === null ? 413 : 400).json({ success: false, error: 'Ảnh đề thi không hợp lệ hoặc vượt quá 3 MB' });
        }
        totalImageChars += image.length;
        if (totalImageChars > MAX_EXAM_IMAGE_BATCH_CHARS) {
          return res.status(413).json({ success: false, error: 'Tổng dung lượng ảnh trong một lô vượt quá giới hạn' });
        }
        pageNumbers.add(pageNumber);
        images.push({ pageNumber, image });
      }

      const exam = await db.collection('exams').findOne({ _id: examId });
      if (!exam) return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi' });
      const maxPageNumber = Math.max(...images.map(({ pageNumber }) => pageNumber));
      await Promise.all([
        db.collection('exam_images').bulkWrite(images.map(({ pageNumber, image }) => ({
          updateOne: {
            filter: { examId, pageNumber },
            update: {
              $set: {
                image, mimeType: image.slice(5, image.indexOf(';')),
                updatedBy: session.username, updatedAt: now
              },
              $setOnInsert: { createdAt: now }
            },
            upsert: true
          }
        })), { ordered: false }),
        db.collection('exams').updateOne(
          { _id: examId },
          { $set: { hasImages: true, updatedAt: now }, $max: { sourceImageCount: maxPageNumber } }
        ),
        db.collection('exam_images').createIndex({ examId: 1, pageNumber: 1 }, { unique: true }),
        recordActivity(db, session, 'exam.image_saved', {
          itemTitle: `${exam.title || 'Đề thi'} – ${images.length} trang`
        })
      ]);
      return res.status(200).json({
        success: true,
        item: batch
          ? { examId: String(examId), pageNumbers: images.map(({ pageNumber }) => pageNumber), hasImage: true }
          : { examId: String(examId), pageNumber: images[0].pageNumber, hasImage: true }
      });
    }

    if (action === 'save_problem') {
      const id = cleanText(payload.id, 180);
      const examId = cleanText(payload.examId, 180);
      if (!id || !examId || !cleanText(payload.content, 50000)) return res.status(400).json({ success: false, error: 'Thiếu mã, đề thi hoặc nội dung bài toán' });
      const doc = { id, examId, orderNumber: Math.max(1, Number(payload.orderNumber) || 1), title: cleanText(payload.title, 500), topic: cleanText(payload.topic, 120) || 'Đại số', content: cleanText(payload.content, 50000), officialSolution: cleanText(payload.officialSolution, 100000), maxScore: Math.max(0, Math.min(20, Number(payload.maxScore) || 5)), updatedBy: session.username, updatedAt: now };
      await db.collection('problems').updateOne({ id }, { $set: doc, $setOnInsert: { createdAt: now } }, { upsert: true });
      await recordActivity(db, session, 'catalog.updated', { itemTitle: doc.title });
      return res.status(200).json({ success: true, item: doc });
    }

    if (action === 'add_event') {
      const title = cleanText(payload.title, 300);
      if (!title || !cleanText(payload.startDate, 80)) return res.status(400).json({ success: false, error: 'Tên và ngày bắt đầu là bắt buộc' });
      const doc = { title, eventType: cleanText(payload.eventType, 80) || 'exam', startDate: cleanText(payload.startDate, 80), endDate: cleanText(payload.endDate, 80), location: cleanText(payload.location, 300) || 'THPT Chuyên Lê Quý Đôn - Đà Nẵng', description: cleanText(payload.description, 5000), targetAudience: cleanText(payload.targetAudience, 300) || 'Đội tuyển HSG QG Toán', createdBy: session.username, createdAt: now };
      const result = await db.collection('events').insertOne(doc);
      await recordActivity(db, session, 'event.added', { itemTitle: title });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'delete_submission') {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID bài nộp không hợp lệ' });
      const result = await db.collection('submissions').deleteOne({ _id: id });
      if (!result.deletedCount) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp' });
      }
      await db.collection('submission_images').deleteMany({ submissionId: id });
      await refreshRagSource(db, id);
      await recordActivity(db, session, 'submission.deleted', { submissionId: id });
      return res.status(200).json({ success: true, deletedId: String(id) });
    }

    if (action === 'update_submission_content') {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID bài nộp không hợp lệ' });
      const submission = await db.collection('submissions').findOne({ _id: id });
      let change;
      try {
        change = buildSubmissionContentUpdate(session, submission, {
          solutionContent: cleanText(payload.solutionContent, 50_000)
        }, now);
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
      const updated = await db.collection('submissions').findOneAndUpdate(
        { _id: id }, change.update, { returnDocument: 'after' }
      );
      if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp' });
      await refreshRagSource(db, id);
      await recordActivity(db, session, 'submission.content_updated', {
        submissionId: id,
        problemKey: updated.problemKey,
        problemTitle: updated.problemSnapshot?.title || updated.problemTitle,
        setTitle: updated.problemSnapshot?.setTitle,
        ownerUsername: updated.username
      });
      return res.status(200).json({
        success: true,
        item: updated,
        verificationRevoked: change.revokedVerification
      });
    }

    if (action === 'verify_submission') {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID bài nộp không hợp lệ' });
      const submission = await db.collection('submissions').findOne({ _id: id });
      let change;
      try {
        change = buildSubmissionVerificationUpdate(session, submission, {
          verified: payload.verified,
          note: cleanText(payload.note, 1000)
        }, now);
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
      const updated = await db.collection('submissions').findOneAndUpdate(
        { _id: id }, change.update, { returnDocument: 'after' }
      );
      if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp' });
      await db.collection('submissions').createIndex({ problemKey: 1, adminVerified: 1, updatedAt: -1 });
      await refreshRagSource(db, id);
      await recordActivity(db, session,
        change.verified ? 'submission.verified' : 'submission.verification_revoked', {
          submissionId: id,
          problemKey: updated.problemKey,
          problemTitle: updated.problemSnapshot?.title || updated.problemTitle,
          setTitle: updated.problemSnapshot?.setTitle,
          ownerUsername: updated.username
        });
      return res.status(200).json({ success: true, item: updated });
    }

    const deletions = { delete_document: 'documents', delete_event: 'events' };
    if (deletions[action]) {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID không hợp lệ' });
      const result = await db.collection(deletions[action]).deleteOne({ _id: id });
      if (result.deletedCount) await recordActivity(db, session, action === 'delete_document' ? 'document.deleted' : 'event.deleted', { itemTitle: String(id) });
      return res.status(result.deletedCount ? 200 : 404).json({ success: Boolean(result.deletedCount), error: result.deletedCount ? undefined : 'Không tìm thấy dữ liệu' });
    }

    return res.status(400).json({ success: false, error: 'Thao tác không hợp lệ' });
  } catch (error) {
    if (error?.code === 'EDUCATION_ACCESS_DENIED') return res.status(403).json({ success: false, error: error.message });
    console.error('[API data]', error);
    return res.status(500).json({ success: false, error: 'Không thể xử lý dữ liệu cơ sở dữ liệu' });
  }
}
