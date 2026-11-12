/* Shared policy: account roles govern actions; education levels govern content. */
(function(root) {
  const levels = ['primary', 'lower_secondary', 'upper_secondary', 'university'];
  const labels = {
    primary: ['Tiểu học', 'Primary school'], lower_secondary: ['Trung học cơ sở', 'Lower secondary'],
    upper_secondary: ['Trung học phổ thông', 'Upper secondary'], university: ['Đại học', 'University']
  };
  const legacyLevels = ['lower_secondary', 'upper_secondary'];
  const modules = {
    danang: 'upper_secondary', mock: 'upper_secondary', tst: 'upper_secondary', vmo: 'upper_secondary',
    history: 'upper_secondary', olympic: 'upper_secondary', olympic30: 'upper_secondary', duyenhai: 'upper_secondary',
    admission: 'lower_secondary', books: 'university', 'university-materials': 'university', primary: 'primary', university: 'university', support: 'shared', trends: 'upper_secondary'
  };
  function valid(value) { return Array.isArray(value) && value.length <= 4 && value.every(v => levels.includes(v)) && new Set(value).size === value.length; }
  function assigned(user) {
    if (user?.role === 'admin') return [...levels];
    return user && Object.hasOwn(user, 'educationLevels')
      ? (valid(user.educationLevels) ? levels.filter(v => user.educationLevels.includes(v)) : [])
      : [...legacyLevels];
  }
  function allows(user, level) { return user?.role === 'admin' || (level === 'shared' ? assigned(user).length > 0 : assigned(user).includes(level)); }
  function moduleAllowed(user, key) { return !!modules[key] && allows(user, modules[key]); }
  function contentLevel(item) {
    if (levels.includes(item?.educationLevel)) return item.educationLevel;
    const group = item?.sourceGroup || item?.group || item?.category || item?.problemSnapshot?.sourceGroup;
    if (['university','university_materials','university_books'].includes(group)) return 'university';
    if (['math_support'].includes(group)) return 'shared';
    if (['specialized_admission', 'specialized-admission'].includes(group)) return 'lower_secondary';
    return 'upper_secondary';
  }
  function contentAllowed(user, item) { return !!item && allows(user, contentLevel(item)); }
  root.MathAppEducation = { levels, labels, legacyLevels, modules, valid, assigned, allows, moduleAllowed, contentLevel, contentAllowed };
})(typeof window !== 'undefined' ? window : globalThis);
