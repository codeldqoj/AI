import { performance } from 'node:perf_hooks';
import { resolveProblem } from './rag-store.js';
import { retrieveVerifiedContext } from './rag-retrieval.js';

export function validateBenchmarkCase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cần một ca benchmark JSON.');
  const problemRef = String(value.problemRef || '').trim();
  const statement = String(value.statement || '').trim();
  if ((!problemRef && !statement) || problemRef.length > 180 || statement.length > 12000) throw new Error('Khóa đề/nội dung benchmark không hợp lệ.');
  if (value.expectedSourceIds !== undefined && (!Array.isArray(value.expectedSourceIds) || value.expectedSourceIds.length > 30 ||
      value.expectedSourceIds.some(id => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)))) throw new Error('expectedSourceIds phải chứa ID nguồn Atlas (24 ký tự hex).');
  if (value.forbiddenSourceIds !== undefined && (!Array.isArray(value.forbiddenSourceIds) || value.forbiddenSourceIds.length > 30 ||
      value.forbiddenSourceIds.some(id => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)))) throw new Error('forbiddenSourceIds không hợp lệ.');
  return { name: String(value.name || problemRef || 'Bài chưa đăng ký').slice(0, 200), problemRef,
    statement, topic: String(value.topic || '').slice(0, 200),
    expectedSourceIds: value.expectedSourceIds === undefined ? null : [...new Set(value.expectedSourceIds)],
    forbiddenSourceIds: [...new Set(value.forbiddenSourceIds || [])],
    bypassEmbeddingCache: value.bypassEmbeddingCache === true };
}
const percentile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1] : null;
export function benchmarkMetrics(rows) {
  return Object.fromEntries(['baseline', 'rag'].map(mode => {
    const samples = rows.filter(row => row.mode === mode);
    const labelled = samples.filter(row => Array.isArray(row.expectedSourceIds));
    const hits = labelled.reduce((n,row) => n + row.sourceIds.filter(id => row.expectedSourceIds.includes(id)).length, 0);
    const relevant = labelled.reduce((n,row) => n + row.expectedSourceIds.length, 0);
    const selected = labelled.reduce((n,row) => n + row.sourceIds.length, 0);
    const empty = labelled.filter(row => !row.expectedSourceIds.length);
    const safety = samples.filter(row => row.forbiddenSourceIds?.length);
    return [mode, { samples: samples.length, labelledSamples: labelled.length,
      recallAt3: relevant ? hits / relevant : null, precisionAt3: selected ? hits / selected : null,
      noSourceAccuracy: empty.length ? empty.filter(row => !row.sourceIds.length).length / empty.length : null,
      forbiddenSourceSafety: safety.length ? safety.filter(row => !row.forbiddenHits?.length).length / safety.length : null,
      p50Ms: percentile(samples.map(row => row.elapsedMs), .5), p95Ms: percentile(samples.map(row => row.elapsedMs), .95),
      embeddingTokens: samples.reduce((n,row) => n+row.embeddingTokens, 0),
      estimatedUsd: samples.some(row => row.estimatedUsd === null) ? null : samples.reduce((n,row) => n+row.estimatedUsd, 0) }];
  }));
}
// Faithful reference-selection baseline from the pre-RAG AI Guide: it does not
// check deletedAt or snapshot hashes. Never pass this baseline to the AI model.
async function legacySources(db, problem) {
  if (!problem) return [];
  if (problem.status === 'draft' || problem.allowAiEvaluation === false) return [];
  if (problem.referenceSolutionVerified === true && problem.referenceSolution?.trim()) return [String(problem._id)];
  const item = await db.collection('submissions').find({ problemKey: problem.contentKey,
    adminVerified: true, solutionContent: { $type: 'string', $ne: '' } })
    .sort({ adminVerifiedAt: -1, updatedAt: -1, createdAt: -1 }).limit(1).toArray();
  return item.map(source => String(source._id));
}
export async function runBenchmarkCase(db, value, session, { retrieve = retrieveVerifiedContext } = {}) {
  if (!['admin', 'teacher'].includes(session?.role)) throw new Error('Benchmark chỉ dành cho Admin hoặc Giáo viên.');
  const test = validateBenchmarkCase(value);
  const observations = [];
  // Alternate the order on repeated runs to reduce systematic warm-up bias.
  const order = value.ragFirst === true ? ['rag', 'baseline'] : ['baseline', 'rag'];
  for (const mode of order) {
    const started = performance.now();
    const problem = await resolveProblem(db, test.problemRef);
    if (test.problemRef && !problem) throw new Error('Không tìm thấy khóa đề trong Atlas.');
    let sourceIds = [], usage = { embeddingTokens: 0, estimatedUsd: 0, embeddingCache: 'not-used' }, retrievalMode = 'none';
    if (mode === 'baseline') sourceIds = await legacySources(db, problem);
    else {
      const result = await retrieve({ problemRef: test.problemRef, statement: problem?.content || test.statement,
        topic: problem?.topic || test.topic, session, purpose: 'benchmark' }, { db, bypassEmbeddingCache: test.bypassEmbeddingCache });
      if (result.blocked) throw new Error('Bài toán chưa được phép dùng AI.');
      sourceIds = result.sources.map(source => source.sourceId);
      usage = result.retrieval;
      retrievalMode = result.mode;
    }
    observations.push({ name: test.name, mode, elapsedMs: Math.round((performance.now() - started)*100)/100,
      sourceIds: [...new Set(sourceIds)].slice(0, 3), expectedSourceIds: test.expectedSourceIds,
      forbiddenSourceIds: test.forbiddenSourceIds, forbiddenHits: sourceIds.filter(id => test.forbiddenSourceIds.includes(id)),
      retrievalMode, embeddingTokens: usage.embeddingTokens, estimatedUsd: usage.estimatedUsd,
      embeddingCache: usage.embeddingCache, warnings: usage.warnings || [], rejectionReasons: usage.rejectionReasons || {} });
  }
  return { environment: 'LIVE ATLAS; excludes AI generation/grading latency and cost',
    baseline: 'Pre-RAG AI Guide reference lookup, not the old full AI pipeline',
    observations, metrics: benchmarkMetrics(observations) };
}
