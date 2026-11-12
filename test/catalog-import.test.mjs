import assert from 'node:assert/strict';
import { importCatalogExam } from '../lib/catalog-import.js';

class Collection {
  constructor(key) { this.key = key; this.items = []; this.nextId = 1; }
  async findOne(filter) { return this.items.find(item => Object.entries(filter).every(([key, value]) => item[key] === value)) || null; }
  find(filter) {
    const keys = filter.contentKey.$in;
    return { toArray: async () => this.items.filter(item => keys.includes(item.contentKey)) };
  }
  async findOneAndUpdate(filter, update) {
    let item = await this.findOne(filter);
    if (!item) {
      item = { _id: `id-${this.nextId++}`, ...update.$setOnInsert };
      this.items.push(item);
    }
    Object.assign(item, update.$set);
    return item;
  }
  async bulkWrite(operations) {
    for (const { updateOne } of operations) {
      let item = await this.findOne(updateOne.filter);
      if (!item) {
        item = { _id: `id-${this.nextId++}`, ...updateOne.update.$setOnInsert };
        this.items.push(item);
      }
      Object.assign(item, updateOne.update.$set);
    }
  }
}

const collections = new Map();
const db = { collection(name) {
  if (!collections.has(name)) collections.set(name, new Collection(name));
  return collections.get(name);
} };
const now = new Date('2026-01-01T00:00:00.000Z');
const exam = {
  examKey: 'mock-2026-01', category: 'vmo-mock', targetAnchor: 'mock',
  title: 'Mock exam 2026', year: '2026', status: 'draft', dayNumber: 1,
  problems: [
    { contentKey: 'mock-2026-01-q1', questionNumber: 1, content: '<p>Find x.</p>',
      referenceSolution: '<p>x = 2</p>', referenceSolutionVerified: true },
    { contentKey: 'mock-2026-01-q2', questionNumber: 2, content: '<p>Prove the claim.</p>',
      referenceSolution: '<p>Proof</p>', referenceSolutionVerified: false,
      generatedGuide: {
        success: true, model: 'gemini+openai', providers: { solver: 'google', verifier: 'openai' },
        generatedAt: now.toISOString(),
        guide: {
          solution: '<p>Proof</p>',
          quality: { verified: true, score: '5.0/5.0', summary: 'Automated review passed.' }
        }
      }
    }
  ]
};

const result = await importCatalogExam(db, { exam }, 'admin-user', now);
assert.deepEqual(
  { examKey: result.examKey, problemCount: result.problemCount, verified: result.verifiedSolutionCount, status: result.status },
  { examKey: 'mock-2026-01', problemCount: 2, verified: 1, status: 'draft' }
);
const storedProblems = db.collection('problems').items;
assert.equal(storedProblems[0].referenceSolution, '<p>x = 2</p>');
assert.equal(storedProblems[0].referenceSolutionVerified, true);
assert.equal(storedProblems[0].status, 'draft');
assert.equal(storedProblems[1].referenceSolutionVerified, false);
assert.equal(storedProblems[1].referenceSolutionOrigin, 'vmo-ai-guide');
assert.equal(storedProblems[1].referenceSolutionReview.automatedReviewPassed, true);
assert.equal(storedProblems.some(problem => 'userId' in problem), false);

await importCatalogExam(db, { exam }, 'admin-user', now);
assert.equal(db.collection('exams').items.length, 1);
assert.equal(db.collection('content_sets').items.length, 1);
assert.equal(db.collection('problems').items.length, 2);

const conflictingExam = {
  ...exam, examKey: 'another-exam',
  problems: [{ ...exam.problems[0], contentKey: 'mock-2026-01-q1' }]
};
await assert.rejects(importCatalogExam(db, { exam: conflictingExam }, 'admin-user', now), { status: 409 });

await assert.rejects(importCatalogExam(db, {
  exam: { ...exam, category: 'untrusted-category' }
}, 'admin-user', now), { status: 400 });

const legacyCollections = new Map();
const legacyDb = { collection(name) {
  if (!legacyCollections.has(name)) legacyCollections.set(name, new Collection(name));
  return legacyCollections.get(name);
} };
legacyDb.collection('exams').items.push({
  _id: 'legacy-exam', examKey: exam.examKey, category: exam.category,
  targetAnchor: exam.targetAnchor, title: exam.title
});
legacyDb.collection('content_sets').items.push({
  _id: 'legacy-set', key: exam.examKey, group: 'mock_exam', title: exam.title, origin: 'ocr'
});
legacyDb.collection('problems').items.push({
  _id: 'legacy-question', contentKey: 'mock-2026-01-q5', examKey: exam.examKey,
  examId: 'legacy-exam', content: 'Keep existing content'
});
await importCatalogExam(legacyDb, { exam }, 'admin-user', now);
assert.equal(legacyDb.collection('problems').items.length, 3);
assert.equal(legacyDb.collection('problems').items.find(problem => problem.contentKey === 'mock-2026-01-q5').content,
  'Keep existing content');

const emptyExam = {
  examKey: 'tst-empty-2026', category: 'tst-national', targetAnchor: 'tst-empty',
  title: 'Exam without questions yet', year: '2026-2027', problems: []
};
const emptyResult = await importCatalogExam(db, { exam: emptyExam }, 'admin-user', now);
assert.equal(emptyResult.problemCount, 0);
assert.equal(db.collection('exams').items.length, 2);

console.log('catalog import tests passed');
