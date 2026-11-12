import '../education_access.js';
export const { levels, labels, legacyLevels, valid, assigned, allows, moduleAllowed, contentLevel, contentAllowed } = globalThis.MathAppEducation;

// Combine scope with the caller's filter using $and; a supplied category/group cannot override it.
export function educationScope(session, field) {
  if (session?.role === 'admin') return {};
  const grants = assigned(session);
  const legacy = [];
  if (grants.length) legacy.push({ [field]: 'math_support' });
  if (grants.includes('lower_secondary')) legacy.push({ [field]: { $in: ['specialized_admission', 'specialized-admission'] } });
  if (grants.includes('university')) legacy.push({ [field]: { $in: ['university','university_materials','university_books'] } });
  if (grants.includes('upper_secondary')) legacy.push({ [field]: { $nin: ['math_support', 'specialized_admission', 'specialized-admission', 'university', 'university_materials','university_books'] } });
  return { $or: [
    { educationLevel: { $in: grants } },
    { $and: [{ educationLevel: { $exists: false } }, { $or: legacy.length ? legacy : [{ _id: { $in: [] } }] }] }
  ] };
}
export function scopeFilter(filter, session, field) {
  return session?.role === 'admin' ? filter : { $and: [filter, educationScope(session, field)] };
}
