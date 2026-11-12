import {
  matchesProvinceHistory, normalizeProvinceName, provinceHistoryContext
} from './province-mergers.js';

const schoolYear = /^20\d{2}-20\d{2}$/;

// A verifier response must cover every exact question; a missing check is a rejection.
export function approvedPrediction(review, questions) {
  return review?.approved === true && Number.isFinite(review.score) && review.score >= 4.5 && review.score <= 5 &&
    review.structureCorrect === true && review.allProblemsWellPosed === true &&
    review.mathematicalConsistency === true && review.originalEnough === true &&
    review.topicAndScoresMatch === true && Array.isArray(review.criticalIssues) &&
    review.criticalIssues.length === 0 && Array.isArray(review.questionChecks) &&
    review.questionChecks.length === questions.length &&
    questions.every((question, index) => review.questionChecks[index]?.questionNumber === question.questionNumber &&
      review.questionChecks[index]?.valid === true);
}

export function predictionQuestionReviews(review, questions) {
  const checks = Array.isArray(review?.questionChecks) ? review.questionChecks : [];
  const issues = Array.isArray(review?.criticalIssues) ? review.criticalIssues.filter(value => typeof value === 'string') : [];
  const complete = checks.length === questions.length && questions.every((question, index) =>
    checks[index]?.questionNumber === question.questionNumber);
  const globalFailure = !complete || review?.structureCorrect !== true || review?.topicAndScoresMatch !== true ||
    review?.mathematicalConsistency !== true || review?.originalEnough !== true ||
    review?.allProblemsWellPosed !== true && !checks.some(check => check?.valid === false);
  const unassigned = issues.filter(issue => ![...issue.matchAll(/(?:câu|bài)\s*0*(\d{1,2})\b/gi)]
    .some(match => questions.some(question => question.questionNumber === Number(match[1]))));
  const allApproved = approvedPrediction(review, questions);
  return questions.map((question, index) => {
    const matched = issues.filter(issue => [...issue.matchAll(/(?:câu|bài)\s*0*(\d{1,2})\b/gi)]
      .some(match => Number(match[1]) === question.questionNumber));
    const notes = [...matched, ...unassigned];
    const check = complete ? checks[index] : null;
    const approved = allApproved || (!globalFailure && check?.valid === true && notes.length === 0 &&
      // An unexplained overall rejection cannot certify any individual question.
      (issues.length > 0 || checks.some(item => item.valid === false)));
    return { questionNumber: question.questionNumber, approved, reason: check?.reason || '', issues: notes };
  });
}

export function predictionSettings(input = {}) {
  const type = input.targetType === 'vmo' ? 'vmo' : input.targetType === 'tst' ? 'tst' : '';
  const year = String(input.year || '').trim();
  const start = Number(year.slice(0, 4));
  const lookback = Number(input.lookback);
  const dayNumber = Number(input.dayNumber);
  const anchor = type === 'tst' ? String(input.targetAnchor || '') : 'vmo-official';
  if (!type || !schoolYear.test(year) || Number(year.slice(5)) !== start + 1 || start < 2026 || start > 2040 ||
      !Number.isInteger(lookback) || lookback < 1 || lookback > 15 ||
      ![1, 2].includes(dayNumber) ||
      (type === 'tst' && !/^tst-[a-z0-9-]{2,80}$/.test(anchor))) {
    throw new Error('Loại đề, đơn vị, năm học, ngày thi hoặc số năm tham chiếu không hợp lệ.');
  }
  return { type, year, start, lookback, dayNumber, anchor };
}

