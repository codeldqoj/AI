import { MATH_SUPPORT_TOPICS } from './math-support-topics.js';
import { ObjectId } from 'mongodb';
import { canAccessProblem } from './problem-access.js';

const text = (value, max) => String(value || '').trim().slice(0, max);
const validImage = value => typeof value === 'string' && value.length <= 3_000_000 &&
  /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);

export async function handleMathSupport({ db, req, res, session, action, payload = {} }) {
  const resource = req.query?.resource;
  if (req.method === 'GET' && resource === 'math_support') {
    const filter = { sourceGroup: 'math_support', status: 'published' };
    if (!['admin', 'teacher'].includes(session.role)) filter.ownerId = String(session.sub);
    const q = text(req.query?.q, 100);
    if (q) {
      const search = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      filter.$or = [{ title: search }, { topic: search }, { content: search }];
    }
    const page = Math.max(1, Math.min(100000, Math.floor(Number(req.query?.page) || 1)));
    const limit = 10;
    const total = await db.collection('problems').countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const items = await db.collection('problems').find(filter).sort({ createdAt: -1, _id: -1 })
      .skip((safePage - 1) * limit).limit(limit).toArray();
    res.status(200).json({ success: true, items, pagination: { page: safePage, pages, total, limit } });
    return true;
  }
  if (req.method === 'GET' && resource === 'math_support_image') {
    const id = text(req.query?.problemId, 80);
    const problem = ObjectId.isValid(id) ? await db.collection('problems').findOne({ _id: new ObjectId(id), sourceGroup: 'math_support', status: 'published' }) : null;
    if (!problem || !canAccessProblem(problem, session)) {
      res.status(404).json({ success: false, error: 'Không tìm thấy bài toán' }); return true;
    }
    const image = await db.collection('math_support_images').findOne({ problemId: problem._id });
    if (!image) { res.status(404).json({ success: false, error: 'Không tìm thấy ảnh nguồn' }); return true; }
    res.status(200).json({ success: true, item: { image: image.image } }); return true;
  }
  if (req.method !== 'POST' || action !== 'create_math_support') return false;
  const ownerId = String(session.sub || '');
  const uploadKey = text(payload.uploadKey, 40);
  const content = text(payload.content, 50000);
  const title = text(payload.title, 200) || 'Bài toán riêng lẻ';
  const score = Number(payload.maxScore ?? 5);
  if (!ownerId || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(uploadKey) || !content ||
      typeof payload.content !== 'string' || payload.content.length > 50000 || !validImage(payload.image) ||
      !Number.isFinite(score) || score <= 0 || score > 20) {
    res.status(400).json({ success: false, error: 'Cần ảnh JPEG/PNG/WEBP tối đa 3 MB, nội dung OCR hợp lệ và điểm từ trên 0 đến 20' }); return true;
  }
  const topic = text(payload.topic, 120);
  if (!MATH_SUPPORT_TOPICS.includes(topic)) {
    res.status(400).json({ success: false, error: 'Vui lòng chọn chuyên đề thuộc bảy nhóm chuẩn trước khi lưu' }); return true;
  }
  const now = new Date();
  const setKey = `math_support:${ownerId}`;
  const contentKey = `${setKey}:${uploadKey}`;
  // Unique keys make retries safe even if saving an image fails after the problem.
  await db.collection('problems').createIndex({ contentKey: 1 }, { unique: true });
  await db.collection('content_sets').createIndex({ key: 1 }, { unique: true });
  await db.collection('math_support_images').createIndex({ problemId: 1 }, { unique: true });
  const set = await db.collection('content_sets').findOneAndUpdate({ key: setKey }, { $setOnInsert: {
    key: setKey, group: 'math_support', contentType: 'standalone_problem', title: 'Hỗ trợ giải toán',
    ownerId, isPrivate: true, status: 'published', createdAt: now
  } }, { upsert: true, returnDocument: 'after' });
  const problem = await db.collection('problems').findOneAndUpdate({ contentKey }, { $setOnInsert: {
    contentKey, setKey, setId: set._id, setTitle: 'Hỗ trợ giải toán', title, shortLabel: title,
    sourceGroup: 'math_support', sourceType: 'standalone_question', contentType: 'standalone_problem',
    ownerId, createdBy: session.username, isPrivate: true, origin: 'ocr',
    topic, maxScore: score, content,
    contentFormat: 'html-latex', questionNumber: 1, version: 1, referenceLinks: [],
    referenceSolution: '', referenceSolutionVerified: false, status: 'published',
    allowSubmission: true, allowAiEvaluation: true, hasSourceImage: true,
    ocrConfidence: text(payload.ocrConfidence, 100), createdAt: now, updatedAt: now
  } }, { upsert: true, returnDocument: 'after' });
  await db.collection('math_support_images').updateOne({ problemId: problem._id }, { $setOnInsert: {
    problemId: problem._id, ownerId, image: payload.image, createdAt: now
  } }, { upsert: true });
  res.status(201).json({ success: true, item: problem }); return true;
}
