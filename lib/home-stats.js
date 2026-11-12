// Counts follow the same publication and ownership rules as the catalogs.
export const HOME_EXAM_CATEGORIES = [
  'vmo-mock', 'tst-national', 'vmo-official', 'imo-olympic',
  'history-dn-qn', 'olympic-30-4', 'duyen-hai-bac'
];

export async function getCatalogTotals(db, session) {
  const examFilter = {
    category: { $in: HOME_EXAM_CATEGORIES },
    status: ['admin', 'teacher'].includes(session.role) ? { $ne: 'deleted' } : 'published'
  };
  const supportFilter = { sourceGroup: 'math_support', status: 'published' };
  if (!['admin', 'teacher'].includes(session.role)) supportFilter.ownerId = String(session.sub || '');
  const [groups, standaloneProblems] = await Promise.all([
    db.collection('exams').aggregate([
      { $match: examFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).toArray(),
    db.collection('problems').countDocuments(supportFilter)
  ]);
  const examCounts = Object.fromEntries(HOME_EXAM_CATEGORIES.map(category => [category, 0]));
  for (const group of groups) {
    if (Object.hasOwn(examCounts, group._id)) examCounts[group._id] = Math.max(0, Number(group.count) || 0);
  }
  return { examCounts, standaloneProblems, supportScope: ['admin', 'teacher'].includes(session.role) ? 'all' : 'own' };
}
