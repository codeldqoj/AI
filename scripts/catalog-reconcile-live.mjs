import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { EJSON } from 'bson';
import { assertManifest } from '../lib/catalog-manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = assertManifest(JSON.parse(fs.readFileSync(path.join(root, 'data/static-catalog-manifest.json'), 'utf8')));
if (!process.env.CATALOG_REPORT_PATH || !process.env.CATALOG_RELATIONS_PATH) {
  throw new Error('Cáº§n CATALOG_REPORT_PATH vÃ  CATALOG_RELATIONS_PATH tá»« dry-run Atlas.');
}
const report = JSON.parse(fs.readFileSync(process.env.CATALOG_REPORT_PATH || '', 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(process.env.CATALOG_RELATIONS_PATH || '', 'utf8'));
const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri || new URL(uri).pathname.slice(1) !== 'vmo_tst') throw new Error('Cáº§n MONGODB_URI cho /vmo_tst.');
if (report.mode !== 'dry-run' || report.writes !== 0 || report.reportVersion !== 2 ||
    report.candidates?.length !== report.conflictCount || snapshot.mode !== 'read-only-relations' ||
    snapshot.database !== 'vmo_tst' || report.database !== 'vmo_tst') throw new Error('BÃ¡o cÃ¡o/snapshot khÃ´ng há»£p lá»‡.');
if (apply && (process.env.CATALOG_APPLY !== 'YES' || !process.env.CATALOG_BACKUP_PATH)) {
  throw new Error('Cháº¿ Ä‘á»™ ghi cáº§n CATALOG_APPLY=YES vÃ  CATALOG_BACKUP_PATH.');
}

