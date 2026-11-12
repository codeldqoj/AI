// Run the same bounded service as the Admin UI, using local environment credentials.
import fs from 'node:fs/promises';
import { getDb } from '../lib/db.js';
import { runBenchmarkCase, benchmarkMetrics } from '../lib/rag-benchmark.js';
const path = process.argv[2];
if (!path) { console.error('Usage: node scripts/rag-benchmark-live.mjs labelled-cases.json [--bypass-cache]'); process.exit(1); }
try {
  const cases = JSON.parse(await fs.readFile(path, 'utf8'));
  if (!Array.isArray(cases) || !cases.length || cases.length > 100) throw Error('Expected 1–100 cases');
  const db = await getDb();
  const observations = [];
  for (const [index, test] of cases.entries()) {
    const report = await runBenchmarkCase(db, { ...test, ragFirst: index % 2 === 1,
      bypassEmbeddingCache: process.argv.includes('--bypass-cache') }, { role: 'admin', username: 'rag-benchmark-cli' });
    observations.push(...report.observations);
  }
  console.log(JSON.stringify({ environment: 'LIVE ATLAS RETRIEVAL; excludes AI solver/grader cost and latency',
    caseCount: cases.length, metrics: benchmarkMetrics(observations), observations }, null, 2));
  process.exit(0);
} catch(error) { console.error(error.message); process.exit(1); }
