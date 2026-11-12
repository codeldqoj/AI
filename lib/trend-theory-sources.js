// Curated institutional references. Links describe the underlying theory, not a
// certification of every new example or derived result produced by the model.
const sources = {
  'Dãy số và Giới hạn dãy số': [
    { id: 'MIT-ANALYSIS', title: 'MIT OpenCourseWare – Real Analysis, lecture notes', url: 'https://ocw.mit.edu/courses/18-100b-real-analysis-spring-2025/pages/lecture-notes/' }
  ],
  'Phương trình hàm': [
    { id: 'MIT-ANALYSIS', title: 'MIT OpenCourseWare – Real Analysis, lecture notes', url: 'https://ocw.mit.edu/courses/18-100b-real-analysis-spring-2025/pages/lecture-notes/' }
  ],
  'Số học và dãy số': [
    { id: 'MIT-NUMBER', title: 'MIT OpenCourseWare – Theory of Numbers, lecture notes', url: 'https://ocw.mit.edu/courses/18-781-theory-of-numbers-spring-2012/pages/lecture-notes/' },
    { id: 'MIT-ANALYSIS', title: 'MIT OpenCourseWare – Real Analysis, lecture notes', url: 'https://ocw.mit.edu/courses/18-100b-real-analysis-spring-2025/pages/lecture-notes/' }
  ],
  'Hình học phẳng': [
    { id: 'EUCLID-ELEMENTS', title: 'Euclid’s Elements – Clark University edition', url: 'https://mathcs.clarku.edu/~djoyce/elements/elements.html' }
  ],
  'Đa thức': [
    { id: 'MIT-POLYNOMIAL', title: 'MIT OpenCourseWare – Polynomial rings', url: 'https://ocw.mit.edu/courses/18-703-modern-algebra-spring-2013/resources/mit18_703s13_pra_l_21/' }
  ],
  'Tổ hợp': [
    { id: 'MIT-COMBINATORICS', title: 'MIT OpenCourseWare – Discrete Applied Mathematics, lecture notes', url: 'https://ocw.mit.edu/courses/18-200-principles-of-discrete-applied-mathematics-spring-2024/resources/lecture-notes/' }
  ]
};

export function trendTheorySources(topic) {
  return (sources[topic] || []).map(source => ({ ...source }));
}
