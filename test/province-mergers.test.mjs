import assert from 'node:assert/strict';
import {
  CURRENT_PROVINCE_GROUPS, currentProvinceName, matchesProvinceHistory,
  normalizeProvinceName, provinceHistoryContext
} from '../lib/province-mergers.js';
import { predictionSettings, selectPredictionEvidence } from '../lib/exam-prediction.js';
import { selectTrendEvidence, trendAnalysisSettings } from '../lib/exam-trends.js';

assert.equal(CURRENT_PROVINCE_GROUPS.length, 34, 'Danh mục phải có đúng 34 tỉnh/thành hiện hành');
assert.equal(new Set(CURRENT_PROVINCE_GROUPS.map(item => normalizeProvinceName(item.currentProvince))).size, 34,
  'Tên tỉnh/thành hiện hành không được trùng');

CURRENT_PROVINCE_GROUPS.forEach((group, groupIndex) => {
  group.members.forEach(member => {
    assert.equal(currentProvinceName(member), group.currentProvince,
      `${member} phải quy về ${group.currentProvince}`);
    assert.equal(matchesProvinceHistory({ province: member }, group.currentProvince, `tst-current-${groupIndex}`), true);
  });

  // Tách khỏi kho tĩnh để kiểm tra độc lập rằng mọi địa phương cũ đều được lấy.
  const mockExams = group.members.map((member, index) => ({
    category: 'regional', anchor: `legacy-${groupIndex}-${index}`, province: member,
    year: '2028-2029', dayNumber: index + 1, title: `Đề cũ ${member}`,
    problems: [{ topic: 'Số học', excerpt: `Bài toán lịch sử của ${member}` }]
  }));
  const prediction = predictionSettings({
    targetType: 'tst', targetAnchor: `tst-current-${groupIndex}`,
    year: '2030-2031', dayNumber: 1, lookback: 2
  });
  prediction.province = group.currentProvince;
  const predictionEvidence = selectPredictionEvidence(prediction, mockExams);
  assert.equal(predictionEvidence.ownExamCount, group.members.length,
    `Dự đoán ${group.currentProvince} phải dùng đủ dữ liệu các tỉnh cũ`);

  const trendEvidence = selectTrendEvidence(trendAnalysisSettings({
    mode: 'target', targetType: 'tst', targetAnchor: `tst-current-${groupIndex}`,
    province: group.currentProvince, year: '2030-2031', lookback: 2
  }), mockExams);
  assert.equal(trendEvidence.examCount, group.members.length,
    `Xu hướng ${group.currentProvince} phải dùng đủ dữ liệu các tỉnh cũ`);
  assert.equal(trendEvidence.unitCount, 1, 'Các tỉnh cũ phải quy về một đơn vị hiện hành');
});

const danang = provinceHistoryContext('TP. Đà Nẵng', 'tst-da-nang');
assert.deepEqual(danang.members, ['Quảng Nam', 'Đà Nẵng']);
assert.equal(danang.anchors.has('tst-quang-nam'), true);
assert.equal(matchesProvinceHistory({ province: 'QUẢNG NAM' }, 'Đà Nẵng', 'tst-da-nang'), true);
assert.equal(currentProvinceName('TPHCM'), 'Thành phố Hồ Chí Minh');
assert.equal(currentProvinceName('Bà Rịa - Vũng Tàu'), 'Thành phố Hồ Chí Minh');
assert.equal(provinceHistoryContext('Trường THPT Chuyên Khoa học Tự nhiên', 'tst-khtn').merged, false,
  'Trường chuyên trực thuộc đại học phải giữ độc lập');

const sameYearDanang = selectTrendEvidence(trendAnalysisSettings({ mode: 'year', year: '2029-2030' }), [
  { category: 'tst', anchor: 'tst-da-nang', province: 'Đà Nẵng', year: '2029-2030',
    title: 'Đề Đà Nẵng', problems: [{ topic: 'Hình học', excerpt: 'Bài 1' }] },
  { category: 'tst', anchor: 'tst-quang-nam', province: 'Quảng Nam', year: '2029-2030',
    title: 'Đề Quảng Nam cũ', problems: [{ topic: 'Số học', excerpt: 'Bài 2' }] }
]);
assert.equal(sameYearDanang.unitCount, 1, 'Phân tích theo năm cũng phải quy Quảng Nam vào Đà Nẵng');
assert.deepEqual(new Set(sameYearDanang.sources.map(item => item.unit)), new Set(['Đà Nẵng']));
console.log('34-province merger history mapping: OK');
