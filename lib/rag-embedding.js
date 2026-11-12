export function embeddingConfig() {
  const model = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small';
  const maximum = model === 'text-embedding-3-large' ? 3072 : 1536;
  return { model, dimensions: Math.floor(Math.max(256, Math.min(maximum, Number(process.env.RAG_EMBEDDING_DIMENSIONS) || 1536))) };
}
export async function embedText(input, fetcher = fetch) {
  const config = embeddingConfig();
  if (!process.env.OPENAI_API_KEY) throw new Error('RAG_EMBEDDING_NOT_CONFIGURED');
  const response = await fetcher('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, input: String(input).slice(0, 12000), encoding_format: 'float' }),
    signal: AbortSignal.timeout(8000)
  });
  const data = await response.json();
  const vector = data.data?.[0]?.embedding;
  if (!response.ok || !Array.isArray(vector) || vector.length !== config.dimensions || vector.some(value => !Number.isFinite(value))) {
    throw new Error(`RAG_EMBEDDING_HTTP_${response.status}`);
  }
  const tokens = Number(data.usage?.total_tokens) || 0;
  const rawPrice = process.env.RAG_EMBEDDING_USD_PER_MILLION;
  // Standard API list-price estimate checked 2026-10-01. Custom models or
  // contracted prices require the explicit override; this is not a billing total.
  const price = rawPrice?.trim() ? Number(rawPrice) : (config.model === 'text-embedding-3-small' ? 0.02 : NaN);
  return { ...config, vector, tokens, estimatedUsd: Number.isFinite(price) && price >= 0 ? tokens * price / 1e6 : null,
    priceSource: rawPrice?.trim() ? 'environment' : (config.model === 'text-embedding-3-small' ? 'openai-standard-2026-10-01' : 'unconfigured') };
}
