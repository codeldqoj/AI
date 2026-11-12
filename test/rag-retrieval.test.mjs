import assert from 'node:assert/strict';
import { contentHash, compatible, referenceBlock, fuseRanks } from '../lib/rag-core.js';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
import { queueSource, queueReferenceSolution, setupRag, processRagJobs } from '../lib/rag-store.js';
import worker from '../api/rag-worker.js';
import { embedText } from '../lib/rag-embedding.js';
import { fixtures, cases, FakeDb, embedStub } from './fixtures/rag-fixtures.mjs';
assert.notEqual(contentHash('a_{2727}'), contentHash('a_{27^{27}}'));
assert.notEqual(contentHash('x > 0'), contentHash('x < 0'));
assert.equal(contentHash('<p>\\(x^2\\)</p>'), contentHash('$x^2$'));
assert.equal(compatible({ acute: false }, { acute: true }), false);
assert.equal(fuseRanks([[{ _id: 'a' }], [{ _id: 'a' }, { _id: 'b' }]])[0]._id, 'a');
for (const item of cases()) {
  const data = fixtures(); item.mutate?.(data); const db = new FakeDb(data);
  const problem = data.problems.find(problem => problem.contentKey === item.key);
  const result = await retrieveVerifiedContext({ problemRef: item.key, statement: 'Đề giả từ client', topic: problem.topic,
    session: { role: 'admin', username: 'test' } }, { db, embed: embedStub });
  assert.deepEqual(result.sources.map(source => source.problemKey), item.expected, item.name);
  assert.equal(result.statement, problem.content, 'Đề Atlas phải thay thế đề do client cung cấp');
  assert.equal(db.data.rag_retrieval_logs.length, 1);
  if (result.mode === 'exact') assert.equal(result.retrieval.embeddingTokens, 0);
}
assert.match(referenceBlock([{ sourceId: 's', problemKey: 'p', matchType: 'similar', content: 'Bài tham khảo', statement: 'Bài nguồn' }]),
  /Chấp nhận phương pháp đúng khác nguồn/);
const indexDb = new FakeDb(fixtures());
await setupRag(indexDb); await setupRag(indexDb);
assert.equal(indexDb.data.searchIndexes.length, 2, 'Tạo chỉ mục phải idempotent');
await queueSource(indexDb, indexDb.data.submissions[0]._id);
assert.equal(indexDb.data.verified_knowledge[0].status, 'active', 'Nguồn không đổi không được tái embedding');
indexDb.data.verified_knowledge[0].status = 'pending';
await queueSource(indexDb, indexDb.data.submissions[0]._id);
assert.equal(indexDb.data.verified_knowledge[0].status, 'pending');
assert.equal((await processRagJobs(indexDb, 1, embedStub)).results[0].status, 'ready');
assert.equal(indexDb.data.verified_knowledge[0].status, 'active');
indexDb.data.verified_knowledge[0].status = 'pending';
await queueSource(indexDb, indexDb.data.submissions[0]._id);
delete indexDb.data.verified_knowledge[0].embedding; // Force a paid call for the race test.
const changed = await processRagJobs(indexDb, 1, async () => {
  indexDb.data.submissions[0].adminVerified = false;
  return embedStub();
});
assert.equal(changed.results[0].status, 'failed', 'Thu hồi trong lúc embedding phải chặn việc kích hoạt nguồn');
const privateDb = new FakeDb(fixtures());
privateDb.data.problems[0].setId = '507f1f77bcf86cd799439011';
assert.equal((await retrieveVerifiedContext({ problemRef:'p1', session:{role:'student'} }, {db:privateDb,embed:embedStub})).blocked, true);

const referenceData = fixtures();
const referenceProblem = referenceData.problems[2];
referenceProblem.referenceSolution = 'Lời giải chuẩn đã được giáo viên duyệt. Chứng minh bằng các bước đầy đủ.';
referenceProblem.referenceSolutionVerified = true;
referenceProblem.referenceSolutionProblemHash = contentHash(referenceProblem.content);
referenceProblem.referenceSolutionVerifiedAt = '2026-10-01T00:00:00Z';
referenceData.submissions.splice(1, 1);
referenceData.verified_knowledge.splice(1, 1);
const referenceDb = new FakeDb(referenceData);
await queueReferenceSolution(referenceDb, referenceProblem._id);
assert.equal(referenceDb.data.rag_index_jobs[0].sourceType, 'problem_reference');
assert.equal((await processRagJobs(referenceDb, 1, embedStub)).results[0].status, 'ready');
const similarReference = await retrieveVerifiedContext({
  problemRef: 'p4', session: { role: 'admin', username: 'test' }
}, { db: referenceDb, embed: embedStub });
assert.equal(similarReference.mode, 'hybrid');
assert.equal(similarReference.sources[0].sourceId, `problem-reference:${referenceProblem._id}`);
assert.equal(similarReference.sources[0].permittedUse, 'method-only');

referenceProblem.referenceSolutionVerified = false;
await queueReferenceSolution(referenceDb, referenceProblem._id);
assert.equal(referenceDb.data.verified_knowledge.find(item => item.sourceId === `problem-reference:${referenceProblem._id}`).status, 'revoked');

const saved = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-key';
try {
  const result = await embedText('test', async (_, options) => {
    assert.equal(JSON.parse(options.body).model, 'text-embedding-3-small');
    return { ok: true, status: 200, json: async () => ({ data: [{ embedding: Array(1536).fill(0.1) }], usage: { total_tokens: 3 } }) };
  });
  assert.equal(result.tokens, 3);
  await assert.rejects(embedText('test', async () => ({ ok: true, status: 200, json: async () => ({ data: [{ embedding: [NaN] }] }) })), /RAG_EMBEDDING/);
} finally { if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; }
const oldSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = 'worker-test-secret';
const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} };
await worker({ method: 'GET', headers: { authorization: 'Bearer invalid' } }, response);
assert.equal(response.code, 401);
await worker({ method: 'POST', headers: {} }, response); assert.equal(response.code, 405);
if (oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret;
console.log('Two-stage RAG: identity, version, hypotheses, revocation, deletion, provenance and embedding checks OK');
