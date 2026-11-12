/**
 * VMO ĐÀ NẴNG 2026-2027 - CORE APPLICATION LOGIC
 * Quản lý tương tác Tabs, Bộ lọc đề, Tìm kiếm nhanh, Lời giải & MathJax, Giao diện Sáng/Tối
 */

(() => {
  const qs = (s, c = document) => c.querySelector(s);
  const qsa = (s, c = document) => [...c.querySelectorAll(s)];

  const search = qs('#searchInput');
  const searchSummary = qs('#searchSummary');
  const sidebar = qs('#mainSidebar');
  const tocToggle = qs('#mobileTocToggle');
  const tocClose = qs('#mobileTocClose');
  const tocBackdrop = qs('#sidebarBackdrop');
  const accountToggle = qs('#accountMenuToggle');
  const accountBar = qs('#userAuthBar');
  const moduleNavigation = qs('#moduleNavigation');
  const moduleToggle = qs('#moduleNavigationToggle');
  const compactNavigation = window.matchMedia?.('(max-width: 960px)') || { matches: false };
  let tabSwitchVersion = 0;
  const mobileWidth = window.matchMedia?.('(max-width: 680px)') || { matches: false };
  let focusBeforeToc = null;

  function syncStickyOffset() {
    const navHeight = qs('.nav-tabs-wrapper')?.getBoundingClientRect().height || 0;
    const controlsHeight = qs('.controls-sticky')?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty('--nav-height', `${Math.ceil(navHeight)}px`);
    document.documentElement.style.setProperty('--content-offset', `${Math.ceil(navHeight + controlsHeight + 12)}px`);
  }
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(syncStickyOffset);
    ['.nav-tabs-wrapper', '.controls-sticky'].forEach(selector => {
      const node = qs(selector);
      if (node) observer.observe(node);
    });
  }
  window.addEventListener('resize', syncStickyOffset);
  syncStickyOffset();

  function closeToc(restoreFocus = true) {
    if (!sidebar?.classList.contains('mobile-open')) return;
    sidebar.classList.remove('mobile-open');
    tocBackdrop?.classList.remove('visible');
    tocToggle?.setAttribute('aria-expanded', 'false');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    document.body.classList.remove('toc-open');
    if (restoreFocus) (focusBeforeToc || tocToggle)?.focus();
  }
  tocToggle?.addEventListener('click', () => {
    if (!mobileWidth.matches) return;
    focusBeforeToc = document.activeElement;
    closeAccountMenu();
    sidebar.classList.add('mobile-open');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    tocBackdrop?.classList.add('visible');
    tocToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('toc-open');
    tocClose?.focus();
  });
  tocClose?.addEventListener('click', () => closeToc());
  tocBackdrop?.addEventListener('click', () => closeToc());
  sidebar?.addEventListener('click', event => {
    if (mobileWidth.matches && event.target.closest('a[href^="#"]')) closeToc();
  });
  function closeAccountMenu() {
    accountBar?.classList.remove('mobile-open');
    accountToggle?.setAttribute('aria-expanded', 'false');
  }
  accountToggle?.addEventListener('click', () => {
    const open = accountBar?.classList.toggle('mobile-open');
    accountToggle.setAttribute('aria-expanded', String(!!open));
    if (open) accountBar.querySelector('button:not([style*="display: none"])')?.focus();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.app-topbar-actions')) closeAccountMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeToc(); closeAccountMenu(); return; }
    if (event.key !== 'Tab' || !sidebar?.classList.contains('mobile-open')) return;
    const items = [tocClose, ...sidebar.querySelectorAll('a[href], button:not([disabled]), summary')].filter(Boolean);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  mobileWidth.addEventListener?.('change', () => { closeToc(false); closeAccountMenu(); });

  function closeModuleNavigation(restoreFocus = false) {
    if (!moduleNavigation || !moduleToggle) return;
    const focusWasInside = moduleNavigation.contains(document.activeElement);
    moduleToggle.setAttribute('aria-expanded', 'false');
    moduleNavigation.hidden = compactNavigation.matches;
    if (compactNavigation.matches && restoreFocus && focusWasInside) moduleToggle.focus();
  }

  const levelNames={primary:['Tiểu học','Primary school'],lower_secondary:['Trung học cơ sở','Lower secondary'],upper_secondary:['Trung học phổ thông','Upper secondary'],university:['Đại học','University']};
  let navigationLevel='upper_secondary';
  const lastLevelModule=new Map();
  function syncLevelNavigation(){
    const policy=window.MathAppEducation,user=window.VMOAuth?.getSession?.(),en=window.currentLang==='en';
    const grants=policy?policy.assigned(user):Object.keys(levelNames);
    const active=moduleNavigation?.querySelector('.tab-btn.active:not([hidden])');
    const activeLevel=active?.closest('[data-navigation-level]')?.dataset.navigationLevel;
    if(activeLevel){navigationLevel=activeLevel;lastLevelModule.set(activeLevel,active.id);}
    if(!grants.includes(navigationLevel))navigationLevel=grants[0]||'';
    qsa('[data-navigation-level]').forEach(group=>{group.hidden=group.dataset.navigationLevel!==navigationLevel||![...group.querySelectorAll('.tab-btn')].some(b=>!b.hidden);group.setAttribute('aria-label',levelNames[group.dataset.navigationLevel][en?1:0]);});
    qsa('.education-level-button').forEach(button=>{const level=button.dataset.educationLevel;button.hidden=!grants.includes(level);button.setAttribute('aria-pressed',String(level===navigationLevel));button.textContent=levelNames[level][en?1:0];});
    const select=qs('#educationLevelSelect');
    if(select){select.setAttribute('aria-label',en?'Education level':'Cấp học');[...select.options].forEach(o=>{o.hidden=!grants.includes(o.value);o.disabled=o.hidden;o.textContent=levelNames[o.value][en?1:0];});select.value=navigationLevel;select.disabled=!grants.length;}
    qs('.education-level-bar')?.setAttribute('aria-label',en?'Education level':'Cấp học');
    const summary=qs('#educationAccessSummary');if(summary)summary.classList.toggle('levels-assigned',!!grants.length);
  }
  window.chooseEducationLevel=async level=>{
    const control=qs(`.education-level-button[data-education-level="${level}"]`);
    if(!control||control.hidden)return;
    const group=qs(`[data-navigation-level="${level}"]`);
    const remembered=qs('#'+(lastLevelModule.get(level)||'missing-module'));
    const next=remembered&&!remembered.hidden?remembered:group?.querySelector('.tab-btn:not([hidden])');
    if(next)await window.switchTab(next.id.replace('tab-btn-','tab-'),next);
  };
  qsa('.education-level-button').forEach(button=>{
    button.addEventListener('click',()=>window.chooseEducationLevel(button.dataset.educationLevel));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const buttons=qsa('.education-level-button:not([hidden])');const i=buttons.indexOf(button);
      const next=event.key==='Home'?buttons[0]:event.key==='End'?buttons.at(-1):buttons[(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length];
      event.preventDefault();next?.focus();next?.click();
    });
  });
  qs('#educationLevelSelect')?.addEventListener('change',event=>window.chooseEducationLevel(event.target.value));

  window.refreshModuleNavigation = function() {
    if (!moduleNavigation) return;
    const active = moduleNavigation.querySelector('.tab-btn.active');
    moduleNavigation.querySelectorAll('.tab-btn').forEach(button => {
      const selected = button === active;
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      const paneId = button.id.replace('tab-btn-', 'tab-');
      button.setAttribute('aria-controls', paneId);
      document.getElementById(paneId)?.setAttribute('aria-labelledby', button.id);
    });
    const summary = qs('#activeModuleLabel');
    if (summary && active) summary.textContent = active.textContent.trim();
    syncLevelNavigation();
  };
  if (moduleNavigation && moduleToggle) {
    document.documentElement.classList.add('navigation-ready');
    closeModuleNavigation();
    window.refreshModuleNavigation();
    moduleToggle.addEventListener('click', () => {
      if (!compactNavigation.matches) return;
      const open = moduleToggle.getAttribute('aria-expanded') !== 'true';
      closeToc(false); closeAccountMenu();
      moduleToggle.setAttribute('aria-expanded', String(open));
      moduleNavigation.hidden = !open;
    });
    moduleToggle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' || !compactNavigation.matches) return;
      event.preventDefault();
      moduleToggle.setAttribute('aria-expanded', 'true'); moduleNavigation.hidden = false;
      (moduleNavigation.querySelector('.tab-btn.active') || moduleNavigation.querySelector('.tab-btn'))?.focus();
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.module-navigation-shell')) closeModuleNavigation();
    });
    document.addEventListener('focusin', event => {
      if (!event.target.closest('.module-navigation-shell')) closeModuleNavigation();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && moduleToggle.getAttribute('aria-expanded') === 'true') {
        event.preventDefault(); closeModuleNavigation(true);
      }
    });
    compactNavigation.addEventListener?.('change', () => {
      const focusWasToggle = document.activeElement === moduleToggle;
      closeModuleNavigation(true);
      if (!compactNavigation.matches && focusWasToggle) moduleNavigation.querySelector('.tab-btn.active')?.focus();
      syncStickyOffset();
    });
  }

  function formatCount(value) {
    return String(Math.max(0, Number(value) || 0)).padStart(2, '0');
  }

  function renderCatalogStats(values) {
    Object.entries(values).forEach(([key, value]) => {
      qsa(`[data-catalog-stat="${key}"]`).forEach(node => {
        node.textContent = String(value);
      });
    });
  }

  function staticCatalogStats() {
    return {
      tstTargets: new Set(),
      regionalTargets: new Set(),
      mockEntries: new Set(),
      chapters: qsa('#book-content .chapter-block[data-chapter]:not([data-chapter="meta"])').length,
      theory: qsa('#book-content .theorybox').length,
      examples: 0
    };
  }

  function mockDimensions(entries) {
    const sets = new Set();
    const days = new Set();
    entries.forEach(key => {
      const match = String(key).match(/^mock-set(\d+)-day(\d+)$/);
      if (!match) return;
      sets.add(match[1]);
      days.add(match[2]);
    });
    return { sets: sets.size, days: days.size };
  }

  let catalogStatsVersion = 0;
  window.refreshVMOCatalogStats = async function() {
    const version = ++catalogStatsVersion;
    const stats = staticCatalogStats();
    const apply = () => {
      const mock = mockDimensions(stats.mockEntries);
      renderCatalogStats({
        tst: formatCount(stats.examCounts?.['tst-national'] ?? stats.tstTargets.size),
        regional: formatCount(stats.examCounts?.['history-dn-qn'] ?? stats.regionalTargets.size),
        chapters: formatCount(stats.chapters),
        theory: formatCount(stats.theory),
        examples: formatCount(stats.databaseExamples ?? stats.examples),
        mock: formatCount(stats.examCounts?.['vmo-mock'] ?? mock.sets),
        support: formatCount(stats.standaloneProblems),
        vmo: formatCount(stats.examCounts?.['vmo-official']),
        olympic: formatCount(stats.examCounts?.['imo-olympic']),
        olympic30: formatCount(stats.examCounts?.['olympic-30-4']),
        duyenhai: formatCount(stats.examCounts?.['duyen-hai-bac']),
        mockSets: formatCount(mock.sets)
      });
    };

    // A dash means unavailable/loading; zero is reserved for a successful count.
    qs('.hero-stats')?.setAttribute('aria-busy', 'true');
    const databaseKeys = ['mock', 'support', 'tst', 'vmo', 'olympic', 'regional', 'olympic30', 'duyenhai', 'mockSets', 'examples'];
    renderCatalogStats(Object.fromEntries(databaseKeys.map(key => [key, '—'])));
    renderCatalogStats({ chapters: formatCount(stats.chapters), theory: formatCount(stats.theory) });
    if (!window.VMODataService?.getHomeStats) { qs('.hero-stats')?.setAttribute('aria-busy', 'false'); return; }

    try {
      const databaseStats = await window.VMODataService.getHomeStats();
      if (version !== catalogStatsVersion) return;
      stats.examCounts = databaseStats?.examCounts;
      stats.standaloneProblems = databaseStats?.standaloneProblems;
      const supportCount = qs('.hero-stats [data-catalog-stat="support"]');
      if (supportCount) supportCount.dataset.scope = databaseStats?.supportScope === 'all' ? 'all' : 'own';
      const scopeNote = qs('#supportStatsScope');
      const all = databaseStats?.supportScope === 'all';
      if (scopeNote) scopeNote.textContent = window.currentLang === 'en' ? (all ? 'Standalone problems: all accounts.' : 'Standalone problems: your account.') : (all ? 'Bài toán riêng lẻ: toàn hệ thống.' : 'Bài toán riêng lẻ: của bạn.');
      if (Number.isInteger(Number(databaseStats?.specialtyExamples))) {
        stats.databaseExamples = Math.max(0, Number(databaseStats.specialtyExamples));
      }
      (Array.isArray(databaseStats?.exams) ? databaseStats.exams : []).forEach(exam => {
        const target = String(exam?.targetAnchor || '');
        if (exam?.category === 'tst-national' && target) stats.tstTargets.add(target);
        if (exam?.category === 'history-dn-qn' && target) stats.regionalTargets.add(target);
        if (exam?.category !== 'vmo-mock') return;

        const setNumber = Math.max(0,
          Number(exam.setNumber) || Number(target.match(/^mock-set(\d+)/)?.[1]) || 0);
        const dayNumber = Math.max(0,
          Number(exam.dayNumber) || Number(target.match(/-day(\d+)$/)?.[1]) || 0);
        if (setNumber && dayNumber) stats.mockEntries.add(`mock-set${setNumber}-day${dayNumber}`);
      });
      apply();
    } catch (error) {
      console.warn('Không tải được thống kê catalog từ MongoDB:', error?.message || error);
    } finally {
      if (version === catalogStatsVersion) qs('.hero-stats')?.setAttribute('aria-busy', 'false');
    }
  };

  window.addEventListener('vmo:data-service-ready', () => window.refreshVMOCatalogStats());
  window.addEventListener('vmo:data-changed', () => window.refreshVMOCatalogStats());
  window.refreshVMOCatalogStats();

  async function ensureTabContent(tabId) {
    if (window.MathAppEducation && !window.MathAppEducation.moduleAllowed(window.VMOAuth?.getSession?.(), tabId.replace(/^tab-/, ''))) return null;
    return qs('#' + tabId);
  }

  // Cho các chế độ xem theo ngữ cảnh (ví dụ: luyện tập từ báo cáo xu hướng)
  // nạp kho đề theo yêu cầu mà không phải chuyển tab đang xem.
  window.ensureVMOTabContent = ensureTabContent;

  // Khởi động MathJax typeset an toàn
  function typeset(el) {
    if (el && window.renderMathInContainer) {
      window.renderMathInContainer(el).catch(() => {});
      return;
    }
    if (window.MathJax && window.MathJax.typesetPromise) {
      const target = el || qs('.tab-pane.active');
      if (target) MathJax.typesetPromise([target]).catch(() => {});
    }
  }

  // 1. Chuyển đổi Tab nội dung chính & đồng bộ Sidebar tương ứng
  window.switchTab = async function (tabId, btn) {
    if (!qs('#' + tabId)) return;
    if (window.MathAppEducation && !window.MathAppEducation.moduleAllowed(window.VMOAuth?.getSession?.(), tabId.replace(/^tab-/, ''))) return;
    const version = ++tabSwitchVersion;
    closeModuleNavigation(true);
    closeToc(false);
    closeAccountMenu();
    qsa('.tab-pane').forEach(x => x.classList.remove('active'));
    qsa('.tab-btn').forEach(x => x.classList.remove('active'));

    let targetPane = qs('#' + tabId);
    if (targetPane) targetPane.classList.add('active');

    const targetBtn = btn || (window.event && window.event.currentTarget) || qs(`.tab-btn[onclick*="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    window.refreshModuleNavigation();

    const isM = (tabId === 'tab-mock');
    const isT = (tabId === 'tab-tst');
    const isH = (tabId === 'tab-history');
    const isV = (tabId === 'tab-vmo');
    const isO = (tabId === 'tab-olympic');
    const isSupport = tabId === 'tab-support';
    if (qs('#sidebar-support')) qs('#sidebar-support').style.display = isSupport ? 'block' : 'none';
    const isBooks = tabId === 'tab-books';
    if(qs('#sidebar-books'))qs('#sidebar-books').style.display=isBooks?'block':'none';
    const isUniversityMaterials = tabId === 'tab-university-materials';
    if (qs('#sidebar-university-materials')) qs('#sidebar-university-materials').style.display = isUniversityMaterials ? 'block' : 'none';
    const isUniversity = tabId === 'tab-university';
    if (qs('#sidebar-university')) qs('#sidebar-university').style.display = isUniversity ? 'block' : 'none';
    const isAdmission = tabId === 'tab-admission';
    if (qs('#admissionFilterPills')) qs('#admissionFilterPills').style.display = isAdmission ? 'flex' : 'none';
    if (qs('#sidebar-admission')) qs('#sidebar-admission').style.display = isAdmission ? 'block' : 'none';
    const isGradeCatalog = ['tab-olympic30', 'tab-duyenhai'].includes(tabId);
    ['olympic30', 'duyenhai'].forEach(key => {
      if (qs('#sidebar-' + key)) qs('#sidebar-' + key).style.display = tabId === 'tab-' + key ? 'block' : 'none';
      if (qs('#' + key + 'FilterPills')) qs('#' + key + 'FilterPills').style.display = tabId === 'tab-' + key ? 'flex' : 'none';
    });

    // Cập nhật hiển thị Sidebar
    const sbDanang = qs('#sidebar-danang');
    const sbMock = qs('#sidebar-mock');
    const sbTst = qs('#sidebar-tst');
    const sbHistory = qs('#sidebar-history');

    if (sbDanang) sbDanang.style.display = (!isM && !isT && !isH && !isV && !isO && !isGradeCatalog && !isSupport && !isAdmission && !isUniversity && !isUniversityMaterials && !isBooks) ? 'block' : 'none';
    if (sbMock) sbMock.style.display = isM ? 'block' : 'none';
    if (sbTst) sbTst.style.display = isT ? 'block' : 'none';
    if (sbHistory) sbHistory.style.display = isH ? 'block' : 'none';
    if (qs('#sidebar-vmo')) qs('#sidebar-vmo').style.display = isV ? 'block' : 'none';
    if (qs('#sidebar-olympic')) qs('#sidebar-olympic').style.display = isO ? 'block' : 'none';

    // Cập nhật thanh lọc vùng miền / bộ đề
    const pillsMock = qs('#mockFilterPills');
    const pillsTst = qs('#tstFilterPills');
    const pillsHist = qs('#historyFilterPills');

    if (pillsMock) pillsMock.style.display = isM ? 'flex' : 'none';
    if (pillsTst) pillsTst.style.display = isT ? 'flex' : 'none';
    if (pillsHist) pillsHist.style.display = isH ? 'flex' : 'none';
    if (qs('#vmoFilterPills')) qs('#vmoFilterPills').style.display = isV ? 'flex' : 'none';
    if (qs('#olympicFilterPills')) qs('#olympicFilterPills').style.display = isO ? 'flex' : 'none';

    if (search) {
      search.value = '';
      clearSearch();
    }

    syncStickyOffset();
    const readingRoot = qs('#main-content');
    const offset = parseFloat(document.documentElement.style.getPropertyValue('--content-offset')) || 0;
    const targetTop = readingRoot ? window.scrollY + readingRoot.getBoundingClientRect().top - offset : 0;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });

    try {
      targetPane = await ensureTabContent(tabId);
      if (version !== tabSwitchVersion) return;
      targetPane?.classList.add('active');
    } catch {
      return;
    }

    // Đồng bộ lại các nút AI Hướng dẫn giải & Nút Nộp bài Database nếu cần
    if (isSupport) await window.loadMathSupportProblems?.();
    if (isBooks) await window.loadBooks?.();
    if (isUniversityMaterials) await window.loadUniversityMaterials?.();
    if (version !== tabSwitchVersion) return;
    window.reinitAIGuide?.(targetPane);
    window.reinitDatabaseUI?.(targetPane);
    window.applyCurrentLanguage?.();

    // Render công thức toán nếu tab vừa mở chưa được biên dịch
    if (!isM && !isT && !isH && !isV && !isO && !isGradeCatalog && !isSupport && !isAdmission && !isUniversity && !isUniversityMaterials && !isBooks) typeset(targetPane);
  };

  // 2. Hiện / Ẩn lời giải và barem điểm từng bài
  window.toggleSolution = function (btn) {
    const content = btn.nextElementSibling;
    if (!content) return;
    const open = getComputedStyle(content).display !== 'none';
    content.style.display = open ? 'none' : 'block';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');

    const isEn = (window.currentLang === 'en');
    const isSourceBox = !!btn.closest('.source-solution-box');

    if (isSourceBox) {
      btn.textContent = open
        ? (isEn ? '🔗 Reference Solutions' : '🔗 Lời giải tham khảo')
        : (isEn ? '🙈 Hide Reference Solutions' : '🙈 Ẩn lời giải tham khảo');
    } else {
      btn.textContent = open
        ? (isEn ? '👁️ View Solution & Rubric' : '👁️ Xem lời giải & Thang điểm')
        : (isEn ? '🙈 Hide Solution & Rubric' : '🙈 Ẩn lời giải & Thang điểm');
    }

    if (!open) typeset(content);
  };

  // 3. Sao chép nội dung bài toán vào Clipboard
  window.copyText = function (btn) {
    const card = btn.closest('.problem-item');
    if (!card) return;
    const isEn = (window.currentLang === 'en');
    const label = card.querySelector('.problem-id span:first-child') || card.querySelector('.problem-id');
    const id = label?.innerText || label?.textContent || (isEn ? 'Problem' : 'Bài toán');
    const statement = card.querySelector('.problem-content');
    // Read the original TeX, never the typeset MathJax DOM or the answer/actions.
    const content = statement?.getAttribute('data-raw-math') || statement?.innerText || statement?.textContent || '';
    const text = `${id}:\n${content}`;
    const old = btn.textContent;
    const success = () => {
      btn.textContent = isEn ? '✅ Copied' : '✅ Đã sao chép';
      setTimeout(() => { btn.textContent = old; }, 1500);
    };
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;area.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(area);area.select();
      let ok = false;
      try { ok = document.execCommand?.('copy') === true; } catch { /* browser denies clipboard */ }
      area.remove();btn.focus();
      if (ok) success();
      else window.prompt(isEn ? 'Copy problem text:' : 'Sao chép nội dung bài toán:', text);
    };
    if (!navigator.clipboard?.writeText) { fallback();return; }
    navigator.clipboard.writeText(text).then(success, fallback);
  };

  // 4. Tìm kiếm nội dung theo từ khóa tiếng Việt / không dấu
  function norm(s) {
    return (s || '')
      .toLocaleLowerCase('vi')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  function clearSearch() {
    qsa('.hidden-by-search').forEach(x => x.classList.remove('hidden-by-search'));
    window.refreshUniversityCatalogFilter?.();
    ['tab-olympic30', 'tab-duyenhai', 'tab-admission'].forEach(id => window.refreshGradeCatalogFilter?.(id));
    if (searchSummary) {
      searchSummary.classList.remove('visible');
      searchSummary.textContent = '';
    }
  }

  function searchBook(val) {
    let matches = 0;
    qsa('#tab-danang .chapter-block').forEach(ch => {
      let any = false;
      const subs = qsa('.book-subsection', ch);
      if (!subs.length) {
        const hit = norm(ch.textContent).includes(val);
        ch.classList.toggle('hidden-by-search', !hit);
        if (hit) { matches++; any = true; }
        return;
      }
      subs.forEach(sub => {
        const hit = norm(sub.textContent).includes(val);
        sub.classList.toggle('hidden-by-search', !hit);
        if (hit) { matches++; any = true; }
      });
      const headText = norm(ch.querySelector('.chapter-heading')?.textContent || '');
      if (headText.includes(val)) {
        subs.forEach(s => s.classList.remove('hidden-by-search'));
        any = true;
        matches = Math.max(matches, 1);
      }
      ch.classList.toggle('hidden-by-search', !any);
    });
    return matches;
  }

  function searchExamBank(tabId, val) {
    let matches = 0;
    qsa('#' + tabId + ' .exam-card').forEach(card => {
      const hit = norm((card.dataset.search || '') + ' ' + card.innerText).includes(val) && gradeMatches(card);
      card.classList.toggle('hidden-by-search', !hit);
      if (hit) matches++;
    });
    return matches;
  }

  let catalogSearchTimer = null;
  let catalogSearchVersion = 0;

  function applySearch() {
    clearTimeout(catalogSearchTimer);
    const version = ++catalogSearchVersion;
    const raw = search ? search.value.trim() : '';
    if (qs('.tab-pane.active')?.id === 'tab-university-materials') { const input=qs('#universityMaterialsSearch');if(input){input.value=raw;input.dispatchEvent(new Event('input'));}return; }
    if (!raw) {
      clearSearch();
      return;
    }
    const val = norm(raw);
    const active = qs('.tab-pane.active');
    let n = 0;
    if (['tab-mock', 'tab-tst', 'tab-history', 'tab-vmo', 'tab-olympic', 'tab-olympic30', 'tab-duyenhai', 'tab-admission', 'tab-university'].includes(active?.id)) {
      n = searchExamBank(active.id, val);
    } else {
      n = searchBook(val);
    }
    if (searchSummary) {
      searchSummary.textContent = `Tìm thấy ${n} mục phù hợp với “${raw}”.`;
      searchSummary.classList.add('visible');
    }
    const category = { 'tab-tst': 'tst-national', 'tab-mock': 'vmo-mock', 'tab-history': 'history-dn-qn', 'tab-vmo': 'vmo-official', 'tab-olympic': 'imo-olympic', 'tab-olympic30': 'olympic-30-4', 'tab-duyenhai': 'duyen-hai-bac', 'tab-admission': 'specialized-admission', 'tab-university': 'university' }[active?.id];
    if (category && raw.length >= 2 && window.VMODataService?.searchExamCatalog) {
      catalogSearchTimer = setTimeout(async () => {
        try {
          const matches = await window.VMODataService.searchExamCatalog(category, raw);
          if (version !== catalogSearchVersion || document.querySelector('.tab-pane.active')?.id !== active.id) return;
          const anchors = new Set(matches.map(item => item.targetAnchor));
          let count = 0;
          qsa(`#${active.id} .exam-card`).forEach(card => {
            const local = norm((card.dataset.search || '') + ' ' + card.innerText).includes(val);
            const hit = (local || anchors.has(card.id)) && gradeMatches(card);
            card.classList.toggle('hidden-by-search', !hit);
            if (hit) count++;
          });
          if (searchSummary) searchSummary.textContent = `Tìm thấy ${count} mục phù hợp với “${raw}”.`;
        } catch (error) {
          console.warn('Không tìm kiếm được nội dung đề từ MongoDB:', error?.message || error);
        }
      }, 300);
    }
  }

  search?.addEventListener('input', applySearch);

  function gradeMatches(card) {
    const id = card.closest('.tab-pane')?.id;
    if (id === 'tab-university') return card.dataset.courseId === window.currentUniversityCourse && (!window.currentUniversitySection || (card.dataset.sectionId || 'unclassified') === window.currentUniversitySection);
    if (!['tab-olympic30', 'tab-duyenhai', 'tab-admission'].includes(id)) return true;
    const filter = qs(`#${id.slice(4)}FilterPills .pill.active`)?.dataset.filter || 'ALL';
    return filter === 'ALL' || card.dataset.filter === filter;
  }
  window.refreshGradeCatalogFilter = function(id) {
    qsa(`#${id} .exam-card`).forEach(card => card.classList.toggle('hidden-by-search', !gradeMatches(card)));
  };

  // 5. Thanh lọc theo bộ đề / vùng miền
  function setupPills(containerId, tabId) {
    qsa(`#${containerId} .pill`).forEach(p => {
      p.addEventListener('click', () => {
        qsa(`#${containerId} .pill`).forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        if (['tab-olympic30', 'tab-duyenhai', 'tab-admission'].includes(tabId)) {
          window.refreshGradeCatalogFilter(tabId);
          if (search?.value.trim()) applySearch();
          return;
        }
        const f = p.dataset.filter;
        qsa(`#${tabId} .exam-card`).forEach(card => {
          card.classList.toggle('hidden-by-search', !(f === 'ALL' || card.dataset.filter === f));
        });
      });
    });
  }

  setupPills('mockFilterPills', 'tab-mock');
  setupPills('tstFilterPills', 'tab-tst');
  setupPills('historyFilterPills', 'tab-history');
  setupPills('vmoFilterPills', 'tab-vmo');
  setupPills('olympicFilterPills', 'tab-olympic');
  setupPills('olympic30FilterPills', 'tab-olympic30');
  setupPills('duyenhaiFilterPills', 'tab-duyenhai');
  setupPills('admissionFilterPills', 'tab-admission');

  // 6. Lời giải mẫu trong tài liệu chuyên đề
  qsa('.solution-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const sol = btn.nextElementSibling;
      if (!sol) return;
      const collapsed = sol.classList.toggle('is-collapsed');
      btn.textContent = collapsed ? 'Hiện lời giải' : 'Ẩn lời giải';
      btn.setAttribute('aria-expanded', String(!collapsed));
      if (!collapsed) typeset(sol);
    });
  });

  // Nút Ẩn/Hiện toàn bộ lời giải mẫu
  const allBtn = qs('#toggleAllSolutions');
  let allShown = true;
  allBtn?.addEventListener('click', () => {
    allShown = !allShown;
    qsa('.example-solution').forEach(s => s.classList.toggle('is-collapsed', !allShown));
    qsa('.solution-toggle').forEach(b => {
      b.textContent = allShown ? 'Ẩn lời giải' : 'Hiện lời giải';
      b.setAttribute('aria-expanded', String(allShown));
    });
    allBtn.textContent = allShown ? '🙈 Ẩn toàn bộ lời giải mẫu' : '👁️ Hiện toàn bộ lời giải mẫu';
    if (allShown) typeset(qs('#book-content'));
  });

  window.printVMODocument = async function() {
    try {
      const mockPane = await ensureTabContent('tab-mock');
      window.reinitAIGuide?.(mockPane);
      window.reinitDatabaseUI?.(mockPane);
      typeset(mockPane);
    } catch (error) {
      console.warn('Không thể chuẩn bị toàn bộ nội dung để in:', error);
    }
    window.print();
  };

  // 8. Chế độ Giao diện Sáng / Tối (Theme Mode)
  const theme = qs('#themeToggle');
  const saved = localStorage.getItem('vmo-theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
    if (theme) theme.textContent = '☀️';
  }
  theme?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const d = document.body.classList.contains('dark');
    theme.textContent = d ? '☀️' : '🌙';
    localStorage.setItem('vmo-theme', d ? 'dark' : 'light');
  });

  // 9. Nút Về đầu trang (Back to Top)
  const top = qs('#backToTop');
  window.addEventListener('scroll', () => {
    if (top) top.classList.toggle('visible', window.scrollY > 700);
  }, { passive: true });
  top?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 10. IntersectionObserver để làm nổi bật mục lục khi cuộn
  const links = qsa('#sidebar-danang a[href^="#"]');
  if (links.length && window.IntersectionObserver) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(a => {
            a.classList.toggle('active-link', a.getAttribute('href') === '#' + e.target.id);
          });
        }
      });
    }, { rootMargin: '-25% 0px -65% 0px' });

    qsa('#book-content h1[id], #book-content h2[id]').forEach(h => obs.observe(h));
  }
  window.refreshEducationAccess = function() {
    const policy = window.MathAppEducation;
    if (!policy) return;
    const user = window.VMOAuth?.getSession?.();
    const isEn = window.currentLang === 'en';
    qsa('#moduleNavigation .tab-btn').forEach(button => {
      const allowed = policy.moduleAllowed(user, button.id.replace('tab-btn-', ''));
      button.hidden = !allowed;
      button.style.display = allowed ? '' : 'none';
      const pane = qs('#' + button.id.replace('tab-btn-', 'tab-'));
      if (pane && !allowed) { pane.classList.remove('active');pane.hidden = true; }
      else if (pane) pane.hidden = false;
      if (!allowed) button.classList.remove('active');
    });
    qsa('.navigation-group').forEach(group => { group.hidden = ![...group.querySelectorAll('.tab-btn')].some(button => !button.hidden); });
    const grants = policy.assigned(user);
    const summary = qs('#educationAccessSummary');
    if (summary) summary.textContent = grants.length
      ? (isEn ? 'Your levels: ' : 'Cấp học được truy cập: ') + grants.map(level => policy.labels[level][isEn ? 1 : 0]).join(' · ')
      : (isEn ? 'Awaiting education level assignment by Admin.' : 'Đang chờ Admin phân cấp học cho tài khoản.');
    for (const [key, icon] of [['primary', '🌱'], ['university', '🎓']]) {
      const button = qs('#tab-btn-' + key);if (button) button.textContent = icon + ' ' + policy.labels[key][isEn ? 1 : 0];
    }
    qsa('[data-level-title]').forEach(node => { node.textContent = policy.labels[node.dataset.levelTitle][isEn ? 1 : 0]; });
    qsa('[data-level-empty]').forEach(node => { node.textContent = isEn ? 'Learning materials for this level are being prepared. You can use Math support.' : 'Kho học liệu của cấp học này đang được xây dựng. Bạn có thể sử dụng Hỗ trợ giải toán.'; });
    if (qs('[data-pending-title]')) qs('[data-pending-title]').textContent = isEn ? 'Awaiting level assignment' : 'Chờ phân cấp học';
    if (qs('[data-pending-note]')) qs('[data-pending-note]').textContent = isEn ? 'Please contact Admin to request access to your education levels.' : 'Vui lòng liên hệ Admin để được cấp quyền nội dung theo cấp học.';
    const current = qs('#moduleNavigation .tab-btn.active:not([hidden])');
    const fallback = qs('#moduleNavigation .tab-btn:not([hidden]):not(#tab-btn-support)') || qs('#tab-btn-support:not([hidden])');
    if (!current && fallback) window.switchTab(fallback.id.replace('tab-btn-', 'tab-'), fallback);
    if (!fallback) {
      qsa('.tab-pane').forEach(pane => pane.classList.remove('active'));
      qs('#tab-pending')?.classList.add('active');
      qsa('#mainSidebar > div').forEach(node => { node.style.display = 'none'; });
      const activeLabel = qs('#activeModuleLabel');if (activeLabel) activeLabel.textContent = isEn ? 'Awaiting level assignment' : 'Chờ phân cấp học';
    }
    qsa('.hero-stats [data-catalog-stat]').forEach(node => {
      const key = node.dataset.catalogStat;
      const module = { support: 'support', mockSets: 'mock', tst: 'tst', vmo: 'vmo', olympic: 'olympic', regional: 'history', olympic30: 'olympic30', duyenhai: 'duyenhai' }[key];
      if (module) { node.parentElement.hidden = !policy.moduleAllowed(user, module);node.parentElement.style.display = node.parentElement.hidden ? 'none' : ''; }
    });
    window.refreshModuleNavigation?.();
    syncStickyOffset();
  };
  window.addEventListener('langchange', () => window.refreshEducationAccess());
  window.refreshEducationAccess();
})();
