import {
  currentProvinceName, matchesProvinceHistory, provinceHistoryContext
} from './province-mergers.js';

export const TREND_TOPICS = Object.freeze([
  'Dãy số và Giới hạn dãy số',
  'Phương trình hàm',
  'Số học và dãy số',
  'Hình học phẳng',
  'Đa thức',
  'Tổ hợp'
]);

// Rotate buckets so recent years and all six topics can be represented in a bounded AI prompt.
export function balancedEvidenceSample(samples = [], limit = 96, bucket = sample => `${sample.year}:${sample.criterion}`) {
  const buckets = new Map();
  for (const sample of samples) {
    const key = bucket(sample);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(sample);
  }
  const output = [];
  while (output.length < limit && buckets.size) {
    for (const [key, items] of buckets) {
      output.push(items.shift());
      if (!items.length) buckets.delete(key);
      if (output.length === limit) break;
    }
  }
  return output;
}

const schoolYear = /^20\d{2}-20\d{2}$/;
const normalized = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

export function trendAnalysisSettings(input = {}) {
  const mode = input.mode === 'year' ? 'year' : input.mode === 'target' ? 'target' : '';
  const year = String(input.year || '').trim();
  const start = Number(year.slice(0, 4));
  if (!mode || !schoolYear.test(year) || Number(year.slice(5)) !== start + 1 || start < 2015 || start > 2040) {
    throw new Error('Phạm vi hoặc năm học phân tích không hợp lệ.');
  }
  if (mode === 'year') return { mode, year, start, targetType: 'tst', lookback: 0, anchor: '', province: '' };

  const targetType = input.targetType === 'vmo' ? 'vmo' : input.targetType === 'tst' ? 'tst' : '';
  const lookback = Number(input.lookback);
  const anchor = targetType === 'vmo' ? 'vmo-official' : String(input.targetAnchor || '').trim();
  const province = String(input.province || '').trim().slice(0, 120);
  if (!targetType || !Number.isInteger(lookback) || lookback < 1 || lookback > 15 ||
      (targetType === 'tst' && (!/^tst-[a-z0-9-]{2,80}$/.test(anchor) || !province))) {
    throw new Error('Loại đề, đơn vị hoặc số năm dữ liệu tham chiếu không hợp lệ.');
  }
  return { mode, year, start, targetType, lookback, anchor, province,
    includeCurrentYear: input.includeCurrentYear === true };
}

export function classifyTrendTopic(topic) {
  const value = normalized(topic);
  if (/phuong trinh ham/.test(value)) return TREND_TOPICS[1];
  if (/da thuc/.test(value)) return TREND_TOPICS[4];
  if (/hinh hoc|hinh phang|duong tron|tam giac|tu giac/.test(value)) return TREND_TOPICS[3];
  if (/to hop|tro choi|do thi|to mau|bang o|cuc tri|xau nhi phan/.test(value)) return TREND_TOPICS[5];
  // Nhãn có "Số học" được ưu tiên vào nhóm số học, kể cả bài có dãy số nguyên.
  if (/so hoc|dong du|so nguyen|nguyen to|chia het|diophant/.test(value)) return TREND_TOPICS[2];
  if (/day so|gioi han|truy hoi|hoi tu/.test(value)) return TREND_TOPICS[0];
  return '';
}

function isOwnTarget(item, settings) {
  if (settings.targetType === 'vmo') return item.category === 'vmo';
  return ['tst', 'regional'].includes(item.category) &&
    matchesProvinceHistory(item, settings.province, settings.anchor);
}

function sourceKey(item) {
  return `${item.category}:${item.anchor || normalized(item.province)}:${item.year}:${item.dayNumber || 0}`;
}

function uniqueSourceExams(items = []) {
  const unique = new Map();
  items
    .filter(item => item?.year && Array.isArray(item.problems) && item.problems.length && item.origin !== 'prediction')
    .forEach(item => unique.set(sourceKey(item), item));
  return Array.from(unique.values());
}

function evidenceSample(exam, problem, index, unit = exam.province || '') {
  const criterion = classifyTrendTopic(problem.topic);
  return {
    sourceId: `${exam.anchor || normalized(exam.province)}:${exam.year}:${exam.dayNumber || 0}:${problem.number || index + 1}`,
    year: exam.year,
    unit: String(unit).slice(0, 120),
    historicalUnit: String(exam.province || '').slice(0, 120),
    title: String(exam.title || '').slice(0, 240),
    questionNumber: Number(problem.number || problem.questionNumber || index + 1),
    rawTopic: String(problem.topic || 'Chưa phân loại').slice(0, 120),
    criterion: criterion || 'Ngoài 6 tiêu chí',
    excerpt: String(problem.excerpt || problem.content || '').replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 600)
  };
}

