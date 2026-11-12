import { TREND_TOPICS } from './exam-trends.js';
import { trendTheorySources } from './trend-theory-sources.js';

const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const fields = ['introduction', 'techniques', 'workedExample', 'pitfalls', 'furtherConnections', 'selfCheck'];
export function cleanTrendTheory(payload) {
  const topic = clean(payload?.topic, 120);
  const method = clean(payload?.method, 240);
  if (!TREND_TOPICS.includes(topic) || method.length < 5) return null;
  const allowed = new Set(trendTheorySources(topic).map(item => item.id));
  const theory = {};
  for (const field of fields) theory[field] = clean(payload?.theory?.[field], 30000);
  if (!theory.introduction || !theory.workedExample) return null;
  for (const kind of ['definitions', 'theorems']) {
    const input = payload?.theory?.[kind];
    if (!Array.isArray(input) || input.length > 12) return null;
    theory[kind] = input.map(item => ({
      name: clean(item?.name, 240), statement: clean(item?.statement, 12000),
      assumptions: clean(item?.assumptions, 8000), proof: clean(item?.proof, 30000),
      application: clean(item?.application, 8000),
      sourceIds: [...new Set((Array.isArray(item?.sourceIds) ? item.sourceIds : []).filter(id => allowed.has(id)))],
      sourceScope: clean(item?.sourceScope, 2000)
    }));
    if (theory[kind].some(item => !item.name || !item.statement || !item.proof)) return null;
  }
  if (!theory.theorems.length) return null;
  return { topic, method, theory, sources: trendTheorySources(topic) };
}
