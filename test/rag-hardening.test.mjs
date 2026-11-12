import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { topicOf, plain, mathTags, tagCompatibility, constraints, contentHash, RAG_VERSION } from '../lib/rag-core.js';
import { queryEmbedding } from '../lib/rag-query-cache.js';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
import { queueSource, processRagJobs } from '../lib/rag-store.js';
import { runBenchmarkCase, benchmarkMetrics, validateBenchmarkCase } from '../lib/rag-benchmark.js';
import { accepted, describeGuideError, substantive } from '../api/ai-guide.js';
import { verifierChecks, verifierApproved } from '../api/ai-evaluate-solution.js';
import { FakeDb, fixtures, embedStub } from './fixtures/rag-fixtures.mjs';

for (const label of ['Đa thức', 'ĐA THỨC', 'đa thức', 'Đại số - Đa thức']) assert.equal(topicOf(label), 'polynomials');
assert.equal(topicOf('Đại số'), 'algebra');
assert.equal(plain('ĐỒNG DƯ'), 'dong du');
assert.ok(mathTags('Dãy đơn điệu, bị chặn, hội tụ bằng truy hồi.').includes('monotonicity'));
assert.ok(mathTags('SO NGUYEN TO VA UOC CHUNG GCD').includes('gcd'));
assert.equal(constraints('Cho tam giác $ABC$ nhọn.').acute, true);
assert.equal(constraints('Cho tam giác ABC không nhất thiết nhọn.').acute, false);
assert.equal(constraints('Cho số nguyên dương n.').positive, true);
assert.equal(tagCompatibility(['simson-line','circle'], ['circle','orthocenter']), false);
assert.equal(tagCompatibility(['circle'], ['circle']), false);
assert.equal(tagCompatibility(['simson-line','circle'], ['simson-line','circle']), true);
assert.equal(contentHash('f(0)\\ne0'), contentHash('f(0) \\ne 0'));
assert.notEqual(contentHash('x<sup>2</sup>'), contentHash('x 2'));
assert.notEqual(contentHash('a<sub>27</sub>'), contentHash('a 27'));
assert.notEqual(contentHash('p^{q^2}'), contentHash('p^{p^2}'));

const cacheDb = new FakeDb(fixtures()); let calls = 0;
const embed = async () => { calls++; return embedStub(); };
assert.equal((await queryEmbedding(cacheDb, 'same problem', { embed })).cache, 'miss');
assert.equal((await queryEmbedding(cacheDb, 'same problem', { embed })).tokens, 0);
assert.equal(calls, 1);
await queryEmbedding(cacheDb, 'changed problem', { embed }); assert.equal(calls, 2);
await queryEmbedding(cacheDb, 'same problem', { embed, bypass: true }); assert.equal(calls, 3);
cacheDb.data.rag_query_embeddings[0].expiresAt = new Date(0);
await queryEmbedding(cacheDb, 'same problem', { embed }); assert.equal(calls, 4);
const oldModel = process.env.RAG_EMBEDDING_MODEL;
process.env.RAG_EMBEDDING_MODEL = 'text-embedding-3-large';
try {
  const modelResult = await queryEmbedding(cacheDb, 'same problem', { embed: async () => ({ ...await embedStub(), model: 'text-embedding-3-large' }) });
  assert.equal(modelResult.cache, 'miss');
} finally { if (oldModel === undefined) delete process.env.RAG_EMBEDDING_MODEL; else process.env.RAG_EMBEDDING_MODEL = oldModel; }
const concurrentDb = new FakeDb(fixtures()); let concurrentCalls = 0;
let release; const gate = new Promise(resolve => { release = resolve; });
const concurrentEmbed = async () => { concurrentCalls++; await gate; return embedStub(); };
const concurrent = [queryEmbedding(concurrentDb, 'concurrent', { embed: concurrentEmbed }), queryEmbedding(concurrentDb, 'concurrent', { embed: concurrentEmbed })];
await new Promise(resolve => setImmediate(resolve)); release();
const shared = await Promise.all(concurrent);
assert.equal(concurrentCalls, 1); assert.equal(shared.reduce((sum,row) => sum+row.tokens,0), 8);
await assert.rejects(queryEmbedding(cacheDb, 'invalid vector', { embed: async () => ({ ...await embedStub(), vector: [NaN] }) }), /INVALID/);
await assert.rejects(queryEmbedding(cacheDb, 'failed call', { embed: async () => { throw Error('provider failure'); } }), /provider failure/);
assert.equal((await queryEmbedding(cacheDb, 'failed call', { embed: embedStub })).cache, 'miss');

