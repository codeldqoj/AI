import { performance } from 'node:perf_hooks';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
import { fixtures, cases, FakeDb, embedStub } from '../test/fixtures/rag-fixtures.mjs';
const runs = { baseline: [], rag: [] };
for (const test of cases()) {
  const data = fixtures(); test.mutate?.(data);
  for (const mode of ['baseline', 'rag']) {
    const started = performance.now();
    let ids;
    if (mode === 'baseline') ids = data.submissions.filter(item => item.problemKey === test.key && item.adminVerified).slice(0, 1).map(item => item.problemKey);
    else ids = (await retrieveVerifiedContext({ problemRef: test.key, statement: '', session: { role: 'admin' } },
      { db: new FakeDb(data), embed: embedStub })).sources.map(item => item.problemKey);
    const elapsedMs = performance.now() - started;
    const truePositives = ids.filter(id => test.expected.includes(id)).length;
    runs[mode].push({ name: test.name, ids, expected: test.expected, truePositives, elapsedMs });
  }
}
const percentile = (items, p) => items.sort((a,b) => a-b)[Math.ceil(items.length * p) - 1];
const summary = Object.fromEntries(Object.entries(runs).map(([mode, values]) => {
  const hits = values.reduce((sum, item) => sum + item.truePositives, 0);
  const relevant = values.reduce((sum, item) => sum + item.expected.length, 0);
  const selected = values.reduce((sum, item) => sum + item.ids.length, 0);
  return [mode, { recallAt3: relevant ? hits/relevant : null, precision: selected ? hits/selected : null,
    safetyPasses: values.filter(item => !item.expected.length && !item.ids.length).length,
    p50Ms: percentile(values.map(item => item.elapsedMs), .5), p95Ms: percentile(values.map(item => item.elapsedMs), .95) }];
}));
console.log(JSON.stringify({ environment: 'OFFLINE MOCK; no Atlas, no real embedding, no LLM grading',
  fixtureCount: cases().length, costUsd: null, costNote: 'No provider calls; production cost not measured', summary, cases: runs }, null, 2));