// Kho luyện tập độc lập với phạm vi thống kê và bao gồm cả bốn kho đề.
export function selectTrendPracticeEvidence(databaseExams = []) {
  const exams = uniqueSourceExams(databaseExams)
    .filter(item => ['tst', 'regional', 'vmo', 'olympic'].includes(item.category));
  const samples = exams.flatMap(exam => exam.problems.map((problem, index) =>
    evidenceSample(exam, problem, index, currentProvinceName(exam.province || exam.anchor))));
  return {
    examCount: exams.length,
    questionCount: samples.length,
    tstQuestionCount: exams.filter(item => item.category === 'tst').reduce((sum, exam) => sum + exam.problems.length, 0),
    historyQuestionCount: exams.filter(item => item.category === 'regional').reduce((sum, exam) => sum + exam.problems.length, 0),
    vmoQuestionCount: exams.filter(item => item.category === 'vmo').reduce((sum, exam) => sum + exam.problems.length, 0),
    olympicQuestionCount: exams.filter(item => item.category === 'olympic').reduce((sum, exam) => sum + exam.problems.length, 0),
    samples
  };
}

export function selectTrendEvidence(settings, databaseExams = []) {
  const all = uniqueSourceExams(databaseExams);
  const selected = settings.mode === 'year'
    ? all.filter(item => item.category === 'tst' && item.year === settings.year)
    : all.filter(item => isOwnTarget(item, settings) &&
      Number(item.year.slice(0, 4)) >= settings.start - settings.lookback &&
      Number(item.year.slice(0, 4)) < settings.start + (settings.includeCurrentYear ? 1 : 0));

  const historyContext = settings.mode === 'target' && settings.targetType === 'tst'
    ? provinceHistoryContext(settings.province, settings.anchor)
    : null;
  const evidenceUnit = exam => settings.targetType === 'vmo'
    ? 'VMO'
    : settings.mode === 'target'
      ? historyContext.currentProvince
      : currentProvinceName(exam.province || exam.anchor);

  selected.sort((a, b) => b.year.localeCompare(a.year) || String(a.province).localeCompare(String(b.province), 'vi'));
  const counts = new Map(TREND_TOPICS.map(topic => [topic, 0]));
  const labels = new Map(TREND_TOPICS.map(topic => [topic, new Map()]));
  let otherQuestionCount = 0;
  const allSamples = [];
  selected.forEach(exam => {
    exam.problems.forEach((problem, index) => {
      const category = classifyTrendTopic(problem.topic);
      if (category) {
        counts.set(category, counts.get(category) + 1);
        const raw = String(problem.topic || category).trim().slice(0, 120);
        labels.get(category).set(raw, (labels.get(category).get(raw) || 0) + 1);
      } else otherQuestionCount += 1;
      allSamples.push(evidenceSample(exam, problem, index, evidenceUnit(exam)));
    });
  });
  const questionCount = selected.reduce((total, exam) => total + exam.problems.length, 0);
  const years = [...new Set(selected.map(item => item.year))].sort().reverse();
  const expectedYears = settings.mode === 'target'
    ? [...(settings.includeCurrentYear ? [settings.year] : []),
      ...Array.from({ length: settings.lookback }, (_, index) => `${settings.start - index - 1}-${settings.start - index}`)]
    : [settings.year];
  const yearCounts = years.map(year => ({ year, examCount: selected.filter(item => item.year === year).length,
    questionCount: selected.filter(item => item.year === year).reduce((sum, exam) => sum + exam.problems.length, 0) }));
  const topicStats = TREND_TOPICS.map(topic => ({
    topic,
    questionCount: counts.get(topic),
    prevalencePercent: questionCount ? Number((counts.get(topic) * 100 / questionCount).toFixed(1)) : 0,
    rawLabels: Array.from(labels.get(topic), ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi')).slice(0, 12)
  }));
  return {
    mode: settings.mode, year: settings.year, requestedYears: settings.lookback,
    years, missingYears: expectedYears.filter(year => !years.includes(year)), yearCounts,
    examCount: selected.length, questionCount, otherQuestionCount,
    unitCount: new Set(selected.map(item => normalized(evidenceUnit(item)))).size,
    historyCurrentProvince: historyContext?.currentProvince || '',
    historyMembers: historyContext?.members || [],
    mergedProvinceHistory: historyContext?.merged || false,
    topicStats,
    sources: selected.slice(0, 80).map(item => ({
      year: item.year, unit: evidenceUnit(item), historicalUnit: item.province || '',
      title: item.title, source: item.source, questionCount: item.problems.length
    })),
    samples: allSamples
  };
}

export function normalizeTrendReport(report, evidence, practiceEvidence = evidence) {
  const validEvidenceIds = new Set((evidence.samples || []).map(item => item.sourceId));
  const validPracticeIds = new Set((practiceEvidence.samples || []).map(item => item.sourceId));
  const normalizeEvidenceIds = (value, limit = 4000, allowedIds = validEvidenceIds) => [...new Set((Array.isArray(value) ? value : [])
    .map(item => String(item || '').trim().slice(0, 180))
    .filter(item => item && allowedIds.has(item)))].slice(0, limit);
  const supplied = new Map((Array.isArray(report?.topicTrends) ? report.topicTrends : [])
    .map(item => [String(item?.topic || ''), item]));
  const practiceById = new Map((practiceEvidence.samples || []).map(sample => [sample.sourceId, sample]));
  const topicTrends = evidence.topicStats.map(stat => {
    const item = supplied.get(stat.topic) || {};
    const topicEvidenceIds = new Set((evidence.samples || [])
      .filter(sample => sample.criterion === stat.topic).map(sample => sample.sourceId));
    const topicPracticeIds = new Set((practiceEvidence.samples || [])
      .filter(sample => sample.criterion === stat.topic).map(sample => sample.sourceId));
    const methods = (Array.isArray(item.frequentMethods) ? item.frequentMethods : []).slice(0, 12).map(method => {
      const evidenceIds = normalizeEvidenceIds(method?.evidenceIds, 240, topicEvidenceIds);
      const citedPracticeIds = normalizeEvidenceIds(method?.practiceEvidenceIds, 400,
        topicPracticeIds.size ? topicPracticeIds : validPracticeIds);
      // AI chỉ đọc mẫu. Mở rộng các mã đã dẫn tới mọi câu có cùng nhãn
      // chuyên đề chi tiết trong Atlas; không tự đoán nội dung ngoài nhãn.
      const citedLabels = new Set(citedPracticeIds.map(id => normalized(practiceById.get(id)?.rawTopic)).filter(Boolean));
      const practiceEvidenceIds = (practiceEvidence.samples || [])
        .filter(sample => sample.criterion === stat.topic && citedLabels.has(normalized(sample.rawTopic)))
        .map(sample => sample.sourceId);
      return {
        name: String(method?.name || '').trim().slice(0, 240),
        // Danh sách mã là nguồn chuẩn cho chế độ luyện tập; không giữ một
        // frequency lớn hơn số câu thực sự truy nguyên được.
        frequency: Math.min(stat.questionCount, evidenceIds.length),
        evidenceIds,
        practiceEvidenceIds: practiceEvidenceIds.length ? practiceEvidenceIds : citedPracticeIds,
        note: String(method?.note || '').trim().slice(0, 1600)
      };
    }).filter(method => method.name);
    return {
      topic: stat.topic,
      questionCount: stat.questionCount,
      evidenceIds: [...topicEvidenceIds],
      prevalencePercent: stat.prevalencePercent,
      trendLevel: String(item.trendLevel || (stat.questionCount ? 'Có xuất hiện' : 'Chưa ghi nhận')).slice(0, 80),
      observations: String(item.observations || '').trim().slice(0, 4000),
      frequentMethods: methods
    };
  });
  return {
    title: String(report?.title || 'Phân tích xu hướng ra đề').trim().slice(0, 300),
    executiveSummary: String(report?.executiveSummary || '').trim().slice(0, 6000),
    topicTrends,
    recurringPatterns: (Array.isArray(report?.recurringPatterns) ? report.recurringPatterns : []).slice(0, 20).map(item => {
      const evidenceIds = normalizeEvidenceIds(item?.evidenceIds);
      return {
        pattern: String(item?.pattern || '').trim().slice(0, 300),
        frequency: evidenceIds.length,
        evidenceIds,
        analysis: String(item?.analysis || '').trim().slice(0, 2400)
      };
    }).filter(item => item.pattern),
    unitInsights: (Array.isArray(report?.unitInsights) ? report.unitInsights : []).slice(0, 50).map(item => ({
      unit: String(item?.unit || '').trim().slice(0, 160),
      dominantTopics: (Array.isArray(item?.dominantTopics) ? item.dominantTopics : []).slice(0, 6)
        .map(value => String(value || '').slice(0, 160)),
      note: String(item?.note || '').trim().slice(0, 2000)
    })).filter(item => item.unit),
    limitations: (Array.isArray(report?.limitations) ? report.limitations : []).slice(0, 15)
      .map(value => String(value || '').trim().slice(0, 1200)).filter(Boolean),
    conclusion: String(report?.conclusion || '').trim().slice(0, 5000)
  };
}

export function approvedTrendReview(review) {
  return review?.approved === true && Number(review.score) >= 4 && Number(review.score) <= 5 &&
    review.countsConsistent === true && review.evidenceFaithful === true &&
    review.sixTopicsCovered === true && review.noUnsupportedClaims === true &&
    Array.isArray(review.criticalIssues) && review.criticalIssues.length === 0 &&
    Array.isArray(review.topicChecks) && review.topicChecks.length === TREND_TOPICS.length &&
    TREND_TOPICS.every((topic, index) => review.topicChecks[index]?.topic === topic && review.topicChecks[index]?.valid === true);
}
