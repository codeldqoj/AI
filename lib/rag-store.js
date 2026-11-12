import { statementFingerprint } from './rag-statement-match.js';
import { ObjectId } from 'mongodb';
import { contentHash, mathText, mathTags, constraints, topicOf, RAG_VERSION, EMBEDDING_VERSION, sourceFresh, referenceSourceFresh } from './rag-core.js';
import { embedText, embeddingConfig } from './rag-embedding.js';

export async function resolveProblem(db, ref) {
  if (!ref) return null;
  const filters = [{ contentKey: String(ref) }, { id: String(ref) }];
  if (ObjectId.isValid(String(ref))) filters.unshift({ _id: new ObjectId(String(ref)) });
  return db.collection('problems').findOne({ $or: filters });
}
export async function queueSource(db, sourceId) {
  const submission = await db.collection('submissions').findOne({ _id: sourceId });
  const status = submission?.adminVerified === true && !submission.deletedAt ? 'pending' : 'revoked';
  const existing = await db.collection('verified_knowledge').findOne({ sourceId });
  const config = embeddingConfig();
  let stillFresh = false;
  if (existing?.status === 'active' && existing.embeddingModel === config.model &&
      existing.embeddingDimensions === config.dimensions && existing.embeddingVersion === EMBEDDING_VERSION) {
    const problem = await resolveProblem(db, submission?.problemKey || submission?.problemId);
    stillFresh = sourceFresh(existing, submission, problem);
    if (stillFresh && existing.metadataVersion === RAG_VERSION && existing.statementFingerprint === statementFingerprint(problem.content)) return;
  }
  // A metadata-only upgrade must not take a valid v1 reference offline while
  // preview processing is pending. V2 queries still exclude its old metadata.
  if (!stillFresh) await db.collection('verified_knowledge').updateOne({ sourceId }, { $set: { status, updatedAt: new Date() } });
  await db.collection('rag_index_jobs').updateOne({ sourceId }, {
    $set: { status, updatedAt: new Date(), attempts: 0, error: '', leaseUntil: new Date(0) },
    $setOnInsert: { createdAt: new Date() }
  }, { upsert: true });
}
export async function queueReferenceSolution(db, problemRef) {
  const problem = await resolveProblem(db, problemRef);
  if (!problem) return;
  const sourceId = `problem-reference:${String(problem._id)}`;
  const verified = problem.referenceSolutionVerified === true && Boolean(problem.referenceSolution?.trim()) &&
    problem.referenceSolutionProblemHash === contentHash(problem.content) && problem.allowAiEvaluation !== false;
  const existing = await db.collection('verified_knowledge').findOne({ sourceId });
  if (!verified || problem.isPrivate === true || problem.sourceGroup === 'math_support' || problem.status !== 'published') {
    if (existing) await db.collection('verified_knowledge').updateOne({ sourceId }, { $set: { status: 'revoked', updatedAt: new Date() } });
    const job = await db.collection('rag_index_jobs').findOne({ sourceId });
    if (job) await db.collection('rag_index_jobs').updateOne({ sourceId }, {
      $set: { sourceType: 'problem_reference', problemId: problem._id, status: 'revoked', updatedAt: new Date(),
        attempts: 0, error: 'SOURCE_NOT_CURRENT', leaseUntil: new Date(0) }
    });
    return;
  }
  const config = embeddingConfig();
  const fresh = existing?.status === 'active' && existing.embeddingModel === config.model &&
    existing.embeddingDimensions === config.dimensions && existing.embeddingVersion === EMBEDDING_VERSION &&
    referenceSourceFresh(existing, problem) &&
    existing.metadataVersion === RAG_VERSION &&
    existing.statementFingerprint === statementFingerprint(problem.content);
  if (fresh) return;
  const job = await db.collection('rag_index_jobs').findOne({ sourceId });
  if (job?.status === 'pending' || job?.status === 'processing') return;
  if (existing && !(existing.status === 'active' && referenceSourceFresh(existing, problem))) {
    await db.collection('verified_knowledge').updateOne({ sourceId }, { $set: { status: 'pending', updatedAt: new Date() } });
  }
  await db.collection('rag_index_jobs').updateOne({ sourceId }, {
    $set: { sourceType: 'problem_reference', problemId: problem._id, status: 'pending', updatedAt: new Date(),
      attempts: 0, error: '', leaseUntil: new Date(0) },
    $setOnInsert: { createdAt: new Date() }
  }, { upsert: true });
}
export async function setupRag(db, searchIndexes = true) {
  await db.collection('verified_knowledge').createIndex({ sourceId: 1 }, { unique: true });
  await db.collection('verified_knowledge').createIndex({ status: 1, problemKey: 1, problemContentHash: 1 });
  await db.collection('rag_index_jobs').createIndex({ sourceId: 1 }, { unique: true });
  await db.collection('rag_index_jobs').createIndex({ status: 1, leaseUntil: 1, updatedAt: 1 });
  await db.collection('rag_query_embeddings').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('rag_retrieval_logs').createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });
  if (searchIndexes) {
    const collection = db.collection('verified_knowledge');
    const existing = await collection.listSearchIndexes().toArray();
    const { dimensions } = embeddingConfig();
    const vector = existing.find(item => item.name === 'rag_vector_v1');
    const oldDimensions = vector?.latestDefinition?.fields?.find(field => field.type === 'vector')?.numDimensions;
    if (oldDimensions && oldDimensions !== dimensions) throw new Error('RAG_VECTOR_DIMENSIONS_CHANGED: cần tạo lại chỉ mục có kiểm soát');
    const requiredFields = [{ type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine' },
      ...['source', 'status', 'topic', 'embeddingModel', 'embeddingVersion', 'embeddingDimensions', 'metadataVersion', 'mathTags'].map(path => ({ type: 'filter', path }))];
    if (!vector) await collection.createSearchIndex({ name: 'rag_vector_v1', type: 'vectorSearch', definition: { fields: requiredFields } });
    else if (requiredFields.some(field => !vector.latestDefinition?.fields?.some(old => old.path === field.path))) {
      const fields = [...(vector.latestDefinition?.fields || [])];
      requiredFields.forEach(field => { if (!fields.some(old => old.path === field.path)) fields.push(field); });
      await collection.updateSearchIndex('rag_vector_v1', { ...vector.latestDefinition, fields });
    }
    const textIndex = existing.find(item => item.name === 'rag_text_v1');
    const fields = { searchText: { type: 'string', analyzer: 'lucene.standard' }, metadataVersion: { type: 'number' },
      ...Object.fromEntries(['source', 'status', 'topic', 'mathTags'].map(path => [path, { type: 'token' }])) };
    if (!textIndex) await collection.createSearchIndex({ name: 'rag_text_v1', definition: { mappings: { dynamic: false, fields } } });
    else if (!textIndex.latestDefinition?.mappings?.fields?.metadataVersion) {
      await collection.updateSearchIndex('rag_text_v1', { ...textIndex.latestDefinition,
        mappings: { ...textIndex.latestDefinition?.mappings, dynamic: false,
          fields: { ...textIndex.latestDefinition?.mappings?.fields, ...fields } } });
    }
  }
  return { success: true, dimensions: embeddingConfig().dimensions };
}
export async function backfillSources(db, limit = 100, after = '') {
  const cursor = after && ObjectId.isValid(after) ? new ObjectId(after) : null;
  const afterFilter = cursor ? { _id: { $gt: cursor } } : {};
  const [submissions, references] = await Promise.all([
    db.collection('submissions').find({ adminVerified: true, solutionContent: { $type: 'string', $ne: '' },
      deletedAt: { $exists: false }, ...afterFilter }, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(limit + 1).toArray(),
    db.collection('problems').find({ referenceSolutionVerified: true, referenceSolution: { $type: 'string', $ne: '' },
      status: 'published', isPrivate: { $ne: true }, allowAiEvaluation: { $ne: false },
      sourceGroup: { $ne: 'math_support' }, ...afterFilter },
    { projection: { _id: 1 } }).sort({ _id: 1 }).limit(limit + 1).toArray()
  ]);
  const items = [
    ...submissions.map(item => ({ ...item, sourceType: 'submission' })),
    ...references.map(item => ({ ...item, sourceType: 'problem_reference' }))
  ].sort((a, b) => String(a._id).localeCompare(String(b._id))).slice(0, limit);
  for (const item of items) {
    if (item.sourceType === 'problem_reference') await queueReferenceSolution(db, item._id);
    else await queueSource(db, item._id);
  }
  return { queued: items.length, after: items.length ? String(items.at(-1)._id) : after,
    hasMore: submissions.length > limit || references.length > limit || items.length === limit };
}
export async function processRagJobs(db, limit = 3, embed = embedText) {
  const results = [];
  for (let index = 0; index < Math.min(3, limit); index++) {
    const now = new Date();
    const job = await db.collection('rag_index_jobs').findOneAndUpdate({
      $or: [{ status: { $in: ['pending', 'failed'] }, attempts: { $lt: 5 } }, { status: 'processing', leaseUntil: { $lt: now } }]
    }, { $set: { status: 'processing', leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } },
    { sort: { updatedAt: 1 }, returnDocument: 'after' });
    if (!job) break;
    try {
      const isReference = job.sourceType === 'problem_reference';
      const submission = isReference ? null : await db.collection('submissions').findOne({ _id: job.sourceId });
      const problem = isReference ? await resolveProblem(db, job.problemId) :
        await resolveProblem(db, submission?.problemKey || submission?.problemId);
      const solution = isReference ? problem?.referenceSolution : submission?.solutionContent;
      const sourceIsCurrent = isReference ? referenceSourceFresh({
        topic: topicOf(problem?.topic),
        problemContentHash: contentHash(problem?.content),
        solutionContentHash: contentHash(solution),
        verifiedAt: problem?.referenceSolutionVerifiedAt
      }, problem) : Boolean(submission?.adminVerified && !submission.deletedAt && solution?.trim() && problem &&
        problem.isPrivate !== true && problem.sourceGroup !== 'math_support' && problem.status === 'published' &&
        mathText(submission.problemSnapshot?.content) && contentHash(submission.problemSnapshot.content) === contentHash(problem.content));
      if (!sourceIsCurrent) {
        await db.collection('verified_knowledge').updateOne({ sourceId: job.sourceId }, { $set: { status: 'revoked' } });
        await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $set: { status: 'revoked', error: 'SOURCE_NOT_CURRENT' } });
        results.push({ sourceId: String(job.sourceId), status: 'revoked' }); continue;
      }
      const topic = topicOf(problem.topic);
      const searchText = `${mathText(problem.content).slice(0, 3500)}\n${problem.topic || ''}\n${mathText(solution).slice(0, 6000)}`;
      const existing = await db.collection('verified_knowledge').findOne({ sourceId: job.sourceId });
      const config = embeddingConfig();
      const reused = existing?.searchText === searchText && existing.embeddingModel === config.model &&
        existing.embeddingDimensions === config.dimensions && Array.isArray(existing.embedding) &&
        existing.embedding.length === config.dimensions && existing.embedding.every(Number.isFinite);
      // Metadata/version upgrades do not require paying to embed identical input.
      const embedding = reused ? { ...config, vector: existing.embedding, tokens: 0, estimatedUsd: 0 } : await embed(searchText);
      // Accumulate paid indexing usage even if the source changed during the call.
      await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $inc: {
        embeddingTokens: embedding.tokens || 0,
        ...(embedding.estimatedUsd === null ? {} : { estimatedUsd: embedding.estimatedUsd || 0 })
      }, $set: { costConfigured: embedding.estimatedUsd !== null } });
      const doc = { statementFingerprint: statementFingerprint(problem.content), source: 'admin_verified', sourceId: job.sourceId,
        sourceType: isReference ? 'problem_reference' : 'submission',
        sourceCollection: isReference ? 'problems' : 'submissions',
        problemId: problem._id, problemKey: problem.contentKey || String(problem._id),
        problemContentHash: contentHash(problem.content), solutionContentHash: contentHash(solution),
        verifiedAt: isReference ? problem.referenceSolutionVerifiedAt : submission.adminVerifiedAt, topic, mathTags: mathTags(searchText),
        constraints: constraints(problem.content), documentType: 'verified-reference', searchText,
        embedding: embedding.vector, embeddingModel: embedding.model, embeddingDimensions: embedding.dimensions,
        embeddingVersion: EMBEDDING_VERSION, metadataVersion: RAG_VERSION, embeddingTokens: reused ? existing.embeddingTokens : embedding.tokens,
        estimatedUsd: reused ? existing.estimatedUsd : embedding.estimatedUsd,
        status: 'active', indexedAt: new Date() };
      // Re-read after the paid call: revocation/content edits during indexing must win.
      const current = isReference ? null : await db.collection('submissions').findOne({ _id: job.sourceId });
      const currentProblem = await resolveProblem(db, doc.problemKey);
      const stillCurrent = isReference ? referenceSourceFresh(doc, currentProblem) : sourceFresh(doc, current, currentProblem);
      if (!stillCurrent) throw new Error('SOURCE_CHANGED_DURING_INDEX');
      await db.collection('verified_knowledge').updateOne({ sourceId: job.sourceId }, { $set: doc }, { upsert: true });
      await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $set: { status: 'ready', error: '', updatedAt: new Date() } });
      results.push({ sourceId: String(job.sourceId), status: 'ready', reusedEmbedding: Boolean(reused), tokens: embedding.tokens, estimatedUsd: embedding.estimatedUsd });
    } catch (error) {
      await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $set: { status: 'failed', error: String(error.message).slice(0, 200), updatedAt: new Date() } });
      results.push({ sourceId: String(job.sourceId), status: 'failed', error: String(error.message).slice(0, 200) });
    }
  }
  return { results };
}