export function selectPredictionEvidence(settings, databaseExams = []) {
  const entries = databaseExams
    .filter(item => item?.year && Array.isArray(item.problems) && item.problems.length && item.origin !== 'prediction');
  // MongoDB is authoritative for a year/anchor/day already present in the static archive.
  const unique = new Map();
  entries.forEach(item => unique.set(`${item.category}:${item.anchor}:${item.year}:${item.dayNumber || 0}`, item));
  const all = Array.from(unique.values());
  const historyContext = settings.type === 'tst'
    ? provinceHistoryContext(settings.province, settings.anchor)
    : { currentProvince: 'VMO', members: [], merged: false };
  const own = item => settings.type === 'vmo'
    ? item.category === 'vmo'
    : ['tst', 'regional'].includes(item.category) &&
      matchesProvinceHistory(item, settings.province, settings.anchor);
  const ownPast = all.filter(item => own(item) && Number(item.year.slice(0, 4)) >= settings.start - settings.lookback && Number(item.year.slice(0, 4)) < settings.start)
    .sort((a, b) => b.year.localeCompare(a.year));
  const trendYear = settings.start - 1;
  const peer = settings.type === 'tst' ? all.filter(item => item.category === 'tst' && !own(item) && Number(item.year.slice(0, 4)) === trendYear) : [];
  const years = [...new Set(ownPast.map(item => item.year))];
  const requestedYears = Array.from({ length: settings.lookback }, (_, index) =>
    `${settings.start - index - 1}-${settings.start - index}`);
  const countTopics = items => {
    const counts = new Map();
    items.flatMap(item => item.problems).forEach(problem => {
      const topic = String(problem.topic || 'Chưa phân loại').trim().slice(0, 80);
      counts.set(topic, (counts.get(topic) || 0) + 1);
    });
    return Array.from(counts, ([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, 12);
  };
  const source = item => ({
    year: item.year, unit: item.province || '', currentUnit: historyContext.currentProvince,
    title: item.title, source: item.source, topics: item.problems.map(problem => problem.topic).slice(0, 8)
  });
  const exampleExams = [];
  historyContext.members.forEach(member => {
    ownPast.filter(item => normalizeProvinceName(item.province) === normalizeProvinceName(member))
      .slice(0, 2).forEach(item => { if (!exampleExams.includes(item)) exampleExams.push(item); });
  });
  ownPast.forEach(item => { if (exampleExams.length < 6 && !exampleExams.includes(item)) exampleExams.push(item); });
  return {
    requestedYears: settings.lookback, years, missingYears: requestedYears.filter(year => !years.includes(year)),
    ownExamCount: ownPast.length,
    peerExamCount: peer.length, trendYear: `${trendYear}-${trendYear + 1}`,
    historyCurrentProvince: historyContext.currentProvince,
    historyMembers: historyContext.members,
    mergedProvinceHistory: historyContext.merged,
    ownTopics: countTopics(ownPast), peerTopics: countTopics(peer),
    sources: ownPast.slice(0, 40).map(source),
    peerSources: peer.slice(0, 12).map(source),
    // A few excerpts help the model avoid reproducing old statements verbatim.
    examples: exampleExams.slice(0, 6).flatMap(item => item.problems.slice(0, 3).map(problem =>
      ({ year: item.year, unit: item.province || '', topic: problem.topic,
        excerpt: String(problem.excerpt || '').slice(0, 260) })))
  };
}

export const examStructure = Object.freeze({
  1: [
    { questionNumber: 1, topic: 'Dãy số và giới hạn dãy số', maxScore: 5 },
    { questionNumber: 2, topic: 'Phương trình hàm', maxScore: 5 },
    { questionNumber: 3, topic: 'Số học, dãy số học', maxScore: 5 },
    { questionNumber: 4, topic: 'Hình học phẳng', maxScore: 5 }
  ],
  2: [
    { questionNumber: 5, topic: 'Đa thức', maxScore: 7 },
    { questionNumber: 6, topic: 'Hình học phẳng', maxScore: 6 },
    { questionNumber: 7, topic: 'Tổ hợp', maxScore: 7 }
  ]
});

export function predictionStructure(outline, dayNumber) {
  if (!String(outline || '').trim()) return examStructure[dayNumber];
  const lines = String(outline).trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const slots = lines.map(line => {
    const match = line.match(/^(\d{1,2})\s*\|\s*(\d+(?:\.\d{1,2})?)\s*\|\s*(.{2,120})$/);
    if (!match) throw new Error('Cấu trúc từng câu phải có dạng: số câu | điểm | chuyên đề.');
    return { questionNumber: Number(match[1]), maxScore: Number(match[2]), topic: match[3].trim() };
  });
  const unique = new Set(slots.map(slot => slot.questionNumber));
  if (slots.length < 2 || slots.length > 6 || unique.size !== slots.length ||
      slots.some(slot => slot.questionNumber < 1 || slot.maxScore <= 0 || slot.maxScore > 10) ||
      Math.abs(slots.reduce((total, slot) => total + slot.maxScore, 0) - 20) > 0.001) {
    throw new Error('Cấu trúc cần 2–6 câu khác số, mỗi câu tối đa 10 điểm và tổng đúng 20 điểm.');
  }
  return slots;
}
