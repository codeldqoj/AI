/**
 * HỆ THỐNG ĐA NGÔN NGỮ (VI/EN) - VMO ĐÀ NẴNG 2026-2027
 * Internationalization (i18n) Engine for National Math Olympiad Training
 */

(() => {
  // Ngôn ngữ mặc định
  let currentLang = localStorage.getItem('vmo_lang') || 'vi';
  window.currentLang = currentLang;

  // Từ điển dịch trực tiếp cho các thành phần giao diện cố định
  const UI_TRANSLATIONS = {
    en: {
      // 1. Header & Hero
      'heroBadge': 'MATHAPP · ADVANCED MATHEMATICS & OLYMPIADS',
      'heroTitle': 'Master Advanced Mathematics with Your AI Tutor',
      'heroSlogan': 'Understand deeply · Think sharply · Prepare for your next challenge.',
      'statChapters': 'Chapters',
      'statSections': 'Theory Sections',
      'statExamples': 'Solved Examples',
      'statMocks': 'Mock Exams / Day',
      'statArchive': 'Archived DN-QN Exams',

      // 2. Navigation Tabs
      'tabDanang': '📚 VMO Topic Materials',
      'tabMock': '🎯 VMO Mock Exams',
      'tabTst': '🏛️ TST Exams',
      'tabVmo': '🇻🇳 VMO Exams',
      'tabOlympic': '🌐 IMO–Olympiad Exams',
      'tabHistory': '🗂️ Da Nang–Quang Nam Archive',

      // 3. User Auth Bar
      'roleAdmin': 'Admin',
      'roleUser': 'Member',
      'btnManage': '⚙️ Account Management',
      'btnLogout': '🚪 Log out',
      'idleTitle': 'Security session: Auto-logout after 5 minutes of inactivity',

      // 4. Controls & Search
      'searchPlaceholder': 'Search Stolz, LTE, Miquel, interpolation, invariant, Chebyshev...',
      'btnPrint': '🖨️ Print',
      'pillAll': 'All Exams',
      'pillBac': 'Northern Region',
      'pillTrung': 'Central Region',
      'pillNam': 'Southern Region',
      'pillOlympic': 'Summer Camp / Olympiad',
      'pillAll12': 'All 12 Exams',
      'pillDanang6': 'Da Nang (6)',
      'pillQuangnam6': 'Quang Nam (6)',

      // 5. Sidebars
      'sidebarDanangTitle': 'TABLE OF CONTENTS (85 PAGES)',
      'sidebarTstTitle': 'TST EXAM INDEX',
      'sidebarHistoryTitle': 'DA NANG & QUANG NAM EXAM ARCHIVE',
      'tocCover': 'Document Information',
      'tocChapterIntro': 'Chapter Overview',
      'tstProvinceGroup': '🏛️ PROVINCES & SPECIALIZED SCHOOLS',
      'histDanangGroup': '🏛️ DA NANG (2019 - 2025)',
      'histQuangnamGroup': '🏛️ QUANG NAM (2019 - 2025)',

      // 6. Buttons
      'btnViewSolution': '👁️ View Solution & Rubric',
      'btnHideSolution': '🙈 Hide Solution & Rubric',
      'btnShowSolShort': 'Show Solution',
      'btnHideSolShort': 'Hide Solution',
      'btnCopyProblem': '📋 Copy Problem',
      'btnCopied': '✅ Copied',
      'btnAiGuide': '✨ AI Solution Guide',
      'btnAiGuideHide': '🙈 Hide Guide',
      'btnAiGuideCopy': '📋 Copy Guide',
      'btnAiGuideClose': '✕ Collapse',
      'profBadge': 'AI Math Tutor',

      // 7. Book Dashboard & Cover
      'coverEyebrow': 'ADVANCED TRAINING MATERIAL FOR OLYMPIAD TEAMS',
      'coverTitle': 'NATIONAL MATHEMATICAL OLYMPIAD PREPARATION',
      'coverPlace': 'DA NANG 2026 – 2027',
      'coverAudience': 'For Gifted Math Students & National Olympiad Teams',
      'coverAuthor': 'Compiled by: Tran Hoang Kien',
      'dashboardEyebrow': 'TOPIC MATERIALS OVERVIEW',
      'dashboardTitle': '85 Pages of Specialized VMO Materials',
      'dashboardDesc': 'Comprehensive systematization of 7 core mathematical branches according to modern VMO standards',
      'statDashChapters': 'CHAPTERS',
      'statDashSections': 'THEORY SECTIONS',
      'statDashExamples': 'SOLVED EXAMPLES',
      'statDashMocks': 'MOCK EXAMS',
      'statDashArchive': 'ARCHIVED EXAMS',

      // 8. Box Headings
      'boxCoreTheory': 'Core Theory & Formulations',
      'boxMethodLemma': 'Methods & Key Lemmas',
      'boxSolvedExample': 'Solved Example',
      'boxImportantRemark': 'Important Pedagogical Remark',
      'boxExamTip': 'Exam Strategy & Speed Tip',
      'boxCommonTrap': 'Common Pitfall & Caution',

      // 9. Day Titles & Problem Headers
      'day1': 'Day One',
      'day2': 'Day Two',
      'day1_num': 'Day 1',
      'day2_num': 'Day 2',

      // 10. User Management Modal
      'modalTitle': '⚙️ System User Account Management',
      'modalAddTitle': 'Add New Account',
      'modalUsername': 'Username',
      'modalPassword': 'Password',
      'modalFullName': 'Full Name',
      'modalRole': 'Role',
      'modalRoleUser': 'Member (View Only)',
      'modalRoleAdmin': 'Admin (Full Access)',
      'modalSave': 'Save Account',
      'modalListTitle': 'System Account Directory',
      'modalColUser': 'User',
      'modalColUsername': 'Username',
      'modalColRole': 'Role',
      'modalColSource': 'Source',
      'modalColAction': 'Actions',

      // 11. Login Page
      'loginBadge': '🇻🇳 VMO DA NANG 2026 - 2027',
      'loginTitle': 'SYSTEM LOGIN',
      'loginSubtitle': 'Please sign in to access advanced training materials and the national TST exam bank',
      'loginGoogle': 'Sign in / Sign up with Google',
      'loginDivider': 'or with username and password',
      'loginUsernameLabel': 'Username',
      'loginUsernamePlaceholder': 'Enter your username',
      'loginPasswordLabel': 'Password',
      'loginPasswordPlaceholder': 'Enter your password',
      'loginRemember': 'Remember login',
      'loginBtn': 'LOG IN TO SYSTEM',
      'loginFooter': '© 2026–2027 National Mathematical Olympiad Training Data System',
      'loginCompiler': 'Compiled by Tran Hoang Kien — Phan Chau Trinh High School, Da Nang',
      'loginAddress': '154 Le Loi Street — Hai Chau District — Da Nang',
      'bootstrapTitle': 'Create the First Administrator',
      'bootstrapDesc': 'The database contains no accounts. This one-time form is disabled permanently after the first administrator is created.',
      'bootstrapFullName': 'Full name',
      'bootstrapUsername': 'Administrator username',
      'bootstrapPassword': 'Administrator password',
      'bootstrapCreate': 'Create the first administrator'
    }
  };

  // Từ điển ánh xạ cụm từ toán học & tiêu đề chương
  const PHRASE_DICTIONARY = [
    // Tiêu đề chương
    ['Lời nói đầu', 'Preface'],
    ['01. Định hướng và chiến lược ôn luyện', '01. Orientation & Training Strategy'],
    ['Định hướng và chiến lược ôn luyện', 'Orientation & Training Strategy'],
    ['1.1 Cấu trúc đề và trọng số', '1.1 Exam Structure & Topic Weights'],
    ['1.2 Những xu hướng kỹ thuật cần đặc biệt chú ý', '1.2 Key Technical Trends to Focus On'],
    
    ['02. Dãy số và giới hạn dãy số', '02. Sequences & Limits'],
    ['Dãy số và giới hạn dãy số', 'Sequences & Limits of Sequences'],
    ['2.1 Đơn điệu, bị chặn và điểm bất động', '2.1 Monotonicity, Boundedness & Fixed Points'],
    ['2.2 Biến đổi truy hồi phi tuyến và tìm cấp tăng trưởng', '2.2 Non-linear Recurrences & Growth Order'],
    ['2.3 Định lý Stolz–Cesàro', '2.3 Stolz–Cesàro Theorem'],
    ['2.4 Khai triển tương đương và tốc độ hội tụ', '2.4 Asymptotic Expansions & Convergence Speed'],
    ['2.5 Dãy xác định gián tiếp qua nghiệm của phương trình', '2.5 Sequences Defined Implicitly by Equations'],
    ['2.6 Tổng, tích và chuỗi liên quan đến dãy', '2.6 Sums, Products & Series Associated with Sequences'],

    ['03. Phương trình hàm', '03. Functional Equations'],
    ['Phương trình hàm', 'Functional Equations'],
    ['3.1 Chuẩn hóa phương trình và các phép thế đặc biệt', '3.1 Normalization & Special Substitutions'],
    ['3.2 Đơn ánh, toàn ánh và nghiệm đặc biệt', '3.2 Injectivity, Surjectivity & Special Solutions'],
    ['3.3 Phép lặp và quỹ đạo', '3.3 Iterations & Orbits'],
    ['3.4 Cauchy, Jensen và các điều kiện chính quy', '3.4 Cauchy, Jensen & Regularity Conditions'],
    ['3.5 Kết hợp tính cộng với điều kiện đại số', '3.5 Additivity Combined with Algebraic Constraints'],

    ['04. Số học và dãy số học', '04. Number Theory & Arithmetic Sequences'],
    ['Số học và dãy số học', 'Number Theory & Arithmetic Sequences'],
    ['4.1 Đồng dư và Định lý phần dư Trung Hoa', '4.1 Congruences & Chinese Remainder Theorem'],
    ['4.2 Ước chung lớn nhất, Euclid và Bézout', '4.2 Greatest Common Divisor, Euclid & Bézout'],
    ['4.3 Fermat–Euler và cấp của phần tử modulo', '4.3 Fermat–Euler & Multiplicative Orders modulo'],
    ['4.4 Định giá p-adic và bổ đề LTE', '4.4 p-adic Valuation & LTE Lemma'],
    ['4.5 Phương trình nghiệm nguyên và phương trình Pell', '4.5 Diophantine Equations & Pell\'s Equations'],
    ['4.6 Hàm số học', '4.6 Arithmetic Functions'],
    ['4.7 Dãy số nguyên, Fibonacci–Lucas và chu kỳ modulo', '4.7 Integer Sequences, Fibonacci–Lucas & Modulo Cycles'],

    ['05. Hình học phẳng', '05. Euclidean Geometry'],
    ['Hình học phẳng', 'Euclidean Plane Geometry'],
    ['5.1 Góc định hướng, tứ giác nội tiếp và công suất điểm', '5.1 Directed Angles, Cyclic Quads & Power of a Point'],
    ['5.2 Trục đẳng phương, tâm đẳng phương và vị tự hai đường tròn', '5.2 Radical Axis, Radical Center & Homothety'],
    ['5.3 Ceva, Menelaus và phiên bản lượng giác', '5.3 Ceva, Menelaus & Trigonometric Variants'],
    ['5.4 Đẳng giác và đường đối trung', '5.4 Isogonal Conjugates & Symmedians'],
    ['5.5 Miquel và đồng dạng xoắn', '5.5 Miquel Points & Spiral Similarities'],
    ['5.6 Đường Simson và đường tròn Euler', '5.6 Simson Line & Euler Nine-Point Circle'],
    ['5.7 Nghịch đảo', '5.7 Inversion'],
    ['5.8 Cực và đối cực đối với đường tròn', '5.8 Pole & Polar with respect to Circles'],

    ['06. Đa thức', '06. Polynomials'],
    ['Đa thức', 'Polynomials'],
    ['6.1 Viète, Newton và đạo hàm logarit của đa thức', '6.1 Viète, Newton & Logarithmic Derivatives'],
    ['6.2 Chia hết đa thức và định lý phần dư', '6.2 Polynomial Divisibility & Remainder Theorem'],
    ['6.3 Sai phân hữu hạn và nội suy', '6.3 Finite Differences & Interpolation'],
    ['6.4 Phương trình hàm đa thức và quỹ đạo nghiệm', '6.4 Polynomial Functional Equations & Root Dynamics'],
    ['6.5 Đạo hàm, Rolle và đếm nghiệm thực', '6.5 Derivatives, Rolle\'s Theorem & Real Root Counting'],
    ['6.6 Đa thức hệ số nguyên, nghiệm hữu tỉ và modulo', '6.6 Integer Polynomials, Rational Roots & Modulo'],

    ['07. Tổ hợp', '07. Combinatorics'],
    ['Tổ hợp', 'Combinatorics'],
    ['7.1 Nguyên lý Dirichlet', '7.1 Pigeonhole Principle'],
    ['7.2 Đếm kép', '7.2 Double Counting'],
    ['7.3 Bất biến và parity', '7.3 Invariants & Parity'],
    ['7.4 Đơn biến và quá trình hữu hạn', '7.4 Monovariants & Finite Processes'],
    ['7.5 Đồ thị và tournament', '7.5 Graphs & Tournaments'],
    ['7.6 Nguyên lý cực trị', '7.6 Extremal Principle'],
    ['7.7 Lưới, phép đổi màu và đại số trên', '7.7 Grids, Colorings & Linear Algebra on'],

    ['08. Kế hoạch ôn luyện và kiểm soát chất lượng bài làm', '08. Training Plan & Examination Quality Control'],
    ['Kế hoạch ôn luyện và kiểm soát chất lượng bài làm', 'Training Plan & Exam Quality Control'],
    ['8.1 Kế hoạch 12 tuần gợi ý', '8.1 Suggested 12-Week Roadmap'],
    ['8.2 Chiến lược 180 phút', '8.2 180-Minute Exam Strategy'],
    ['8.3 Checklist trình bày bài thi', '8.3 Exam Writing & Proof Checklist'],

    ['09. Bảng tóm tắt công cụ bắt buộc', '09. Essential Mathematical Toolkit Table'],
    ['Bảng tóm tắt công cụ bắt buộc', 'Essential Mathematical Toolkit Table'],

    ['10. Đề thi thử tổng hợp theo cấu trúc Đà Nẵng 2026–2027', '10. Mock Exam 1 - Da Nang Format 2026–2027'],
    ['Đề thi thử tổng hợp theo cấu trúc Đà Nẵng 2026–2027', 'Mock Exam 1 - Da Nang Format 2026–2027'],
    ['10.1 Đề thi thử - Ngày thứ nhất', '10.1 Mock Exam - Day One'],
    ['10.2 Lời giải và thang điểm - Ngày thứ nhất', '10.2 Solution & Rubric - Day One'],

    ['11. Đề thi thử tổng hợp - Ngày thứ hai', '11. Mock Exam 1 - Day Two'],
    ['Đề thi thử tổng hợp - Ngày thứ hai', 'Mock Exam 1 - Day Two'],
    ['11.1 Lời giải và thang điểm - Ngày thứ hai', '11.1 Solution & Rubric - Day Two'],
    ['11.2 Nhận xét sau khi làm hai ngày', '11.2 Post-Exam Analysis & Review'],

    ['12. Bộ đề thi thử số 2 theo cấu trúc Đà Nẵng 2026–2027', '12. Mock Exam 2 - Da Nang Format 2026–2027'],
    ['Bộ đề thi thử số 2 theo cấu trúc Đà Nẵng 2026–2027', 'Mock Exam 2 - Da Nang Format 2026–2027'],
    ['12.1 Đề thi thử số 2 - Ngày thứ nhất', '12.1 Mock Exam 2 - Day One'],
    ['12.2 Lời giải và thang điểm - Bộ số 2, ngày thứ nhất', '12.2 Solution & Rubric - Set 2, Day One'],

    ['13. Bộ đề thi thử số 2 - Ngày thứ hai', '13. Mock Exam 2 - Day Two'],
    ['Bộ đề thi thử số 2 - Ngày thứ hai', 'Mock Exam 2 - Day Two'],
    ['13.1 Đề thi thử số 2 - Ngày thứ hai', '13.1 Mock Exam 2 - Day Two'],
    ['13.2 Lời giải và thang điểm - Bộ số 2, ngày thứ hai', '13.2 Solution & Rubric - Set 2, Day Two'],
    ['13.3 Nhận xét sau khi làm bộ thi thử số 2', '13.3 Post-Exam Analysis - Set 2'],
    ['Nguồn đối chiếu khi biên soạn', 'Reference & Compiling Sources'],

    // Tên trường & Tỉnh thành trong Đề TST
    ['Trại hè Hùng Vương XX', 'Hung Vuong Summer Camp XX'],
    ['Trường hè Đà Nẵng', 'Da Nang Summer School'],
    ['Tỉnh An Giang', 'An Giang Province'],
    ['THPT Chuyên Năng Khiếu', 'High School for the Gifted (VNU-HCM)'],
    ['TP. Cần Thơ', 'Can Tho City'],
    ['Tỉnh Hưng Yên', 'Hung Yen Province'],
    ['Tỉnh Đồng Nai', 'Dong Nai Province'],
    ['THPT Chuyên Lam Sơn', 'Lam Son Specialized High School'],
    ['Tỉnh Hà Tĩnh', 'Ha Tinh Province'],
    ['Đại học Vinh', 'Vinh University High School'],
    ['Tỉnh Thái Nguyên', 'Thai Nguyen Province'],
    ['Tỉnh Quảng Ninh', 'Quang Ninh Province'],
    ['Tỉnh Nghệ An', 'Nghe An Province'],
    ['THPT Chuyên KHTN Hà Nội', 'HUS High School for Gifted Students'],
    ['TP. Hải Phòng', 'Hai Phong City'],
    ['Tỉnh Thừa Thiên Huế', 'Thua Thien Hue Province'],
    ['Tỉnh Vĩnh Phúc', 'Vinh Phuc Province'],
    ['THPT Chuyên Bến Tre', 'Ben Tre Specialized High School'],
    ['Tỉnh Tiền Giang', 'Tien Giang Province'],
    ['Tỉnh Gia Lai', 'Gia Lai Province'],
    ['Tỉnh Đắk Lắk', 'Dak Lak Province'],
    ['Tỉnh Bắc Ninh', 'Bac Ninh Province'],
    ['Tỉnh Nam Định', 'Nam Dinh Province'],
    ['Tỉnh Hải Dương', 'Hai Duong Province'],

    // Đề lịch sử
    ['Đà Nẵng TST 2025', 'Da Nang TST 2025'],
    ['Đà Nẵng TST 2024', 'Da Nang TST 2024'],
    ['Đà Nẵng TST 2023', 'Da Nang TST 2023'],
    ['Đà Nẵng TST 2022', 'Da Nang TST 2022'],
    ['Đà Nẵng TST 2021', 'Da Nang TST 2021'],
    ['Đà Nẵng TST 2020', 'Da Nang TST 2020'],
    ['Đà Nẵng TST 2019', 'Da Nang TST 2019'],
    ['Quảng Nam TST 2025', 'Quang Nam TST 2025'],
    ['Quảng Nam TST 2024', 'Quang Nam TST 2024'],
    ['Quảng Nam TST 2023', 'Quang Nam TST 2023'],
    ['Quảng Nam TST 2022', 'Quang Nam TST 2022'],
    ['Quảng Nam TST 2021', 'Quang Nam TST 2021'],
    ['Quảng Nam TST 2020', 'Quang Nam TST 2020'],
    ['Quảng Nam TST 2019', 'Quang Nam TST 2019'],

    // Thuật ngữ bài thi & nhãn
    ['Thời gian làm bài: 180 phút', 'Time limit: 180 minutes'],
    ['Thời gian làm bài', 'Time limit'],
    ['Mỗi bài 4,0 điểm', 'Each problem 4.0 points'],
    ['Mỗi bài 5,0 điểm', 'Each problem 5.0 points'],
    ['Tổng điểm: 20 điểm', 'Total: 20 points'],
    ['Lời giải & Thang điểm', 'Solution & Scoring Rubric'],
    ['Lời giải và Thang điểm', 'Solution & Scoring Rubric'],
    ['Lời giải chi tiết', 'Detailed Solution'],
    ['Thang điểm chi tiết', 'Detailed Rubric'],
    ['Thang điểm đề xuất', 'Proposed Rubric'],
    ['Bình luận & Mở rộng', 'Commentary & Extensions'],
    ['Bình luận và Mở rộng', 'Commentary & Extensions'],
    ['Bình luận', 'Commentary'],
    ['Nhận xét sau khi làm bài', 'Post-exam Analysis'],
    ['Kiến thức & Bổ đề Chuyên toán cần nắm vững', 'Essential Theorems & Lemmas'],
    ['Ý tưởng then chốt & Phân tích của Gia sư Toán AI', 'Key Insights & AI Math Tutor\'s Analysis'],
    ['Lời giải chi tiết từng bước (Chuẩn thi HSG Quốc gia)', 'Step-by-Step Rigorous Solution (VMO Standard)'],
    ['Sai lầm phổ biến & Lưu ý khi chấm thi', 'Common Pitfalls & Scoring Notes'],
    ['Bài toán', 'Problem'],
    ['Ví dụ', 'Example'],
    ['Định lý', 'Theorem'],
    ['Bổ đề', 'Lemma'],
    ['Hệ quả', 'Corollary'],
    ['Định nghĩa', 'Definition'],
    ['Chứng minh', 'Proof'],
    ['Lời giải', 'Solution'],
    ['Nhận xét', 'Remark'],
    ['Nguồn bài toán', 'Problem Source'],
    ['Nguồn gốc', 'Origin'],
    ['Tài liệu lưu hành nội bộ', 'Internal training material'],
    ['Đội tuyển Học sinh Giỏi', 'National Olympiad Team'],
    ['Bản quyền nội dung thuộc về Nhóm chuyên môn', 'Content copyright by Mathematics Academic Group'],

    // Nhãn chủ đề và tag đề thi
    ['Dãy số – Giới hạn', 'Sequences & Limits'],
    ['Dãy số & Giới hạn', 'Sequences & Limits'],
    ['Dãy số', 'Sequences'],
    ['Hệ phương trình', 'Systems of Equations'],
    ['Phương trình', 'Equations'],
    ['Hình học & Tổ hợp', 'Geometry & Combinatorics'],
    ['Hình học', 'Geometry'],
    ['Số học', 'Number Theory'],
    ['Bất đẳng thức', 'Inequalities'],
    ['Xem ảnh đề gốc', 'View original exam image'],
    ['Xem bài đăng & lời giải gốc', 'View original post & solutions'],
    ['Đề lưu trữ · 2 ngày', 'Archived Exam · 2 Days'],
    ['Đề lưu trữ · 1 ngày', 'Archived Exam · 1 Day'],
    ['Đề chính thức', 'Official Exam']
  ];

  // Helper hàm lưu trữ văn bản gốc tiếng Việt
  function setNodeText(node, viText, enText, isEn) {
    if (!node) return;
    if (node._origViText === undefined) {
      node._origViText = viText || node.textContent;
    }
    node.textContent = isEn ? enText : node._origViText;
  }

  // Áp dụng ngôn ngữ lên toàn bộ DOM
  function applyLanguage(lang) {
    const isEn = (lang === 'en');
    window.currentLang = lang;
    document.documentElement.lang = lang;

    // 1. Cập nhật trạng thái các nút chuyển đổi ngôn ngữ
    document.querySelectorAll('.lang-switch-btn').forEach(btn => {
      const btnLang = btn.dataset.lang || (btn.id.includes('EN') ? 'en' : 'vi');
      btn.classList.toggle('active', btnLang === lang);
    });

    // 2. Cập nhật các thành phần cố định trong header & hero
    const heroBadge = document.querySelector('.hero-badge');
    if (heroBadge) setNodeText(heroBadge, 'MATHAPP · NỀN TẢNG TOÁN CHUYÊN & OLYMPIC', UI_TRANSLATIONS.en.heroBadge, isEn);
    const heroH1 = document.querySelector('.hero h1');
    if (heroH1) setNodeText(heroH1, 'Chinh phục Toán chuyên cùng Gia sư AI', UI_TRANSLATIONS.en.heroTitle, isEn);
    const heroSlogan = document.querySelector('.hero-slogan');
    if (heroSlogan) setNodeText(heroSlogan, 'Hiểu sâu bản chất · Rèn tư duy sắc bén · Vững bước đến kỳ thi lớn.', UI_TRANSLATIONS.en.heroSlogan, isEn);
    const statLabels = {
      mock: ['🎯 Bộ đề thi thử VMO', '🎯 VMO practice exams'],
      support: ['🧩 Hỗ trợ giải toán', '🧩 Problem-solving support'],
      tst: ['🏛️ Đề TST', '🏛️ TST exams'],
      vmo: ['🇻🇳 Đề VMO', '🇻🇳 VMO exams'],
      olympic: ['🌐 Đề IMO–Olympic', '🌐 IMO–Olympiad exams'],
      regional: ['🗂️ Đề Đà Nẵng–Quảng Nam', '🗂️ Da Nang–Quang Nam exams'],
      olympic30: ['🏅 Đề Olympic 30/4', '🏅 April 30 Olympiad exams'],
      duyenhai: ['🌊 Đề Duyên hải miền Bắc', '🌊 Northern Coastal exams']
    };
    document.querySelectorAll('[data-hero-stat-label]').forEach(node => {
      const labels = statLabels[node.dataset.heroStatLabel];
      if (labels) node.textContent = labels[isEn ? 1 : 0];
    });
    document.querySelectorAll('[data-stat-unit]').forEach(node => {
      node.textContent = node.dataset.statUnit === 'support' ? (isEn ? 'problems' : 'bài toán') : (isEn ? 'exams' : 'đề');
    });
    const statNote = document.querySelector('.hero-stat-note');
    if (statNote?.firstChild) statNote.firstChild.textContent = isEn ? 'Each exam day counts as one exam. ' : 'Mỗi đề/ngày thi được tính là một đề. ';
    const scopeNote = document.getElementById('supportStatsScope');
    if (scopeNote) {
      const all = document.querySelector('.hero-stats [data-catalog-stat="support"]')?.dataset.scope === 'all';
      scopeNote.textContent = isEn ? (all ? 'Standalone problems: all accounts.' : 'Standalone problems: your account.') : (all ? 'Bài toán riêng lẻ: toàn hệ thống.' : 'Bài toán riêng lẻ: của bạn.');
    }
    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) heroStats.setAttribute('aria-label', isEn ? 'Exam and problem library statistics' : 'Thống kê kho đề và bài toán');
    const brandTag = document.querySelector('.app-topbar-brand .brand-tag');
    if (brandTag) brandTag.textContent = isEn ? 'Advanced math & Olympiads' : 'Toán chuyên & Olympic';

    // 3. Thanh Tab Navigation (Định vị chính xác theo ID và hành vi onclick, không dùng chỉ mục mảng)
    const btnDanang = document.getElementById('tab-btn-danang') || document.querySelector('.tab-btn[onclick*="tab-danang"]');
    const btnMock = document.getElementById('tab-btn-mock') || document.querySelector('.tab-btn[onclick*="tab-mock"]');
    const btnTst = document.getElementById('tab-btn-tst') || document.querySelector('.tab-btn[onclick*="tab-tst"]');
    const btnHistory = document.getElementById('tab-btn-history') || document.querySelector('.tab-btn[onclick*="tab-history"]');

    if (btnDanang) setNodeText(btnDanang, '📚 Tài liệu chuyên đề VMO', UI_TRANSLATIONS.en.tabDanang, isEn);
    if (btnMock) setNodeText(btnMock, '🎯 Bộ đề thi thử VMO', UI_TRANSLATIONS.en.tabMock, isEn);
    if (btnTst) setNodeText(btnTst, '🏛️ Đề TST', UI_TRANSLATIONS.en.tabTst, isEn);
    const btnVmo = document.getElementById('tab-btn-vmo');
    if (document.getElementById('tab-btn-support')) setNodeText(document.getElementById('tab-btn-support'), '🧩 Hỗ trợ giải toán', '🧩 Math Problem Support', isEn);
    const btnOlympic = document.getElementById('tab-btn-olympic');
    if (document.getElementById('tab-btn-olympic30')) setNodeText(document.getElementById('tab-btn-olympic30'), '🏅 Đề Olympic 30/4', '🏅 April 30 Olympiad', isEn);
    if (document.getElementById('tab-btn-duyenhai')) setNodeText(document.getElementById('tab-btn-duyenhai'), '🌊 Đề Duyên hải miền Bắc', '🌊 Northern Coastal Olympiad', isEn);
    if (btnVmo) setNodeText(btnVmo, '🇻🇳 Đề VMO', UI_TRANSLATIONS.en.tabVmo, isEn);
    if (btnOlympic) setNodeText(btnOlympic, '🌐 Đề IMO–Olympic', UI_TRANSLATIONS.en.tabOlympic, isEn);
    if (btnHistory) setNodeText(btnHistory, '🗂️ Đề Đà Nẵng–Quảng Nam', UI_TRANSLATIONS.en.tabHistory, isEn);

    [
      ['navGroupLearning', 'Học tập & luyện tập', 'Learning & practice'],
      ['navGroupNational', 'Đề thi trong nước', 'Vietnamese examinations'],
      ['navGroupOlympic', 'Olympic & giao lưu', 'Olympiads & exchanges'],
      ['moduleNavigationCaption', 'Đang xem', 'Currently viewing'],
      ['moduleNavigationAction', 'Chọn mục', 'Choose section']
    ].forEach(([id, vi, en]) => { const node = document.getElementById(id); if (node) setNodeText(node, vi, en, isEn); });
    const admissionTab = document.getElementById('tab-btn-admission');
    if (admissionTab) setNodeText(admissionTab, '🎓 Đề thi vào lớp 10 chuyên', '🎓 Specialized grade-10 admissions', isEn);
    window.refreshModuleNavigation?.();

    // 4. User Auth Bar
    const btnOpenUserMgmt = document.getElementById('btnOpenUserMgmt');
    if (btnOpenUserMgmt) setNodeText(btnOpenUserMgmt, '⚙️ Quản lý tài khoản', UI_TRANSLATIONS.en.btnManage, isEn);

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) setNodeText(btnLogout, '🚪 Đăng xuất', UI_TRANSLATIONS.en.btnLogout, isEn);

    const currentUserRole = document.getElementById('currentUserRole');
    if (currentUserRole) {
      const isAdmin = currentUserRole.classList.contains('role-admin');
      currentUserRole.textContent = isAdmin ? 'Admin' : currentUserRole.classList.contains('role-teacher') ? (isEn ? 'Teacher' : 'Giáo viên') : (isEn ? 'Member' : 'Thành viên');
    }

    const userInfoChip = document.querySelector('.user-info-chip');
    if (userInfoChip) {
      userInfoChip.title = isEn ? UI_TRANSLATIONS.en.idleTitle : 'Phiên bảo mật: Tự động đăng xuất sau 5 phút không hoạt động';
    }

    const roleOptions = { student: ['Thành viên (Học tập và AI xu hướng đề)', 'Member (Learning and exam trends)'], teacher: ['Giáo viên (Quản trị dữ liệu)', 'Teacher (Content management)'], admin: ['Quản trị viên (Toàn quyền quản lý)', 'Admin (Full access)'] };
    document.querySelectorAll('#newRole option').forEach(option => { if (roleOptions[option.value]) option.textContent = roleOptions[option.value][isEn ? 1 : 0]; });
    const levelLabels = window.MathAppEducation?.labels;
    if (levelLabels) document.querySelectorAll('#newEducationLevels label').forEach(label => {
      const input = label.querySelector('input');
      if (input && levelLabels[input.value]) { label.replaceChildren(input, document.createTextNode(' ' + levelLabels[input.value][isEn ? 1 : 0])); }
    });
    const levelLegend = document.querySelector('#newEducationLevels legend');
    if (levelLegend) levelLegend.textContent = isEn ? 'Accessible levels (multiple choices)' : 'Cấp học được truy cập (chọn nhiều)';

    // 5. Controls & Search bar
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.placeholder = isEn ? UI_TRANSLATIONS.en.searchPlaceholder : 'Tìm Stolz, LTE, Miquel, nội suy, bất biến, Chebyshev...';
    }

    const printButton = document.getElementById('printDocumentButton');
    if (printButton) setNodeText(printButton, '🖨️ In', UI_TRANSLATIONS.en.btnPrint, isEn);

    // Filter pills
    const mockPills = document.querySelectorAll('#mockFilterPills .pill');
    const mockPillsEn = ['All Mock Exams (4 Days)', 'Set 1 (Da Nang)', 'Set 2 (Da Nang)'];
    mockPills.forEach((p, i) => {
      if (mockPillsEn[i]) {
        if (!p._origViText) p._origViText = p.textContent;
        p.textContent = isEn ? mockPillsEn[i] : p._origViText;
      }
    });

    const tstPills = document.querySelectorAll('#tstFilterPills .pill');
    const tstPillsEn = [UI_TRANSLATIONS.en.pillAll, UI_TRANSLATIONS.en.pillBac, UI_TRANSLATIONS.en.pillTrung, UI_TRANSLATIONS.en.pillNam, UI_TRANSLATIONS.en.pillOlympic];
    tstPills.forEach((p, i) => {
      if (tstPillsEn[i]) {
        if (!p._origViText) p._origViText = p.textContent;
        p.textContent = isEn ? tstPillsEn[i] : p._origViText;
      }
    });

    const histPills = document.querySelectorAll('#historyFilterPills .pill');
    const histPillsEn = [UI_TRANSLATIONS.en.pillAll12, UI_TRANSLATIONS.en.pillDanang6, UI_TRANSLATIONS.en.pillQuangnam6];
    histPills.forEach((p, i) => {
      if (histPillsEn[i]) {
        if (!p._origViText) p._origViText = p.textContent;
        p.textContent = isEn ? histPillsEn[i] : p._origViText;
      }
    });

    // 6. Sidebar titles
    const sbDanangTitle = document.querySelector('#sidebar-danang .sidebar-title');
    if (sbDanangTitle) setNodeText(sbDanangTitle, 'Mục lục tài liệu chuyên đề VMO', UI_TRANSLATIONS.en.sidebarDanangTitle, isEn);

    const sbMockTitle = document.querySelector('#sidebar-mock .sidebar-title');
    if (sbMockTitle) setNodeText(sbMockTitle, 'Bộ Đề Thi Thử VMO', 'VMO MOCK EXAMS', isEn);

    const sbTstTitle = document.querySelector('#sidebar-tst .sidebar-title');
    if (sbTstTitle) setNodeText(sbTstTitle, 'Mục Lục Đề TST', UI_TRANSLATIONS.en.sidebarTstTitle, isEn);

    const sbHistTitle = document.querySelector('#sidebar-history .sidebar-title');
    if (sbHistTitle) setNodeText(sbHistTitle, 'Đề Đà Nẵng – Quảng Nam', UI_TRANSLATIONS.en.sidebarHistoryTitle, isEn);

    // Mock Tab header
    const mockH2 = document.querySelector('#tab-mock .section-header-box h2');
    if (mockH2) setNodeText(mockH2, 'BỘ ĐỀ THI THỬ VMO', 'VMO MOCK EXAM SETS', isEn);

    const mockP = document.querySelector('#tab-mock .section-header-box p');
    if (mockP) setNodeText(mockP, 'Đầy đủ 2 bộ đề thi thử 2 ngày chuẩn cấu trúc VMO (tổng cộng 4 buổi thi 180 phút), cấu trúc bám sát Sở GD&ĐT Đà Nẵng: Ngày 1 (4 câu × 5 điểm), Ngày 2 (3 câu 7-6-7 điểm). Mỗi bài tập đều tích hợp AI Hướng dẫn giải, lời giải chi tiết và barem điểm từng bước.', 'Complete 2 sets of standard 2-day VMO mock exams (4 exam sessions of 180 minutes each), strictly matching Da Nang DOET exam specifications: Day 1 (4 problems × 5 points), Day 2 (3 problems 7-6-7 points). Each problem includes AI Solution Guide, detailed solutions, and step-by-step scoring rubrics.', isEn);

    const tocCoverLink = document.querySelector('.toc-cover');
    if (tocCoverLink) setNodeText(tocCoverLink, 'Thông tin tài liệu', UI_TRANSLATIONS.en.tocCover, isEn);

    document.querySelectorAll('.toc-chapter').forEach(link => {
      setNodeText(link, 'Mở đầu chương', UI_TRANSLATIONS.en.tocChapterIntro, isEn);
    });

    // 7. Dashboard & Cover
    const coverEyebrow = document.querySelector('.cover-eyebrow');
    if (coverEyebrow) setNodeText(coverEyebrow, 'TÀI LIỆU CHUYÊN SÂU BỒI DƯỠNG ĐỘI TUYỂN', UI_TRANSLATIONS.en.coverEyebrow, isEn);

    const coverH1 = document.querySelector('.document-cover h1');
    if (coverH1) setNodeText(coverH1, 'ÔN LUYỆN THI CHỌN ĐỘI TUYỂN HỌC SINH GIỎI QUỐC GIA', UI_TRANSLATIONS.en.coverTitle, isEn);

    const coverPlace = document.querySelector('.cover-place');
    if (coverPlace) setNodeText(coverPlace, 'ĐÀ NẴNG 2026 – 2027', UI_TRANSLATIONS.en.coverPlace, isEn);

    const coverAudience = document.querySelector('.cover-audience');
    if (coverAudience) setNodeText(coverAudience, 'Dành cho học sinh các lớp chuyên Toán & Đội tuyển HSGQG', UI_TRANSLATIONS.en.coverAudience, isEn);

    const coverAuthor = document.querySelector('.cover-author');
    if (coverAuthor) {
      if (coverAuthor._origViHtml === undefined) {
        coverAuthor._origViHtml = coverAuthor.innerHTML;
      }
      coverAuthor.innerHTML = isEn ? '<strong>Compiled by:</strong> Tran Hoang Kien' : coverAuthor._origViHtml;
    }

    const dbEyebrow = document.querySelector('.book-dashboard .eyebrow');
    if (dbEyebrow) setNodeText(dbEyebrow, 'TỔNG QUAN TÀI LIỆU CHUYÊN ĐỀ', UI_TRANSLATIONS.en.dashboardEyebrow, isEn);

    const dbH2 = document.querySelector('.book-dashboard h2');
    if (dbH2) setNodeText(dbH2, 'TOÁN CHUYÊN SÂU - VMO', UI_TRANSLATIONS.en.dashboardTitle, isEn);

    const dbP = document.querySelector('.book-dashboard p');
    if (dbP) setNodeText(dbP, 'Hệ thống hóa toàn diện 7 phân môn trọng điểm theo chuẩn VMO hiện đại', UI_TRANSLATIONS.en.dashboardDesc, isEn);

    const dashStatSpans = document.querySelectorAll('.dashboard-stats span');
    const dashStatEn = [
      UI_TRANSLATIONS.en.statDashChapters,
      UI_TRANSLATIONS.en.statDashSections,
      UI_TRANSLATIONS.en.statDashExamples,
      UI_TRANSLATIONS.en.statDashMocks,
      UI_TRANSLATIONS.en.statDashArchive
    ];
    dashStatSpans.forEach((el, i) => {
      if (dashStatEn[i]) {
        if (!el._origViText) el._origViText = el.textContent;
        el.textContent = isEn ? dashStatEn[i] : el._origViText;
      }
    });

    // 8. Các nút trên toàn bộ trang
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      const isSourceBox = !!btn.closest('.source-solution-box');
      const isExpanded = btn.getAttribute('aria-expanded') === 'true' || btn.textContent.includes('Ẩn') || btn.textContent.includes('Hide');
      if (isSourceBox) {
        btn.textContent = isExpanded
          ? (isEn ? '🙈 Hide Reference Solutions' : '🙈 Ẩn lời giải tham khảo')
          : (isEn ? '🔗 Reference Solutions' : '🔗 Lời giải tham khảo');
      } else {
        btn.textContent = isExpanded
          ? (isEn ? UI_TRANSLATIONS.en.btnHideSolution : '🙈 Ẩn lời giải & Thang điểm')
          : (isEn ? UI_TRANSLATIONS.en.btnViewSolution : '👁️ Xem lời giải & Thang điểm');
      }
    });

    document.querySelectorAll('.source-solution-box strong').forEach(el => {
      if (el._origViText === undefined) el._origViText = el.textContent;
      el.textContent = isEn ? 'Solution Sources:' : el._origViText;
    });

    document.querySelectorAll('.solution-toggle').forEach(btn => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.textContent = isEn ? (isExpanded ? UI_TRANSLATIONS.en.btnHideSolShort : UI_TRANSLATIONS.en.btnShowSolShort) : (isExpanded ? 'Ẩn lời giải' : 'Hiện lời giải');
    });

    document.querySelectorAll('.btn-copy').forEach(btn => {
      if (btn._origViText === undefined) btn._origViText = btn.textContent.trim();
      btn.textContent = isEn ? UI_TRANSLATIONS.en.btnCopyProblem : btn._origViText;
    });

    document.querySelectorAll('.btn-ai-guide').forEach(btn => {
      const isOpened = btn.classList.contains('active');
      btn.innerHTML = isEn
        ? (isOpened ? `<span class="guide-sparkle">🙈</span> ${UI_TRANSLATIONS.en.btnAiGuideHide}` : `<span class="guide-sparkle">✨</span> ${UI_TRANSLATIONS.en.btnAiGuide}`)
        : (isOpened ? `<span class="guide-sparkle">🙈</span> Ẩn hướng dẫn` : `<span class="guide-sparkle">✨</span> AI Hướng dẫn giải`);
    });

    // 9. Day titles & Problem IDs (Hoàn nguyên 2 chiều chuẩn xác giữa VI và EN)
    document.querySelectorAll('.day-title').forEach(el => {
      if (el._origViText === undefined) {
        el._origViText = el.textContent;
      }
      if (isEn) {
        let text = el._origViText;
        text = text.replace('Ngày thứ nhất', 'Day One')
                   .replace('Ngày 1', 'Day 1')
                   .replace('Ngày thi thứ nhất', 'First Competition Day')
                   .replace('Ngày thứ hai', 'Day Two')
                   .replace('Ngày 2', 'Day 2')
                   .replace('Ngày thi thứ hai', 'Second Competition Day');
        el.textContent = text;
      } else {
        el.textContent = el._origViText;
      }
    });

    // Problem ID label replacement (e.g. Câu 1 <-> Problem 1, Bài 1 <-> Problem 1)
    document.querySelectorAll('.problem-id span:first-child').forEach(el => {
      if (el._origViText === undefined) {
        el._origViText = el.textContent;
      }
      if (isEn) {
        const text = el._origViText;
        if (/^(Câu|Bài)\s*(\d+)/i.test(text.trim())) {
          el.textContent = text.replace(/^(Câu|Bài)\s*(\d+)/i, 'Problem $2');
        }
      } else {
        el.textContent = el._origViText;
      }
    });

    // 10. Login Page elements
    const loginBadge = document.querySelector('.login-badge');
    if (loginBadge) setNodeText(loginBadge, '🇻🇳 VMO ĐÀ NẴNG 2026 - 2027', UI_TRANSLATIONS.en.loginBadge, isEn);

    const loginTitle = document.querySelector('.login-title');
    if (loginTitle) setNodeText(loginTitle, 'ĐĂNG NHẬP HỆ THỐNG', UI_TRANSLATIONS.en.loginTitle, isEn);

    const loginSubtitle = document.querySelector('.login-subtitle');
    if (loginSubtitle) setNodeText(loginSubtitle, 'Vui lòng đăng nhập để truy cập tài liệu ôn luyện chuyên sâu và ngân hàng đề thi TST toàn quốc', UI_TRANSLATIONS.en.loginSubtitle, isEn);

    const googleBtnText = document.getElementById('googleBtnText');
    if (googleBtnText) setNodeText(googleBtnText, 'Đăng nhập / Đăng ký bằng Google', UI_TRANSLATIONS.en.loginGoogle, isEn);

    const authDividerSpan = document.querySelector('.auth-divider span');
    if (authDividerSpan) setNodeText(authDividerSpan, 'hoặc bằng tài khoản mật khẩu', UI_TRANSLATIONS.en.loginDivider, isEn);

    const usernameLabel = document.querySelector('label[for="username"]');
    if (usernameLabel) setNodeText(usernameLabel, 'Tên đăng nhập', UI_TRANSLATIONS.en.loginUsernameLabel, isEn);

    const usernameInput = document.getElementById('username');
    if (usernameInput) usernameInput.placeholder = isEn ? UI_TRANSLATIONS.en.loginUsernamePlaceholder : 'Nhập tên đăng nhập';

    const passwordLabel = document.querySelector('label[for="password"]');
    if (passwordLabel) setNodeText(passwordLabel, 'Mật khẩu', UI_TRANSLATIONS.en.loginPasswordLabel, isEn);

    const passwordInput = document.getElementById('password');
    if (passwordInput) passwordInput.placeholder = isEn ? UI_TRANSLATIONS.en.loginPasswordPlaceholder : 'Nhập mật khẩu';

    const togglePassword = document.getElementById('btnTogglePw');
    if (togglePassword) togglePassword.title = isEn ? 'Show/Hide password' : 'Hiện/Ẩn mật khẩu';

    const rememberLabelSpan = document.querySelector('.remember-label span');
    if (rememberLabelSpan) setNodeText(rememberLabelSpan, 'Ghi nhớ đăng nhập', UI_TRANSLATIONS.en.loginRemember, isEn);

    const btnLoginSpan = document.querySelector('#btnLogin span:first-child');
    if (btnLoginSpan) setNodeText(btnLoginSpan, 'Đăng nhập hệ thống', UI_TRANSLATIONS.en.loginBtn, isEn);

    const loginFooterLines = document.querySelectorAll('.login-footer p');
    if (loginFooterLines[0]) setNodeText(loginFooterLines[0], '© 2026 - 2027 Hệ thống Dữ liệu Bồi dưỡng Học sinh Giỏi Toán Quốc gia', UI_TRANSLATIONS.en.loginFooter, isEn);
    if (loginFooterLines[1]) setNodeText(loginFooterLines[1], 'Biên soạn: Trần Hoàng Kiên - THPT Phan Châu Trinh - Tp Đà Nẵng', UI_TRANSLATIONS.en.loginCompiler, isEn);
    if (loginFooterLines[2]) setNodeText(loginFooterLines[2], '154 Lê Lợi - Hải Châu - Tp Đà Nẵng', UI_TRANSLATIONS.en.loginAddress, isEn);

    const bootstrapTitle = document.querySelector('#bootstrapPanel h2');
    if (bootstrapTitle) setNodeText(bootstrapTitle, 'Khởi tạo quản trị viên đầu tiên', UI_TRANSLATIONS.en.bootstrapTitle, isEn);
    const bootstrapDesc = document.querySelector('#bootstrapPanel > p');
    if (bootstrapDesc) setNodeText(bootstrapDesc, 'Database chưa có tài khoản. Biểu mẫu này chỉ hoạt động một lần và sẽ tự khóa sau khi quản trị viên được tạo.', UI_TRANSLATIONS.en.bootstrapDesc, isEn);
    const bootstrapFullNameLabel = document.querySelector('label[for="bootstrapFullName"]');
    if (bootstrapFullNameLabel) setNodeText(bootstrapFullNameLabel, 'Họ và tên', UI_TRANSLATIONS.en.bootstrapFullName, isEn);
    const bootstrapUsernameLabel = document.querySelector('label[for="bootstrapUsername"]');
    if (bootstrapUsernameLabel) setNodeText(bootstrapUsernameLabel, 'Tên đăng nhập quản trị', UI_TRANSLATIONS.en.bootstrapUsername, isEn);
    const bootstrapPasswordLabel = document.querySelector('label[for="bootstrapPassword"]');
    if (bootstrapPasswordLabel) setNodeText(bootstrapPasswordLabel, 'Mật khẩu quản trị', UI_TRANSLATIONS.en.bootstrapPassword, isEn);
    const bootstrapFullNameInput = document.getElementById('bootstrapFullName');
    if (bootstrapFullNameInput) bootstrapFullNameInput.placeholder = isEn ? 'Enter full name' : 'Nhập họ và tên';
    const bootstrapUsernameInput = document.getElementById('bootstrapUsername');
    if (bootstrapUsernameInput) bootstrapUsernameInput.placeholder = isEn ? 'At least 3 characters' : 'Tối thiểu 3 ký tự';
    const bootstrapPasswordInput = document.getElementById('bootstrapPassword');
    if (bootstrapPasswordInput) bootstrapPasswordInput.placeholder = isEn ? 'At least 8 characters' : 'Tối thiểu 8 ký tự';
    const bootstrapButton = document.querySelector('#btnBootstrap span');
    if (bootstrapButton) setNodeText(bootstrapButton, 'Tạo quản trị viên đầu tiên', UI_TRANSLATIONS.en.bootstrapCreate, isEn);

    if (document.querySelector('.login-card')) {
      document.title = isEn
        ? 'Login | VMO Da Nang 2026–2027 & National TST'
        : 'Đăng nhập | Ôn luyện VMO Đà Nẵng 2026 - 2027 & TST Toàn Quốc';
    } else {
      document.title = isEn
        ? 'MathApp | Master Advanced Mathematics with Your AI Tutor'
        : 'MathApp | Chinh phục Toán chuyên cùng Gia sư AI';
    }

    // 11. Duyệt qua từ điển cụm từ để dịch các tiêu đề, đề mục và nội dung
    translateDocumentText(isEn);

    // 12. Bắn sự kiện thay đổi ngôn ngữ để các engine khác đồng bộ
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));

    // Dịch toàn bộ phần nội dung dài/dữ liệu động sau khi các module khác đã
    // đồng bộ nút và modal. Công thức LaTeX được i18n_content.js bảo vệ riêng.
    window.VMOContentI18n?.apply(lang);
  }

  // Thuật toán quét và dịch các khối văn bản chuyên môn
  function translateDocumentText(isEn) {
    const targetSelectors = [
      '.sidebar a.nav-link',
      '.sidebar details.toc-group summary',
      '.nav-year-title',
      '.chapter-heading',
      '.chapter-kicker',
      '.section-heading',
      '.box-heading',
      '.exam-title',
      '.tag',
      '.badge-topic',
      '.archive-link',
      'h3.unnumbered',
      '.section-header-box h2'
    ];

    targetSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        // Bỏ qua nếu có công thức MathJax phức tạp đang render
        if (el.querySelector('.MathJax') || el.querySelector('mjx-container')) return;

        if (el._origViText === undefined) {
          el._origViText = el.textContent.trim();
        }

        if (isEn) {
          let currentText = el._origViText;
          let matched = false;

          for (const [viPhrase, enPhrase] of PHRASE_DICTIONARY) {
            if (currentText === viPhrase) {
              currentText = enPhrase;
              matched = true;
              break;
            } else if (currentText.includes(viPhrase)) {
              currentText = currentText.replace(viPhrase, enPhrase);
              matched = true;
            }
          }

          if (matched) {
            el.textContent = currentText;
          }
        } else {
          el.textContent = el._origViText;
        }
      });
    });
  }

  // Hàm công khai chuyển đổi ngôn ngữ
  window.setLanguage = function(lang) {
    if (lang !== 'vi' && lang !== 'en') return;
    localStorage.setItem('vmo_lang', lang);
    applyLanguage(lang);
  };

  // Nội dung TST/History/MongoDB được chèn động khi đổi tab. Các module khác
  // gọi hàm này để áp dụng lại đúng ngôn ngữ hiện tại.
  window.applyCurrentLanguage = function() {
    applyLanguage(window.currentLang || currentLang);
  };

  // Tự động chèn thanh gạt ngôn ngữ nếu chưa có
  function injectLanguageSwitcher() {
    // 1. Chèn vào thanh nav-tabs của index.html (trước nút themeToggle)
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle && !document.getElementById('mainLangSwitcher')) {
      const wrap = document.createElement('div');
      wrap.className = 'lang-switch-wrap';
      wrap.id = 'mainLangSwitcher';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', 'Ngôn ngữ / Language');
      wrap.innerHTML = `
        <button type="button" class="lang-switch-btn ${currentLang === 'vi' ? 'active' : ''}" data-lang="vi" onclick="setLanguage('vi')" title="Tiếng Việt">🇻🇳 VI</button>
        <button type="button" class="lang-switch-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" onclick="setLanguage('en')" title="English">🇬🇧 EN</button>
      `;
      themeToggle.parentNode.insertBefore(wrap, themeToggle);
    }

    // 2. Chèn vào góc trên bên phải của login.html
    const loginCard = document.querySelector('.login-card');
    if (loginCard && !document.getElementById('loginLangSwitcher')) {
      const loginWrap = document.createElement('div');
      loginWrap.className = 'login-lang-container';
      loginWrap.id = 'loginLangSwitcher';
      loginWrap.innerHTML = `
        <div class="lang-switch-wrap" role="group" aria-label="Ngôn ngữ / Language">
          <button type="button" class="lang-switch-btn ${currentLang === 'vi' ? 'active' : ''}" data-lang="vi" onclick="setLanguage('vi')" title="Tiếng Việt">🇻🇳 VI</button>
          <button type="button" class="lang-switch-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" onclick="setLanguage('en')" title="English">🇬🇧 EN</button>
        </div>
      `;
      loginCard.style.position = 'relative';
      loginCard.appendChild(loginWrap);
    }

    // Áp dụng ngôn ngữ hiện tại ngay khi sẵn sàng
    applyLanguage(currentLang);
  }

  // Khởi động khi tải xong DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectLanguageSwitcher);
  } else {
    injectLanguageSwitcher();
  }
})();
