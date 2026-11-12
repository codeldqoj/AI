const SOURCE_CONFIG = Object.freeze({
  specialty: { category: 'specialty', group: 'specialty', contentType: 'specialty_chapter', sourceType: 'specialty_example' },
  mock: { category: 'vmo-mock', group: 'mock_exam', contentType: 'mock_exam', sourceType: 'mock_exam_question' },
  tst: { category: 'tst-national', group: 'tst', contentType: 'tst_exam', sourceType: 'tst_question' },
  regional: { category: 'history-dn-qn', group: 'danang_quangnam', contentType: 'regional_exam', sourceType: 'regional_question' }
});

export function cleanKey(value = '') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function configFor(source) {
  const config = SOURCE_CONFIG[source];
  if (!config) throw new Error(`Nguồn catalog không hợp lệ: ${source}`);
  return config;
}

export function assertManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error('Manifest phải có schemaVersion=1');
  const collections = ['exams', 'contentSets', 'problems', 'contentBlocks'];
  collections.forEach(name => {
    if (!Array.isArray(manifest[name])) throw new Error(`Manifest thiếu mảng ${name}`);
  });
  const unique = (items, field, label) => {
    const seen = new Set();
    items.forEach((item, index) => {
      const value = String(item?.[field] || '');
      if (!value) throw new Error(`${label} #${index + 1} thiếu ${field}`);
      if (seen.has(value)) throw new Error(`${label} trùng ${field}: ${value}`);
      seen.add(value);
    });
  };
  unique(manifest.exams, 'examKey', 'exam');
  unique(manifest.contentSets, 'key', 'content set');
  unique(manifest.problems, 'contentKey', 'problem');
  unique(manifest.contentBlocks, 'blockKey', 'content block');
  const setKeys = new Set(manifest.contentSets.map(item => item.key));
  manifest.problems.forEach(item => {
    if (!setKeys.has(item.setKey)) throw new Error(`Problem ${item.contentKey} tham chiếu set không tồn tại: ${item.setKey}`);
    if (/(?:<|&lt;)mjx-[a-z-]+\b|class=["'][^"']*\bMathJax\b/i.test(String(item.content || '') + String(item.referenceSolution || ''))) {
      throw new Error(`Problem ${item.contentKey} chứa HTML MathJax đã render`);
    }
    if (/(?:\$|\\\[|<)=""/.test(String(item.content || ''))) {
      throw new Error(`Problem ${item.contentKey} có HTML bị hỏng trong manifest`);
    }
  });
  return manifest;
}

export function manifestSummary(manifest) {
  return {
    exams: manifest.exams.length,
    contentSets: manifest.contentSets.length,
    problems: manifest.problems.length,
    contentBlocks: manifest.contentBlocks.length,
    specialtyExamples: manifest.problems.filter(item => item.sourceType === 'specialty_example').length
  };
}
