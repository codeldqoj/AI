import { createHash } from 'node:crypto';
import { embeddingConfig, embedText } from './rag-embedding.js';

// Cache only the query vector. Selected sources are always searched and checked
// again, so deleting/revoking a source takes effect even on an embedding hit.
const flights = new WeakMap();
const valid = (item, config) => item?.model === config.model && item.dimensions === config.dimensions &&
  Array.isArray(item.vector) && item.vector.length === config.dimensions && item.vector.every(Number.isFinite);
export async function queryEmbedding(db, input, { embed = embedText, bypass = false } = {}) {
  const config = embeddingConfig();
  const key = createHash('sha256').update(JSON.stringify([config.model, config.dimensions, String(input).slice(0, 12000)])).digest('hex');
  const collection = db.collection('rag_query_embeddings');
  if (!bypass) {
    try {
      const cached = await collection.findOne({ _id: key, expiresAt: { $gt: new Date() } });
      if (valid(cached, config)) return { ...cached, tokens: 0, estimatedUsd: 0, cache: 'hit' };
    } catch { /* Cache availability must not prevent retrieval. */ }
  }
  let pending = flights.get(db);
  if (!pending) { pending = new Map(); flights.set(db, pending); }
  if (!bypass && pending.has(key)) {
    const shared = await pending.get(key);
    return { ...shared, tokens: 0, estimatedUsd: 0, cache: 'shared' };
  }
  const task = (async () => {
    const result = await embed(input);
    if (!valid(result, config)) throw new Error('RAG_EMBEDDING_INVALID');
    let cache = bypass ? 'bypass' : 'miss';
    if (!bypass) {
      try {
        await collection.updateOne({ _id: key }, { $set: { model: result.model, dimensions: result.dimensions,
          vector: result.vector, expiresAt: new Date(Date.now() + 86400_000) } }, { upsert: true });
      } catch { cache = 'unavailable'; }
    }
    return { ...result, cache };
  })();
  if (!bypass) pending.set(key, task);
  try { return await task; } finally { if (!bypass) pending.delete(key); }
}
