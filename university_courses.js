/* Course names supplied for MathApp's university catalog. */
(function(root) {
  // Mirrors the theory section IDs/titles; checked against all ten books in tests.
  const sectionsByCourse = {
  "eas-305": [
    {
      "id": "models",
      "title": "Mô hình xác suất và biến cố",
      "number": 1
    },
    {
      "id": "conditioning",
      "title": "Xác suất có điều kiện, Bayes và chẩn đoán",
      "number": 2
    },
    {
      "id": "discrete",
      "title": "Biến ngẫu nhiên rời rạc và các phân bố chuẩn",
      "number": 3
    },
    {
      "id": "continuous",
      "title": "Biến liên tục, CDF và phân bố mũ–chuẩn",
      "number": 4
    },
    {
      "id": "joint-transform",
      "title": "Phân bố đồng thời, độc lập và biến đổi",
      "number": 5
    },
    {
      "id": "moments",
      "title": "Kỳ vọng, phương sai, hiệp phương sai và hàm sinh moment",
      "number": 6
    },
    {
      "id": "limits",
      "title": "Luật số lớn, CLT và xấp xỉ",
      "number": 7
    },
    {
      "id": "processes",
      "title": "Quá trình Poisson, Markov và độ tin cậy",
      "number": 8
    }
  ],
  "mth-435": [
    {
      "id": "modular",
      "title": "Số học modulo, Euclid và nghịch đảo",
      "number": 1
    },
    {
      "id": "groups-fields",
      "title": "Nhóm cyclic, trường hữu hạn và logarit rời rạc",
      "number": 2
    },
    {
      "id": "symmetric",
      "title": "Mã hóa đối xứng, one-time pad và chế độ hoạt động",
      "number": 3
    },
    {
      "id": "hash-mac",
      "title": "Hàm băm, MAC và mã hóa xác thực",
      "number": 4
    },
    {
      "id": "rsa",
      "title": "RSA: phép toán, tính đúng và giới hạn textbook",
      "number": 5
    },
    {
      "id": "dh-elgamal",
      "title": "Diffie–Hellman và ElGamal",
      "number": 6
    },
    {
      "id": "signatures",
      "title": "Chữ ký số, chứng thư và chống phát lại",
      "number": 7
    },
    {
      "id": "security",
      "title": "Mô hình an toàn, reduction và chi phí tấn công",
      "number": 8
    }
  ],
  "cse-191": [
    {
      "id": "logic",
      "title": "Logic mệnh đề, lượng từ và đặc tả",
      "number": 1
    },
    {
      "id": "proof-induction",
      "title": "Chứng minh, quy nạp và bất biến vòng lặp",
      "number": 2
    },
    {
      "id": "sets-relations",
      "title": "Tập hợp, ánh xạ, quan hệ và lớp tương đương",
      "number": 3
    },
    {
      "id": "counting",
      "title": "Hoán vị, tổ hợp và hệ số nhị thức",
      "number": 4
    },
    {
      "id": "pigeonhole-inclusion",
      "title": "Dirichlet, bù trừ và đếm xác suất rời rạc",
      "number": 5
    },
    {
      "id": "recurrences",
      "title": "Truy hồi và hàm sinh",
      "number": 6
    },
    {
      "id": "graphs",
      "title": "Đồ thị, đường đi và liên thông",
      "number": 7
    },
    {
      "id": "trees-boolean",
      "title": "Cây, cây khung và đại số Boolean",
      "number": 8
    }
  ],
  "cse-496": [
    {
      "id": "correctness-cost",
      "title": "Đặc tả, tính đúng và ký hiệu tiệm cận",
      "number": 1
    },
    {
      "id": "divide-conquer",
      "title": "Chia để trị và giải truy hồi thời gian",
      "number": 2
    },
    {
      "id": "sorting-structures",
      "title": "Sắp xếp, heap, bảng băm và chặn dưới",
      "number": 3
    },
    {
      "id": "dynamic-programming",
      "title": "Quy hoạch động và khôi phục lời giải",
      "number": 4
    },
    {
      "id": "greedy-amortized",
      "title": "Tham lam, trao đổi và phân tích khấu hao",
      "number": 5
    },
    {
      "id": "shortest-paths",
      "title": "Tìm kiếm đồ thị, DAG và đường đi ngắn nhất",
      "number": 6
    },
    {
      "id": "flow-matching",
      "title": "Luồng cực đại, lát cắt và ghép cặp",
      "number": 7
    },
    {
      "id": "complexity",
      "title": "P, NP, phép giảm và thuật toán xấp xỉ",
      "number": 8
    }
  ],
  "mth-309": [
    {
      "id": "systems",
      "title": "Hệ phương trình tuyến tính và khử Gauss",
      "number": 1
    },
    {
      "id": "matrix-lu",
      "title": "Ma trận, nghịch đảo và phân tích LU",
      "number": 2
    },
    {
      "id": "spaces-bases",
      "title": "Không gian vectơ, cơ sở và tọa độ",
      "number": 3
    },
    {
      "id": "maps-rank",
      "title": "Ánh xạ tuyến tính, kernel và định lý hạng–không gian-không",
      "number": 4
    },
    {
      "id": "determinants",
      "title": "Định thức, định hướng và khả nghịch",
      "number": 5
    },
    {
      "id": "eigenvalues",
      "title": "Trị riêng, chéo hóa và động lực tuyến tính",
      "number": 6
    },
    {
      "id": "orthogonality",
      "title": "Tích vô hướng, trực giao hóa và bình phương tối thiểu",
      "number": 7
    },
    {
      "id": "svd-quadratic",
      "title": "Định lý phổ, SVD và dạng toàn phương",
      "number": 8
    }
  ],
  "mth-142": [
    {
      "id": "substitution-parts",
      "title": "Đổi biến và tích phân từng phần",
      "number": 1
    },
    {
      "id": "rational-trig",
      "title": "Phân thức hữu tỉ và tích phân lượng giác",
      "number": 2
    },
    {
      "id": "improper",
      "title": "Tích phân suy rộng và tiêu chuẩn hội tụ",
      "number": 3
    },
    {
      "id": "applications",
      "title": "Ứng dụng tích phân: hình học, công và giá trị trung bình",
      "number": 4
    },
    {
      "id": "sequences",
      "title": "Dãy số, giới hạn và truy hồi",
      "number": 5
    },
    {
      "id": "series",
      "title": "Chuỗi số và các tiêu chuẩn hội tụ",
      "number": 6
    },
    {
      "id": "taylor",
      "title": "Chuỗi lũy thừa, Taylor và sai số xấp xỉ",
      "number": 7
    },
    {
      "id": "parametric-polar-ode",
      "title": "Đường tham số, tọa độ cực và phương trình vi phân nhập môn",
      "number": 8
    }
  ],
  "mth-141": [
    {
      "id": "functions",
      "title": "Hàm số, miền xác định và các mô hình cơ bản",
      "number": 1
    },
    {
      "id": "limits",
      "title": "Giới hạn và phép biến đổi tương đương",
      "number": 2
    },
    {
      "id": "continuity",
      "title": "Liên tục, giá trị trung gian và tồn tại nghiệm",
      "number": 3
    },
    {
      "id": "derivative",
      "title": "Đạo hàm từ định nghĩa và xấp xỉ tuyến tính",
      "number": 4
    },
    {
      "id": "rules",
      "title": "Quy tắc đạo hàm, hàm ngược và đạo hàm ẩn",
      "number": 5
    },
    {
      "id": "mean-value",
      "title": "Định lý giá trị trung bình và khảo sát hàm",
      "number": 6
    },
    {
      "id": "optimization",
      "title": "Tối ưu, tốc độ liên quan và phương pháp Newton",
      "number": 7
    },
    {
      "id": "integral-ftc",
      "title": "Nguyên hàm, tổng Riemann và định lý cơ bản",
      "number": 8
    }
  ],
  "mth-311": [
    {
      "id": "proof-language",
      "title": "Ngôn ngữ chứng minh và cấu trúc lập luận",
      "number": 1
    },
    {
      "id": "sets-functions",
      "title": "Tập hợp, ảnh, nghịch ảnh và ánh xạ",
      "number": 2
    },
    {
      "id": "induction-order",
      "title": "Quy nạp mạnh, đệ quy và nguyên lý thứ tự tốt",
      "number": 3
    },
    {
      "id": "relations-orders",
      "title": "Quan hệ tương đương, phân hoạch và thứ tự",
      "number": 4
    },
    {
      "id": "cardinality",
      "title": "Đếm được, song ánh và lập luận đường chéo",
      "number": 5
    },
    {
      "id": "real-completeness",
      "title": "Tính đầy đủ của R, supremum và dãy Cauchy",
      "number": 6
    },
    {
      "id": "metric-continuity",
      "title": "Khoảng cách, liên tục và compact",
      "number": 7
    },
    {
      "id": "structures",
      "title": "Cấu trúc đại số, đa thức và tư duy trừu tượng",
      "number": 8
    }
  ],
  "mth-411": [
    {
      "id": "measure",
      "title": "Không gian đo, sigma-đại số và độ đo xác suất",
      "number": 1
    },
    {
      "id": "integration",
      "title": "Kỳ vọng Lebesgue, Tonelli, Fatou và DCT",
      "number": 2
    },
    {
      "id": "independence-bc",
      "title": "Độc lập, biến cố giới hạn và Borel–Cantelli",
      "number": 3
    },
    {
      "id": "convergence",
      "title": "Các kiểu hội tụ và tính khả tích đều",
      "number": 4
    },
    {
      "id": "conditional-expectation",
      "title": "Kỳ vọng có điều kiện và phép chiếu L2",
      "number": 5
    },
    {
      "id": "limit-laws",
      "title": "Luật số lớn, CLT và hàm đặc trưng",
      "number": 6
    },
    {
      "id": "martingales",
      "title": "Markov, martingale và thời điểm dừng",
      "number": 7
    },
    {
      "id": "concentration-mcmc",
      "title": "Tập trung xác suất, coupling và MCMC",
      "number": 8
    }
  ],
  "sta-301": [
    {
      "id": "data-sampling",
      "title": "Dữ liệu, lấy mẫu và mô tả thống kê",
      "number": 1
    },
    {
      "id": "estimation",
      "title": "Ước lượng điểm, likelihood và tính không chệch",
      "number": 2
    },
    {
      "id": "intervals",
      "title": "Khoảng tin cậy và sai số chuẩn",
      "number": 3
    },
    {
      "id": "tests",
      "title": "Kiểm định giả thuyết, p-value và công suất",
      "number": 4
    },
    {
      "id": "comparisons",
      "title": "So sánh hai nhóm, cặp ghép và ANOVA",
      "number": 5
    },
    {
      "id": "regression",
      "title": "Hồi quy tuyến tính và kiểm tra phần dư",
      "number": 6
    },
    {
      "id": "categorical",
      "title": "Dữ liệu phân loại, chi bình phương và kiểm định hạng",
      "number": 7
    },
    {
      "id": "bayes-bootstrap",
      "title": "Bayes, dự đoán hậu nghiệm và bootstrap",
      "number": 8
    }
  ]
};
  let courses = [
    ['mth-141','MTH 141','College Calculus I','Giải tích 1'],
    ['mth-142','MTH 142','College Calculus II','Giải tích 2'],
    ['cse-191','CSE 191','Discrete Structures','Toán rời rạc'],
    ['mth-309','MTH 309','Introductory Linear Algebra','Đại số tuyến tính'],
    ['eas-305','EAS 305','Applied Probability','Xác suất ứng dụng'],
    ['sta-301','STA 301','Probability & Statistics','Xác suất và Thống kê'],
    ['cse-496','CSE 496','Algorithms and Complexity','Thuật toán và Độ phức tạp'],
    ['mth-411','MTH 411','Probability Theory','Lý thuyết xác suất nâng cao'],
    ['mth-435','MTH 435','Introduction to Cryptography','Mật mã học cơ sở'],
    ['mth-311','MTH 311','Introduction to Higher Mathematics','Toán học cao cấp']
  ].map(([id,code,name,nameVi])=>Object.freeze({id,code,name,nameVi,sections:Object.freeze(sectionsByCourse[id].map(section=>Object.freeze(section)))}));
  const course = id => courses.find(item=>item.id===id)||null;
  const section = (courseId,id) => course(courseId)?.sections.find(item=>item.id===id)||null;
  const normalizedTitle = value => String(value||'').normalize('NFC').replace(/^\s*\d+[.)]\s*/, '').trim().toLocaleLowerCase('vi');
  const examSection = exam => {
    if(exam.sectionId) return section(exam.courseId,exam.sectionId);
    return course(exam.courseId)?.sections.find(item=>normalizedTitle(item.title)===normalizedTitle(exam.title))||null;
  };
  const defaults=courses;
  function installCatalog(rows) {
    if(!Array.isArray(rows))return;
    const merged=new Map(defaults.map(c=>[c.id,c]));
    for(const c of rows)if(c&&/^[a-z0-9-]{1,90}$/.test(c.id)&&typeof c.code==='string'&&typeof c.nameVi==='string'&&Array.isArray(c.sections)) {
      merged.set(c.id,Object.freeze({...c,sections:Object.freeze(c.sections.filter(s=>s&&/^[a-z0-9-]{1,90}$/.test(s.id)&&typeof s.title==='string').map(s=>Object.freeze({...s})))}));
    }
    courses=[...merged.values()];
  }
  const dayLabel=n=>`Ngày thi thứ ${['','nhất','hai','ba','tư','năm','sáu','bảy','tám','chín','mười'][n]||n}`;
  root.MathAppUniversity = Object.freeze({get courses(){return Object.freeze([...courses]);},course,section,examSection,installCatalog,dayLabel});
})(typeof window !== 'undefined' ? window : globalThis);
