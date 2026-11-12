import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const input = process.argv[2];
if (!input) throw new Error('Dùng: npm run catalog:plan -- <catalog-report.json>');
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
const relationsPath = process.argv[3];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/static-catalog-manifest.json'), 'utf8'));
if (report.reportVersion !== 2 || report.mode !== 'dry-run' || report.writes !== 0 ||
    report.candidates?.length !== report.conflictCount) {
  throw new Error('Báo cáo không đầy đủ hoặc không phải dry-run chỉ đọc.');
}

const byType = type => report.candidates.filter(row => row.collection === type);
const problems = byType('problems');
const sets = byType('content_sets');
const exams = byType('exams');
const countTargets = rows => {
  const counts = new Map();
  rows.forEach(row => counts.set(row.existingKey, (counts.get(row.existingKey) || 0) + 1));
  return counts;
};
const duplicateSources = rows => rows.filter(row => rows.filter(x => x.sourceKey === row.sourceKey).length > 1);
if (duplicateSources(problems).length || [...countTargets(problems).values()].some(n => n !== 1)) {
  throw new Error('Ánh xạ câu không phải 1:1; cần rà soát thủ công.');
}
const sharedSets = [...countTargets(sets)].filter(([, n]) => n > 1).map(([existingKey, sourceCount]) => ({
  existingKey, sourceCount, sourceKeys: sets.filter(x => x.existingKey === existingKey).map(x => x.sourceKey)
}));
const sharedExams = [...countTargets(exams)].filter(([, n]) => n > 1).map(([existingKey, sourceCount]) => ({
  existingKey, sourceCount, sourceKeys: exams.filter(x => x.existingKey === existingKey).map(x => x.sourceKey)
}));
const plan = {
  policy: 'retain-atlas-content-and-id', database: report.database,
  retainExistingProblems: problems.length,
  exactContent: problems.filter(x => x.contentEqual).length,
  preserveAtlasDifferences: problems.filter(x => !x.contentEqual).length,
  aliasPairs: problems.map(x => ({ manifestKey: x.sourceKey, atlasKey: x.existingKey,
    manifestSetKey: x.sourceSetKey, atlasSetKey: x.existingSetKey,
    atlasContentHash: x.existingContentHash, contentEqual: x.contentEqual })),
  sharedSets, sharedExams,
  blockers: [
    'Chưa xác minh mọi khóa đề trùng anchor và quan hệ theo ngày.',
    'Chưa có ánh xạ setId/examId được kiểm tra trên Atlas.',
    'Chưa sao lưu và xác minh nội dung Admin/bài nộp.',
    'Chưa thử giao diện API-only trên Vercel Preview.'
  ],
  writes: 0
};
if (relationsPath) {
  const relations = JSON.parse(fs.readFileSync(relationsPath, 'utf8'));
  if (relations.database !== report.database || relations.mode !== 'read-only-relations') {
    throw new Error('Snapshot quan hệ không cùng database hoặc không phải chỉ đọc.');
  }
  const atlasProblems = new Map(relations.problems.map(p => [p.contentKey, p]));
  const atlasSets = new Map(relations.contentSets.map(s => [s.id, s]));
  const sourceProblems = new Map(manifest.problems.map(p => [p.contentKey, p]));
  const sourceSets = new Map(manifest.contentSets.map(s => [s.key, s]));
  const sourceExams = new Map(manifest.exams.map(e => [e.examKey, e]));
  const links = problems.map(alias => {
    const old = atlasProblems.get(alias.existingKey);
    const source = sourceProblems.get(alias.sourceKey);
    const sourceSet = sourceSets.get(source?.setKey);
    const oldSet = atlasSets.get(old?.setId);
    if (!old || !source || !sourceSet || !oldSet || oldSet.key !== alias.existingSetKey ||
        old.contentKey !== alias.existingKey || sourceSet.examKey && !sourceExams.has(sourceSet.examKey)) {
      throw new Error(`Không xác minh được liên kết: ${alias.sourceKey}`);
    }
    if (old.examId) throw new Error(`Câu cũ đã có examId, cần kiểm tra lại: ${alias.existingKey}`);
    return { atlasId: old.id, atlasKey: old.contentKey, atlasSetId: old.setId,
      destinationSetKey: source.setKey, destinationExamKey: sourceSet.examKey || null };
  });
  const migratedIds = new Set(links.map(x => x.atlasId));
  if (migratedIds.size !== links.length) throw new Error('Một câu Atlas xuất hiện nhiều lần trong kế hoạch.');
  plan.relationships = {
    relinkExistingProblems: links.length,
    attachExam: links.filter(x => x.destinationExamKey).length,
    specialtyWithoutExam: links.filter(x => !x.destinationExamKey).length,
    untouchedDynamicProblems: relations.problems.filter(x => !migratedIds.has(x.id)).length,
    createExams: manifest.exams.filter(x => !relations.exams.some(e => e.examKey === x.examKey)).length,
    createContentSets: manifest.contentSets.filter(x => !relations.contentSets.some(s => s.key === x.key)).length,
    createContentBlocks: manifest.contentBlocks.length,
    links
  };
}
console.log(JSON.stringify(plan, null, 2));
