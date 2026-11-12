import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { assertManifest, manifestSummary } from '../lib/catalog-manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = assertManifest(JSON.parse(fs.readFileSync(path.join(root, 'data/static-catalog-manifest.json'), 'utf8')));
const apply = process.argv.includes('--apply');
const reportPath = process.env.CATALOG_REPORT_PATH;
const reviewPath = process.env.CATALOG_REVIEW_PATH;
const relationsPath = process.env.CATALOG_RELATIONS_PATH;
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Thiếu MONGODB_URI. Dùng tài khoản Atlas có quyền đọc cho dry-run.');
if (new URL(uri).pathname.slice(1) !== 'vmo_tst') throw new Error('MONGODB_URI phải ghi rõ /vmo_tst.');
if (apply && process.env.CATALOG_APPLY !== 'YES') throw new Error('Để ghi, truyền --apply và CATALOG_APPLY=YES.');

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
const collections = [
  ['exams', manifest.exams, 'examKey'],
  ['content_sets', manifest.contentSets, 'key'],
  ['problems', manifest.problems, 'contentKey'],
  ['content_blocks', manifest.contentBlocks, 'blockKey']
];
const duplicateKeys = (items, field) => {
  const count = new Map();
  items.forEach(item => { if (item[field]) count.set(item[field], (count.get(item[field]) || 0) + 1); });
  return [...count].filter(([, n]) => n > 1).map(([key]) => key);
};