const db = new FakeDb(fixtures());
const input = { problemRef: 'p4', session: { role: 'admin', username: 'test' } };
const first = await retrieveVerifiedContext(input, { db, embed: embedStub });
assert.equal(first.mode, 'hybrid'); assert.equal(first.sources[0].permittedUse, 'method-only');
db.data.submissions[1].adminVerified = false;
const revoked = await retrieveVerifiedContext(input, { db, embed: async () => { throw Error('should use cached vector'); } });
assert.equal(revoked.mode, 'none'); assert.equal(revoked.retrieval.embeddingCache, 'hit');
assert.equal(revoked.retrieval.rejectionReasons['stale-or-hidden-source'], 1);
db.data.submissions.splice(1,1);
assert.equal((await retrieveVerifiedContext(input, { db, embed: embedStub })).mode, 'none', 'Xóa nguồn có hiệu lực trên cache hit');
const noTagsDb = new FakeDb(fixtures());
let noTagCalls = 0;
const none = await retrieveVerifiedContext({ statement: 'Cho đường tròn tâm O.', topic: 'Hình học', session: { role: 'admin' } },
  { db: noTagsDb, embed: async () => { noTagCalls++; return embedStub(); } });
assert.equal(noTagCalls, 0); assert.equal(none.mode, 'none'); assert.ok(none.retrieval.warnings.includes('no_specific_query_tags'));
const simson = await retrieveVerifiedContext({ statement: 'Chứng minh định lý Simson cho P trên đường tròn.', topic: 'Hình học', session: { role: 'admin' } },
  { db: noTagsDb, embed: async () => { throw Error('Không trả phí cho nguồn chỉ trùng đường tròn'); } });
assert.equal(simson.mode, 'none'); assert.ok(simson.retrieval.warnings.includes('no_tagged_sources'));
const staleVersionDb = new FakeDb(fixtures()); staleVersionDb.data.verified_knowledge.forEach(doc => { doc.metadataVersion = 1; });
assert.equal((await retrieveVerifiedContext(input, { db: staleVersionDb, embed: embedStub })).mode, 'none');

const upgraded = new FakeDb(fixtures());
const doc = upgraded.data.verified_knowledge[1];
const submission = upgraded.data.submissions[1]; const problem = upgraded.data.problems[2];
// Recreate a v1 record with the exact old embedding input.
doc.metadataVersion = 1;
doc.searchText = `${problem.content}\n${problem.topic}\n${submission.solutionContent}`;
await queueSource(upgraded, submission._id);
assert.equal(doc.status, 'active', 'Nâng metadata giữ nguồn v1 hợp lệ online trong lúc chờ');
const processed = await processRagJobs(upgraded, 1, async () => { throw Error('must reuse identical vector'); });
assert.equal(processed.results[0].reusedEmbedding, true); assert.equal(doc.metadataVersion, RAG_VERSION);
assert.equal(processed.results[0].tokens, 0);

assert.throws(() => validateBenchmarkCase({ problemRef: 'p1', expectedSourceIds: 'not labels' }), /expectedSourceIds/);
assert.throws(() => validateBenchmarkCase({ problemRef: 'p1', expectedSourceIds: ['invalid'] }), /expectedSourceIds/);
await assert.rejects(runBenchmarkCase(null, {}, { role: 'student' }), /Admin/);
const benchmarkDb = new FakeDb(fixtures());
const report = await runBenchmarkCase(benchmarkDb, { problemRef: 'p1', expectedSourceIds: [String(benchmarkDb.data.submissions[0]._id)] }, { role: 'admin' },
  { retrieve: (input, options) => retrieveVerifiedContext(input, { ...options, embed: embedStub }) });
