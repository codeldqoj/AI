(() => {
  const directory = JSON.parse(document.getElementById('specialized-school-registry')?.textContent || '{"schools":[]}');
  const schools = directory.schools;
  window.VMO_SPECIALIZED_SCHOOLS = schools;
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  function init() {
    const root = document.getElementById('admissionDirectory');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = 'true';
    const provinces = [...new Set(schools.map(school => school.province))].sort((a,b) => a.localeCompare(b, 'vi'));
    for (const province of provinces) {
      const group = document.createElement('details'); group.className = 'admission-province';
      const heading = document.createElement('summary'); heading.textContent = province; group.append(heading);
      for (const school of schools.filter(item => item.province === province).sort((a,b) => a.name.localeCompare(b.name, 'vi'))) {
        const child = document.createElement('details'); child.className = 'nav-year-group admission-school'; child.dataset.schoolId = school.id;
        child.dataset.search = normalize(`${province} ${school.name} ${school.authority} ${school.aliases.join(' ')}`);
        const title = document.createElement('summary'); title.textContent = school.name + (school.kind === 'university' ? ' · trực thuộc ĐH' : ''); title.title = school.authority;
        const empty = document.createElement('small'); empty.className = 'admission-empty'; empty.textContent = 'Chưa có đề được tải lên.';
        child.append(title, empty); group.append(child);
      }
      root.append(group);
    }
    const search = document.getElementById('admissionSchoolSearch');
    if (search) search.oninput = event => {
      const query = normalize(event.target.value.trim());
      root.querySelectorAll('.admission-school').forEach(group => { group.hidden = !group.dataset.search.includes(query); });
      root.querySelectorAll('.admission-province').forEach(group => { group.hidden = !group.querySelector('.admission-school:not([hidden])'); if (query && !group.hidden) group.open = true; });
    };
  }
  window.populateAdmissionSchoolOptions = () => {
    const select = document.getElementById('docSchoolId');
    if (!select || select.options.length) return;
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '— Chọn trường chuyên —'; select.append(placeholder);
    for (const province of [...new Set(schools.map(school => school.province))].sort((a,b) => a.localeCompare(b, 'vi'))) {
      const group = document.createElement('optgroup'); group.label = province;
      for (const school of schools.filter(school => school.province === province).sort((a,b) => a.name.localeCompare(b.name, 'vi'))) {
        const option = document.createElement('option'); option.value = school.id; option.textContent = school.name + (school.kind === 'university' ? ' · trực thuộc ĐH' : ''); group.append(option);
      }
      select.append(group);
    }
  };
  window.syncAdmissionSchool = () => {
    const school = schools.find(school => school.id === document.getElementById('docSchoolId')?.value);
    const province = document.getElementById('docProvince'), region = document.getElementById('docRegion'), display = document.getElementById('docRegionDisplay');
    if (province) province.value = school?.province || '';
    if (region) region.value = school?.region || '';
    if (display) display.value = ({ BAC: 'Miền Bắc', TRUNG: 'Miền Trung', NAM: 'Miền Nam' })[school?.region] || '';
  };
  window.resetAdmissionNavigation = () => {
    const root = document.getElementById('admissionDirectory');
    if (root) { root.replaceChildren(); delete root.dataset.ready; init(); }
  };
  window.ensureAdmissionExamSidebar = exam => {
    init();
    const root = document.getElementById('admissionDirectory');
    const school = schools.find(item => item.id === exam.schoolId);
    const group = Array.from(root?.querySelectorAll('.admission-school') || []).find(item => item.dataset.schoolId === school?.id);
    if (!group || !exam.targetAnchor) return;
    group.querySelector('.admission-empty')?.remove();
    let link = Array.from(group.querySelectorAll('a')).find(item => item.hash === `#${exam.targetAnchor}`);
    if (!link) { link = document.createElement('a'); link.className = 'nav-link db-exam-sidebar-link'; link.href = `#${exam.targetAnchor}`; group.append(link); }
    link.textContent = exam.year || 'Đề thi'; link.dataset.year = exam.year || '';
    [...group.querySelectorAll('a')].sort((a,b) => b.dataset.year.localeCompare(a.dataset.year)).forEach(link => group.append(link));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
