import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const sources = [
  ['tst', 'src/content/tab-tst.html'],
  ['regional', 'src/content/tab-history.html']
];
const entries = [];
for (const [category, path] of sources) {
  const html = fs.readFileSync(new URL(path, root), 'utf8');
  const document = new JSDOM(html).window.document;
  for (const card of document.querySelectorAll('.exam-card[id]')) {
    const year = card.querySelector('.tag-year')?.textContent?.match(/(20\d{2})\s*[–—-]\s*(20\d{2})/);
    if (!year || Number(year[2]) !== Number(year[1]) + 1) continue;
    const problems = Array.from(card.querySelectorAll('.problem-item')).map((item, index) => ({
      number: index + 1,
      topic: item.querySelector('.badge-topic')?.textContent?.trim().slice(0, 100) || 'Chưa phân loại',
      excerpt: item.querySelector('.problem-content')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 250) || ''
    })).filter(item => item.excerpt);
    if (!problems.length) continue;
    entries.push({
      category, anchor: card.id, year: `${year[1]}-${year[2]}`,
      province: card.querySelector('.tag-province')?.textContent?.trim() || '',
      title: card.querySelector('.exam-title')?.textContent?.trim().slice(0, 180) || '',
      source: `/${path}#${card.id}`, problems
    });
  }
}
const out = new URL('data/exam-prediction-history.js', root);
fs.writeFileSync(out, `// Generated from the two source tabs by scripts/build-prediction-history.mjs.\nexport const historicalExams = ${JSON.stringify(entries, null, 2)};\n`);
console.log(`Indexed ${entries.length} source exams (${entries.filter(item => item.category === 'tst').length} TST).`);