assert.equal(report.metrics.rag.recallAt3, 1);
const noLabels = benchmarkMetrics([{ mode: 'rag', sourceIds: [String(new ObjectId())], expectedSourceIds: null, elapsedMs: 4, embeddingTokens: 0, estimatedUsd: 0 }]);
assert.equal(noLabels.rag.precisionAt3, null); assert.equal(noLabels.rag.recallAt3, null);
const negative = benchmarkMetrics([{ mode: 'rag', sourceIds: [], expectedSourceIds: [], elapsedMs: 4, embeddingTokens: 0, estimatedUsd: 0 }]);
assert.equal(negative.rag.noSourceAccuracy, 1);
benchmarkDb.data.problems[0].content = 'Đề đã thay đổi hoàn toàn.';
const changed = await runBenchmarkCase(benchmarkDb, { problemRef: 'p1', expectedSourceIds: [] }, { role: 'admin' },
  { retrieve: (input, options) => retrieveVerifiedContext(input, { ...options, embed: embedStub }) });
assert.equal(changed.metrics.baseline.noSourceAccuracy, 0); assert.equal(changed.metrics.rag.noSourceAccuracy, 1);

const approval = { approved:true,score:5,allPartsCorrect:true,rigorous:true,noExtraAssumptions:true,equalityCasesChecked:true,matchesVerifiedReference:true };
assert.equal(accepted(approval), false, 'Không được xuất bản khi thiếu kiểm tra suy biến');
assert.equal(accepted({ ...approval, degeneraciesChecked: true, degeneracyChecks: ['Đã tách P là điểm đối diện A; các góc có cạnh không xác định được thay bằng chứng minh trực tiếp.'] }), true);
assert.equal(describeGuideError({ code: 'OPENAI_HTTP_401' }).error.includes('không phản hồi'), false);
assert.equal(describeGuideError({ code: 'OPENAI_TIMEOUT' }).stage, 'verifier');
assert.equal(describeGuideError({ code: 'AI_TIMEOUT' }).stage, 'solver');
const conciseInvariantProof = 'Xét số bóng đang bật modulo 2. Mỗi thao tác đổi trạng thái đúng hai bóng nên số bóng bật thay đổi −2, 0 hoặc 2; tính chẵn lẻ vì thế được bảo toàn và ban đầu bằng 0. Do đó, muốn bật cả n bóng thì n phải chẵn. Ngược lại, nếu n chẵn, chia các bóng thành n/2 cặp rồi thực hiện thao tác một lần trên mỗi cặp. Khi kết thúc, mỗi bóng đã được đổi đúng một lần nên tất cả đều bật. Vậy điều kiện cần và đủ là n chẵn.';
assert.equal(substantive(conciseInvariantProof, ['n chẵn'], 1), true, 'A complete concise invariant proof passes without filler');
assert.equal(substantive('Hãy thực hiện các phép thế thích hợp.', ['n chẵn'], 1), false, 'Generic advice is still rejected');
assert.equal(verifierChecks({ allClaimsChecked:true, mathCorrect:true, scoreConsistent:true, noInventedStudentWork:true }, false).degeneraciesChecked, false);
const finalReport = { allClaimsChecked:true, mathCorrect:true, scoreConsistent:true, noInventedStudentWork:true,
  degeneraciesChecked:true, degeneracyChecks:['Đã kiểm tra mẫu số bằng không và giải riêng trường hợp các điểm trùng nhau.'] };
assert.equal(verifierApproved({ ...finalReport, approved:false }, false), false);
assert.equal(verifierApproved({ ...finalReport, approved:true }, false), true);
console.log('RAG hardening: Unicode/topics, specific tags, cache/invalidation, metadata reuse, benchmark labels/Admin, degeneracy approval gates OK');