const hash = value => createHash('sha256').update(value).digest('hex');
const aliases = report.candidates.filter(x => x.collection === 'problems');
const problemsByKey = new Map(manifest.problems.map(x => [x.contentKey, x]));
const setsByKey = new Map(manifest.contentSets.map(x => [x.key, x]));
const snapshotProblems = new Map(snapshot.problems.map(x => [x.contentKey, x]));
const oldSetById = new Map(snapshot.contentSets.map(x => [x.id, x]));
if (aliases.length !== manifest.problems.length ||
    new Set(aliases.map(x => x.sourceKey)).size !== aliases.length ||
    new Set(aliases.map(x => x.existingKey)).size !== aliases.length) {
  throw new Error('Ãnh xáº¡ cÃ¢u pháº£i Ä‘áº§y Ä‘á»§ vÃ  1:1.');
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db('vmo_tst');
  const names = ['exams', 'content_sets', 'problems', 'content_blocks'];
  const live = Object.fromEntries(await Promise.all(names.map(async name => [name,
    await db.collection(name).find({}).toArray()
  ])));
  const liveProblemByKey = new Map(live.problems.map(x => [x.contentKey, x]));
  const liveSetById = new Map(live.content_sets.map(x => [String(x._id), x]));
  const sourceExamKeys = new Set(manifest.exams.map(x => x.examKey));
  const sourceSetKeys = new Set(manifest.contentSets.map(x => x.key));
  const resume = apply && process.env.CATALOG_RESUME === 'YES';
  if (!resume && (live.exams.some(x => sourceExamKeys.has(x.examKey)) ||
      live.content_blocks.some(x => manifest.contentBlocks.some(b => b.blockKey === x.blockKey)))) {
    throw new Error('Atlas Ä‘Ã£ cÃ³ má»™t pháº§n catalog má»›i; cáº§n kiá»ƒm kÃª láº¡i trÆ°á»›c khi cháº¡y.');
  }
  const existingSourceSets = live.content_sets.filter(x => sourceSetKeys.has(x.key));
  const snapshotSourceSets = snapshot.contentSets.filter(x => sourceSetKeys.has(x.key));
  if (existingSourceSets.length !== snapshotSourceSets.length ||
      existingSourceSets.some(x => !snapshotSourceSets.some(y => y.key === x.key && y.id === String(x._id)))) {
    throw new Error('NhÃ³m canonical Ä‘Ã£ thay Ä‘á»•i sau snapshot; cáº§n kiá»ƒm kÃª láº¡i.');
  }
  for (const alias of aliases) {
    const source = problemsByKey.get(alias.sourceKey);
    const old = liveProblemByKey.get(alias.existingKey);
    const saved = snapshotProblems.get(alias.existingKey);
    if (resume && old?.examId) continue;
    if (!source || !old || !saved || String(old._id) !== saved.id ||
        String(old.setId || '') !== saved.setId || old.setKey !== saved.setKey ||
        old.examId || old.sourceGroup !== source.sourceGroup ||
        hash(old.content || '') !== alias.existingContentHash ||
        oldSetById.get(saved.setId)?.key !== alias.existingSetKey ||
        liveSetById.get(saved.setId)?.key !== alias.existingSetKey ||
        !setsByKey.has(source.setKey) ||
        liveProblemByKey.has(source.contentKey)) {
      throw new Error(`CÃ¢u Ä‘Ã£ thay Ä‘á»•i hoáº·c Ã¡nh xáº¡ khÃ´ng cháº¯c cháº¯n: ${alias.existingKey}`);
    }
  }
  const untouched = live.problems.filter(x => !aliases.some(a => a.existingKey === x.contentKey));
  if (untouched.some(x => !x.setId || !liveSetById.has(String(x.setId)) ||
      x.examId && !live.exams.some(e => String(e._id) === String(x.examId)))) {
    throw new Error('CÃ¢u ngoÃ i manifest cÃ³ liÃªn káº¿t khÃ´ng há»£p lá»‡.');
  }
  const summary = { mode: apply ? 'apply' : 'preflight', database: 'vmo_tst',
    retainAtlasProblems: aliases.length, attachExam: aliases.filter(x =>
      setsByKey.get(problemsByKey.get(x.sourceKey).setKey).examKey).length,
    untouchedDynamicProblems: untouched.length,
    insertExams: manifest.exams.length,
    insertSets: manifest.contentSets.length - existingSourceSets.length,
    insertBlocks: manifest.contentBlocks.length, writes: 0 };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); }
  else {
    const backupPath = path.resolve(process.env.CATALOG_BACKUP_PATH);
    const fd = fs.openSync(backupPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, EJSON.stringify({ database: 'vmo_tst', createdAt: new Date(), collections: live }, null, 2));
      fs.fsyncSync(fd);
    }
    finally { fs.closeSync(fd); }
    const session = client.startSession();
    const runTx = fn => session.withTransaction(fn, { maxCommitTimeMS: 30000 });
    const chunks = (items, size = 25) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
    try {
      summary.writes = 0;
      for (const batch of chunks(manifest.exams)) await runTx(async () => {
        for (const exam of batch) {
          const result = await db.collection('exams').updateOne({ examKey: exam.examKey },
            { $setOnInsert: { ...exam, importedFrom: 'static-catalog', importedAt: new Date() } }, { upsert: true, session });
          summary.writes += result.upsertedCount;
        }
      });
        const examIds = new Map((await db.collection('exams').find({ examKey: { $in: [...sourceExamKeys] } },
          { projection: { examKey: 1 } }).toArray()).map(x => [x.examKey, x._id]));
      for (const batch of chunks(manifest.contentSets)) await runTx(async () => {
        for (const set of batch) {
          if (existingSourceSets.some(x => x.key === set.key)) continue;
          const row = { ...set, importedFrom: 'static-catalog', importedAt: new Date() };
          if (set.examKey) row.examId = String(examIds.get(set.examKey));
          const result = await db.collection('content_sets').updateOne({ key: set.key },
            { $setOnInsert: row }, { upsert: true, session });
          summary.writes += result.upsertedCount;
        }
      });
      const setIds = new Map((await db.collection('content_sets').find({ key: { $in: [...sourceSetKeys] } },
        { projection: { key: 1 } }).toArray()).map(x => [x.key, x._id]));
      if (examIds.size !== manifest.exams.length || setIds.size !== manifest.contentSets.length) throw new Error('Thiáº¿u Ä‘á»/nhÃ³m sau batch.');
      for (const batch of chunks(aliases, 25)) await runTx(async () => {
        for (const alias of batch) {
          const source = problemsByKey.get(alias.sourceKey);
          const set = setsByKey.get(source.setKey);
          const old = liveProblemByKey.get(alias.existingKey);
          const changes = { setId: setIds.get(set.key), setKey: set.key, catalogSourceKey: source.contentKey };
          if (set.examKey) Object.assign(changes, { examId: String(examIds.get(set.examKey)),
            examKey: set.examKey, orderNumber: source.order });
          const current = await db.collection('problems').findOne({ _id: new ObjectId(old._id) }, { session });
          if (!current) throw new Error(`KhÃ´ng tÃ¬m tháº¥y cÃ¢u khi Ä‘ang ghi: ${old.contentKey}`);
          if (String(current.setId) === String(changes.setId) &&
              (!changes.examId || String(current.examId || '') === String(changes.examId)) &&
              current.catalogSourceKey === changes.catalogSourceKey) continue;
          const result = await db.collection('problems').updateOne({ _id: new ObjectId(old._id),
            contentKey: old.contentKey, content: old.content, setId: old.setId },
            { $set: changes }, { session });
          if (result.matchedCount !== 1) throw new Error(`CÃ¢u thay Ä‘á»•i khi Ä‘ang ghi: ${old.contentKey}`);
          summary.writes += result.modifiedCount;
        }
      });
      for (const batch of chunks(manifest.contentBlocks)) await runTx(async () => {
        for (const block of batch) {
          const result = await db.collection('content_blocks').updateOne({ blockKey: block.blockKey },
            { $setOnInsert: { ...block, importedFrom: 'static-catalog', importedAt: new Date() } }, { upsert: true, session });
          summary.writes += result.upsertedCount;
        }
      });
      console.log(JSON.stringify({ ...summary, backupPath }, null, 2));
    } finally { await session.endSession(); }
  }
} finally { await client.close(); }