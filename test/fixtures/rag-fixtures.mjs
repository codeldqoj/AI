import { ObjectId } from 'mongodb';
import { contentHash, mathTags, topicOf, constraints, RAG_VERSION, EMBEDDING_VERSION } from '../../lib/rag-core.js';
const same = (a, b) => String(a) === String(b);
function matches(row, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part));
    const actual = key.split('.').reduce((item, path) => item?.[path], row);
    if (value instanceof ObjectId || value instanceof Date) return same(actual, value);
    if (value && typeof value === 'object') return Object.entries(value).every(([operator, operand]) => {
      if (operator === '$in') return (Array.isArray(actual) ? actual : [actual]).some(item => operand.some(candidate => same(item, candidate)));
      if (operator === '$exists') return (actual !== undefined) === operand;
      if (operator === '$ne') return !same(actual, operand);
      if (operator === '$lt') return actual < operand;
      if (operator === '$gt') return actual > operand;
      if (operator === '$type') return typeof actual === operand;
      throw new Error(`Unknown mock operator ${operator}`);
    });
    return same(actual, value);
  });
}
class Cursor {
  constructor(rows) { this.rows = rows.slice(); }
  sort(sort) { this.rows.sort((a,b) => { for (const [key, direction] of Object.entries(sort)) { if(a[key] > b[key]) return direction; if(a[key] < b[key]) return -direction; } return 0; }); return this; }
  limit(limit) { this.rows = this.rows.slice(0, limit); return this; }
  async toArray() { return this.rows; }
}
export class FakeDb {
  constructor(data) { this.data = data; }
  collection(name) {
    const rows = this.data[name] ||= [];
    return {
      find: filter => new Cursor(rows.filter(row => matches(row, filter))),
      findOne: async filter => rows.find(row => matches(row, filter)) || null,
      updateOne: async (filter, update, options = {}) => {
        let row = rows.find(row => matches(row, filter));
        if (!row && options.upsert) { row = { _id: new ObjectId(), ...filter, ...update.$setOnInsert }; rows.push(row); }
        if (!row) return { matchedCount: 0 };
        Object.assign(row, update.$set);
        for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
        return { matchedCount: 1 };
      },
      findOneAndUpdate: async (filter, update) => {
        const row = rows.find(row => matches(row, filter));
        if (!row) return null;
        Object.assign(row, update.$set);
        for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
        return row;
      },
      createIndex: async () => 'mock_index',
      listSearchIndexes: () => new Cursor(this.data.searchIndexes || []),
      createSearchIndex: async value => { (this.data.searchIndexes ||= []).push({ ...value, latestDefinition: value.definition }); return value.name; },
      updateSearchIndex: async (name, definition) => { const index = this.data.searchIndexes.find(item => item.name === name); index.latestDefinition = definition; },
      insertOne: async value => { rows.push(value); return { insertedId: value._id }; },
      aggregate: pipeline => {
        const search = pipeline[0].$search;
        const vector = pipeline[0].$vectorSearch;
        const filter = vector?.filter || Object.fromEntries((search?.compound?.filter || []).map(item => [item.equals.path, item.equals.value]));
        return new Cursor(rows.filter(row => matches(row, filter)));
      }
    };
  }
}
// The mock search returns deterministic candidate lists. This measures retrieval
// orchestration/safety only, never the quality of a real embedding model.
const id = n => new ObjectId(n.toString(16).padStart(24, '0'));
export const embedStub = async () => ({ vector: Array(1536).fill(0.01), model: 'text-embedding-3-small', dimensions: 1536, tokens: 8, estimatedUsd: null });
export function fixtures() {
  const problems = [
    { _id: id(1), contentKey: 'p1', content: 'Cho tam giác nhọn ABC. Xét đường tròn và trực tâm H.', topic: 'Hình học' },
    { _id: id(2), contentKey: 'p2', content: 'Cho tam giác ABC. Xét đường tròn và trực tâm H.', topic: 'Hình học' },
    { _id: id(3), contentKey: 'p3', content: 'Phương trình hàm Cauchy trên số thực.', topic: 'Phương trình hàm' },
    { _id: id(4), contentKey: 'p4', content: 'Phương trình hàm Cauchy cho hàm trên số thực.', topic: 'Phương trình hàm' },
    { _id: id(5), contentKey: 'p5', content: 'Tính a_{2727}.', topic: 'Dãy số' }
  ].map(item => ({ ...item, status: 'published' }));
  const submissions = [problems[0], problems[2], problems[4]].map((problem, index) => ({
    _id: id(100 + index), problemId: String(problem._id), problemKey: problem.contentKey,
    solutionContent: `Lời giải nguồn ${index + 1}. Phương pháp khác vẫn được chấp nhận nếu đúng.`,
    problemSnapshot: { content: problem.content }, adminVerified: true, adminVerifiedAt: '2026-09-30T00:00:00Z'
  }));
  const knowledge = submissions.map(submission => {
    const problem = problems.find(item => item.contentKey === submission.problemKey);
    return { _id: id(200 + Number(String(submission._id).slice(-2),16)), sourceId: submission._id,
      source: 'admin_verified', status: 'active', problemId: problem._id, problemKey: problem.contentKey,
      problemContentHash: contentHash(problem.content), solutionContentHash: contentHash(submission.solutionContent),
      verifiedAt: submission.adminVerifiedAt, topic: topicOf(problem.topic), mathTags: mathTags(problem.content),
      constraints: constraints(problem.content), embeddingModel: 'text-embedding-3-small', embeddingVersion: EMBEDDING_VERSION, metadataVersion: RAG_VERSION,
      embeddingDimensions: 1536, embedding: Array(1536).fill(0.01) };
  });
  return { problems, submissions, verified_knowledge: knowledge };
}
export function cases() {
  return [
    { name: 'exact', key: 'p1', expected: ['p1'] },
    { name: 'similar', key: 'p4', expected: ['p3'] },
    { name: 'different-hypothesis', key: 'p2', expected: [] },
    { name: 'changed-statement', key: 'p5', expected: [], mutate: data => { data.problems[4].content = 'Tính a_{27^{27}}.'; } },
    { name: 'revoked', key: 'p4', expected: [], mutate: data => { data.submissions[1].adminVerified = false; } },
    { name: 'deleted', key: 'p4', expected: [], mutate: data => { data.submissions.splice(1, 1); } },
    { name: 'changed-solution', key: 'p4', expected: [], mutate: data => { data.submissions[1].solutionContent = 'Lời giải đã sửa chưa được xác minh lại.'; } },
    { name: 'changed-topic', key: 'p4', expected: [], mutate: data => { data.problems[2].topic = 'Hình học'; } },
    { name: 'private-source', key: 'p4', expected: [], mutate: data => { data.problems[2].status = 'draft'; } }
  ];
}