try {
  await client.connect();
  const db = client.db('vmo_tst');
  const existing = Object.fromEntries(await Promise.all(collections.map(async ([name]) =>
    [name, await db.collection(name).find({}, {
      projection: name === 'problems'
        ? { contentKey: 1, setKey: 1, setId: 1, examId: 1, sourceGroup: 1, sourceType: 1,
            frontendAnchor: 1, legacyIds: 1, shortLabel: 1, order: 1, questionNumber: 1,
            status: 1, content: 1 }
        : name === 'exams' ? { examKey: 1, targetAnchor: 1, category: 1, title: 1, dayNumber: 1, province: 1, year: 1, status: 1 }
        : name === 'content_sets' ? { key: 1, examKey: 1, examId: 1, group: 1, title: 1, order: 1, status: 1 } : { blockKey: 1 }
    }).toArray()] )));
  const plan = {};
  const conflicts = [];
  const candidates = [];
  const reviewPairs = [];
  const digest = value => typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : null;
  for (const [name, source, field] of collections) {
    const current = existing[name];
    duplicateKeys(current, field).forEach(key => conflicts.push(`${name}: khóa trùng trong Atlas ${key}`));
    const keyed = new Map(current.filter(item => item[field]).map(item => [item[field], item]));
    const missing = source.filter(item => !keyed.has(item[field]));
    plan[name] = {
      existing: current.length,
      matched: source.length - missing.length,
      insert: missing.length,
      sampleMissingKeys: missing.slice(0, 15).map(item => item[field])
    };
    if (name === 'exams') {
      missing.forEach(item => {
        const collision = current.find(x => x.category === item.category && x.targetAnchor === item.targetAnchor);
        if (collision) {
          conflicts.push(`exams: anchor ${item.targetAnchor} đã thuộc ${collision.examKey || collision._id}`);
          candidates.push({ collection: name, sourceKey: item.examKey, existingKey: collision.examKey,
            reason: 'category+anchor', sourceTitle: item.title, existingTitle: collision.title });
        }
      });
    }
    if (name === 'content_sets') {
      missing.forEach(item => {
        const aliases = [
          item.key.replace(/^tst-national:/, 'tst:'),
          item.key.replace(/^history-dn-qn:/, 'danang_quangnam:')
        ];
        const collision = current.find(x => aliases.includes(x.key) ||
          (x.group === item.group && x.title === item.title));
        if (collision) {
          conflicts.push(`content_sets: ${item.key} có thể trùng nhóm ${collision.key || collision._id}`);
          candidates.push({ collection: name, sourceKey: item.key, existingKey: collision.key,
            reason: aliases.includes(collision.key) ? 'alias' : 'group+title',
            sourceTitle: item.title, existingTitle: collision.title,
            existingExamKey: collision.examKey, existingExamId: String(collision.examId || '') });
        }
      });
    }
    if (name === 'problems') {
      const manifestByKey = new Map(source.map(item => [item.contentKey, item]));
      plan[name].matchedWithoutSetId = current.filter(x => manifestByKey.has(x.contentKey) && !x.setId).length;
      plan[name].matchedWithoutExamId = current.filter(x => {
        const sourceProblem = manifestByKey.get(x.contentKey);
        return sourceProblem && sourceProblem.sourceGroup !== 'specialty' && !x.examId;
      }).length;
      missing.forEach(item => {
        const collision = current.find(x => {
          const aliases = new Set([item.contentKey, ...(item.legacyIds || [])]);
          if (aliases.has(x.contentKey) || (x.legacyIds || []).some(id => aliases.has(id))) return true;
          // Một số bản đồng bộ cũ đã đổi khóa và chỉ giữ lại thứ tự/nhãn câu.
          return x.sourceGroup === item.sourceGroup && item.frontendAnchor &&
            x.frontendAnchor === item.frontendAnchor && Number.isInteger(item.order) &&
            Number(x.order) === item.order &&
            String(x.shortLabel || '').trim().toLocaleLowerCase('vi') ===
            String(item.shortLabel || '').trim().toLocaleLowerCase('vi');
        });
        if (collision) {
          conflicts.push(`problems: ${item.contentKey} có thể trùng bản ghi ${collision.contentKey || collision._id}; cần đối chiếu trước khi nhập`);
          candidates.push({ collection: name, sourceKey: item.contentKey, existingKey: collision.contentKey,
            sourceSetKey: item.setKey, existingSetKey: collision.setKey,
            sourceContentHash: digest(item.content), existingContentHash: digest(collision.content),
            contentEqual: typeof collision.content === 'string' && item.content === collision.content,
            existingSetId: String(collision.setId || ''), existingExamId: String(collision.examId || '') });
          if (item.content !== collision.content) reviewPairs.push({
            sourceKey: item.contentKey, existingKey: collision.contentKey,
            sourceSetKey: item.setKey, existingSetKey: collision.setKey,
            sourceContent: item.content, existingContent: collision.content ?? null
          });
        }
      });
    }
  }
  const setKeys = new Set([...existing.content_sets.map(x => x.key), ...manifest.contentSets.map(x => x.key)]);
  const examKeys = new Set([...existing.exams.map(x => x.examKey), ...manifest.exams.map(x => x.examKey)]);
  manifest.problems.forEach(p => { if (!setKeys.has(p.setKey)) conflicts.push(`problem thiếu set ${p.contentKey}`); });
  manifest.contentSets.filter(x => x.examKey).forEach(x => { if (!examKeys.has(x.examKey)) conflicts.push(`set thiếu exam ${x.key}`); });
  const report = { reportVersion: 2, mode: apply ? 'apply' : 'dry-run', database: 'vmo_tst', manifest: manifestSummary(manifest),
    plan, conflicts, conflictCount: conflicts.length, candidates, writes: 0 };
  const outputReport = () => {
    const json = JSON.stringify(report, null, 2);
    if (reportPath) fs.writeFileSync(path.resolve(reportPath), json + '\n', 'utf8');
    if (reviewPath) fs.writeFileSync(path.resolve(reviewPath), JSON.stringify({
      database: 'vmo_tst', mode: 'read-only-review', count: reviewPairs.length,
      pairs: reviewPairs
    }, null, 2) + '\n', 'utf8');
    if (relationsPath) fs.writeFileSync(path.resolve(relationsPath), JSON.stringify({
      database: 'vmo_tst', mode: 'read-only-relations',
      exams: existing.exams.map(({ _id, ...fields }) => ({ id: String(_id), ...fields })),
      contentSets: existing.content_sets.map(({ _id, examId, ...fields }) => ({
        id: String(_id), examId: String(examId || ''), ...fields
      })),
      problems: existing.problems.map(({ _id, setId, examId, content, ...fields }) => ({
        id: String(_id), setId: String(setId || ''), examId: String(examId || ''), ...fields
      }))
    }, null, 2) + '\n', 'utf8');
    console.log(json);
  };
  if (conflicts.length) {
    outputReport();
    throw new Error('Phát hiện xung đột; chưa ghi bất kỳ bản ghi nào.');
  }
  if (!apply) { outputReport(); }
  else {
    // Insert only: dữ liệu đã tồn tại, nhất là các sửa chữa của Admin, luôn được giữ nguyên.
    for (const [name, source, field] of collections) {
      const known = new Set(existing[name].map(x => x[field]));
      for (const item of source) {
        if (known.has(item[field])) continue;
        const row = { ...item, importedFrom: 'static-catalog', importedAt: new Date() };
        if (name === 'content_sets' && item.examKey) {
          const exam = await db.collection('exams').findOne({ examKey: item.examKey }, { projection: { _id: 1 } });
          if (!exam) throw new Error(`Không tìm thấy exam ${item.examKey}`);
          row.examId = String(exam._id);
        }
        if (name === 'problems') {
          const set = await db.collection('content_sets').findOne({ key: item.setKey }, { projection: { _id: 1, examKey: 1 } });
          if (!set) throw new Error(`Không tìm thấy set ${item.setKey}`);
          row.setId = set._id;
          if (set.examKey) {
            const exam = await db.collection('exams').findOne({ examKey: set.examKey }, { projection: { _id: 1 } });
            if (!exam) throw new Error(`Không tìm thấy exam ${set.examKey}`);
            row.examKey = set.examKey;
            row.examId = String(exam._id);
            row.orderNumber = item.order;
          }
        }
        const result = await db.collection(name).updateOne({ [field]: item[field] }, { $setOnInsert: row }, { upsert: true });
        if (result.upsertedCount) report.writes++;
      }
    }
    outputReport();
  }
} finally { await client.close(); }
