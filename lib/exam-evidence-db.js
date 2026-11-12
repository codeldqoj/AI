// A bounded, reproducible view of published Atlas exams for AI analysis.
const MAX_EXAMS = 500;
const MAX_PROBLEMS = 4000;

export async function loadExamEvidence(db, { years, categories = ['tst-national', 'vmo-official'] } = {}) {
  const filter = { category: { $in: categories }, status: 'published', origin: { $ne: 'prediction' } };
  // Migrated regional exams use an en dash, while OCR exams use a hyphen.
  if (years) filter.year = { $in: years.flatMap(year => [year, year.replace('-', '–'), year.replace('-', '—')]) };
  const exams = await db.collection('exams').find(filter, { projection: {
    _id: 1, year: 1, province: 1, title: 1, targetAnchor: 1, category: 1, dayNumber: 1, origin: 1
  } }).sort({ year: 1, category: 1, province: 1, dayNumber: 1, _id: 1 }).limit(MAX_EXAMS + 1).toArray();
  if (exams.length > MAX_EXAMS) throw new Error('EXAM_EVIDENCE_LIMIT');
  if (!exams.length) return [];

  const ids = exams.flatMap(exam => [exam._id, String(exam._id)]);
  const problems = await db.collection('problems').find({
    examId: { $in: ids }, status: 'published'
  }, { projection: { examId: 1, topic: 1, content: 1, questionNumber: 1, _id: 1 } })
    .sort({ examId: 1, questionNumber: 1, _id: 1 }).limit(MAX_PROBLEMS + 1).toArray();
  if (problems.length > MAX_PROBLEMS) throw new Error('EXAM_EVIDENCE_LIMIT');
  const grouped = new Map();
  for (const problem of problems) {
    const key = String(problem.examId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      number: Number(problem.questionNumber) || grouped.get(key).length + 1,
      topic: problem.topic,
      excerpt: String(problem.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 900)
    });
  }
  return exams.map(exam => ({
    category: { 'tst-national': 'tst', 'vmo-official': 'vmo', 'history-dn-qn': 'regional',
      'imo-olympic': 'olympic' }[exam.category],
    anchor: exam.targetAnchor || `mongo-${exam._id}`, province: exam.province,
    year: String(exam.year || '').replace(/[–—]/g, '-'), dayNumber: exam.dayNumber, title: exam.title, origin: exam.origin,
    source: `Kho đề · ${exam.title || exam._id}`,
    problems: grouped.get(String(exam._id)) || []
  })).filter(exam => exam.problems.length);
}
