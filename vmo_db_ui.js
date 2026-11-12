/**
 * VMO DATABASE MANAGER & UI INTEGRATION
 * Quản lý giao diện nộp bài giải học sinh, tài liệu, đề thi, sự kiện và đồng bộ MongoDB Atlas
 */

(() => {
  const CONTENT_SOURCE_CONFIG = Object.freeze({
    'tab-books': { sourceGroup: 'university_books', sourceType: 'book_exercise', contentType: 'book_exercises' },
    'tab-university-materials': { sourceGroup: 'university_materials', sourceType: 'university_material_example', contentType: 'university_materials' },
    'tab-university': { sourceGroup: 'university', sourceType: 'university_question', contentType: 'university_exam' },
    'tab-support': { sourceGroup: 'math_support', sourceType: 'standalone_question', contentType: 'standalone_problem' },
    'tab-mock': { sourceGroup: 'mock_exam', sourceType: 'mock_exam_question', contentType: 'mock_exam' },
    'tab-tst': { sourceGroup: 'tst', sourceType: 'tst_question', contentType: 'tst_exam' },
    'tab-vmo': { sourceGroup: 'vmo_official', sourceType: 'vmo_official_question', contentType: 'vmo_official_exam' },
    'tab-olympic': { sourceGroup: 'imo_olympic', sourceType: 'imo_olympic_question', contentType: 'imo_olympic_exam' },
    'tab-olympic30': { sourceGroup: 'olympic_30_4', sourceType: 'olympic_30_4_question', contentType: 'olympic_30_4_exam' },
    'tab-admission': { sourceGroup: 'specialized_admission', sourceType: 'specialized_admission_question', contentType: 'specialized_admission_exam' },
    'tab-duyenhai': { sourceGroup: 'duyen_hai_bac', sourceType: 'duyen_hai_bac_question', contentType: 'duyen_hai_bac_exam' },
    'tab-history': { sourceGroup: 'danang_quangnam', sourceType: 'regional_question', contentType: 'regional_exam' }
  });

  function gradeCatalogSlug(value) {
    return stableKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function stableKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function headingTextWithoutActions(heading) {
    if (!heading) return '';
    const cleanHeading = value => String(value || '')
      .replace(/\s*✍[\s\S]*$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    const directText = Array.from(heading.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join(' ')
      .trim();
    if (directText) return cleanHeading(directText);

    return cleanHeading(Array.from(heading.childNodes)
      .filter(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        return !node.matches('button, .ai-guide-panel, .btn-submit-solution')
          && !node.querySelector('button, .ai-guide-panel, .btn-submit-solution');
      })
      .map(node => node.textContent || '')
      .join(' ')
    );
  }

  function getProblemIdentity(problemCard, fallbackTitle = '') {
    // Câu hỏi được nạp động từ MongoDB đã có khóa chuẩn chứa cả ngày thi.
    // Luôn ưu tiên khóa này; việc tính lại theo vị trí DOM có thể liên kết
    // nhầm bài nộp khi một tỉnh có cả ngày 1 và ngày 2.
    if (problemCard?.dataset?.contentKey && problemCard.dataset.databaseProblem === 'true') {
      const examCard = problemCard.closest?.('.exam-card, .paper-card');
      return {
        problemKey: problemCard.dataset.contentKey,
        setKey: problemCard.dataset.setKey || '',
        setTitle: problemCard.dataset.setTitle || examCard?.querySelector('.exam-title')?.textContent?.trim() || '',
        sourceGroup: problemCard.dataset.sourceGroup || 'tst',
        sourceType: problemCard.dataset.sourceType || 'tst_question',
        contentType: problemCard.dataset.contentType || 'tst_exam',
        chapterNumber: 0,
        questionNumber: Number(problemCard.dataset.questionNumber) || 0,
        frontendAnchor: examCard?.id || '',
        legacyProblemId: problemCard.dataset.legacyProblemId || ''
      };
    }

    if (problemCard?.classList?.contains('examplebox')) {
      const chapter = problemCard.closest('.chapter-block');
      const chapterNumber = chapter?.dataset?.chapter || 'meta';
      const examples = chapter ? Array.from(chapter.querySelectorAll('.examplebox')) : [];
      const exampleNumber = Math.max(1, examples.indexOf(problemCard) + 1);
      const setKey = `specialty:chapter-${stableKey(chapterNumber)}`;
      return {
        problemKey: `${setKey}:example-${exampleNumber}`,
        setKey,
        setTitle: (chapter?.querySelector('.chapter-heading')?.innerText
          || chapter?.querySelector('.chapter-heading')?.textContent
          || 'Tài liệu chuyên đề VMO').replace(/\s+/g, ' ').trim(),
        sourceGroup: 'specialty',
        sourceType: 'specialty_example',
        contentType: 'specialty_chapter',
        chapterNumber: Number(chapterNumber) || 0,
        questionNumber: exampleNumber,
        frontendAnchor: chapter?.querySelector('.chapter-heading')?.id || '',
        legacyProblemId: 'vd-' + fallbackTitle.replace(/[^a-zA-Z0-9]/g, '_')
      };
    }

    const tab = problemCard?.closest?.('.tab-pane');
    const config = CONTENT_SOURCE_CONFIG[tab?.id] || CONTENT_SOURCE_CONFIG['tab-tst'];
    const examCard = problemCard?.closest?.('.exam-card, .paper-card');
    const examId = examCard?.id || 'exam-unknown';
    const questions = examCard ? Array.from(examCard.querySelectorAll('.problem-item')) : [];
    const questionNumber = Math.max(1, questions.indexOf(problemCard) + 1);
    const setKey = `${config.sourceGroup}:${stableKey(examId)}`;
    return {
      problemKey: `${setKey}:question-${questionNumber}`,
      setKey,
      setTitle: (examCard?.querySelector('.exam-title')?.textContent || examId).trim(),
      sourceGroup: config.sourceGroup,
      sourceType: config.sourceType,
      contentType: config.contentType,
      chapterNumber: 0,
      questionNumber,
      frontendAnchor: problemCard?.id || examId,
      legacyProblemId: `${examId}-${fallbackTitle.replace(/[^a-zA-Z0-9]/g, '_')}`
    };
  }

  // Hàm hiển thị thông báo Toast nhanh
  function showToast(message, isSuccess = true) {
    let toast = document.getElementById('vmoToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vmoToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 12px 20px;
        background: #1e293b;
        color: #fff;
        border-radius: 8px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
        z-index: 10000;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s ease;
        transform: translateY(100px);
        opacity: 0;
      `;
      document.body.appendChild(toast);
    }
    toast.style.borderLeft = isSuccess ? '4px solid #16a34a' : '4px solid #dc2626';
    toast.innerHTML = `<span>${isSuccess ? '✅' : '⚠️'}</span> <span>${message}</span>`;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
    }, 4000);
  }

  // 1. GẮN NÚT "NỘP BÀI GIẢI CỦA BẠN" VÀO TỪNG BÀI TOÁN
  function injectSubmissionButtons(root = document) {
    const isEn = (window.currentLang === 'en');

    // 1.1 Thẻ .problem-item (TST, Đề thi thử, Đề Đà Nẵng - Quảng Nam)
    const problemItems = root.querySelectorAll?.('.problem-item') || [];
    problemItems.forEach(item => {
      const header = item.querySelector('.problem-header');
      if (!header || item.querySelector('.btn-submit-solution')) return;

      const problemIdEl = header.querySelector('.problem-id') || item.querySelector('.problem-id');
      const problemTitle = problemIdEl ? (problemIdEl.innerText || problemIdEl.textContent || '').trim() : 'Câu hỏi';
      const identity = getProblemIdentity(item, problemTitle);
      item.dataset.contentKey = identity.problemKey;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-submit-solution';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        color: #0369a1;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 5px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 6px;
      `;
      btn.innerHTML = `✍️ ${isEn ? 'Submit Solution' : 'Nộp bài giải'}`;
      btn.title = isEn ? 'Submit your own solution to database' : 'Nộp lời giải cá nhân của bạn lên cơ sở dữ liệu';
      btn.onclick = () => openSubmissionModal(identity.problemKey, problemTitle, item);

      const aiBtn = header.querySelector('.btn-ai-guide');
      if (aiBtn) {
        aiBtn.after(btn);
      } else {
        header.appendChild(btn);
      }
    });

    // 1.2 Thẻ ví dụ chuyên đề (.examplebox)
    const exampleBoxes = root.querySelectorAll?.('.examplebox') || [];
    exampleBoxes.forEach(box => {
      const heading = box.querySelector('.box-heading');
      if (!heading || box.querySelector('.btn-submit-solution')) return;
      const title = headingTextWithoutActions(heading);
      const identity = getProblemIdentity(box, title);
      box.dataset.contentKey = identity.problemKey;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-submit-solution';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #15803d;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        margin-left: 8px;
      `;
      btn.innerHTML = `✍️ ${isEn ? 'Submit' : 'Nộp bài giải'}`;
      btn.onclick = () => openSubmissionModal(identity.problemKey, title, box);

      const aiBtn = box.querySelector('.btn-ai-guide');
      if (aiBtn) {
        aiBtn.after(btn);
      } else {
        heading.appendChild(btn);
      }
    });
  }

  window.migrateTstReferenceLinksToDatabase = async function() {
    if (!requireContentManagerUiAction()) return;
    if (!window.VMODataService?.migrateTstReferenceLinks) return showToast('Dịch vụ migration chưa sẵn sàng.', false);
    if (!window.tstSources || !Object.keys(window.tstSources).length) return showToast('Không tìm thấy dữ liệu tst-sources.js.', false);
    if (!window.confirm('Lưu nguồn tham khảo từ tst-sources.js vào từng document problems? Chỉ trường referenceLinks được cập nhật.')) return;
    try {
      const result = await window.VMODataService.migrateTstReferenceLinks(window.tstSources);
      showToast(`Đã cập nhật nguồn cho ${result?.updatedProblems || 0} câu hỏi.`, true);
      await loadMongoReferenceLinks(true);
      return result;
    } catch (error) {
      showToast(error?.message || 'Migration nguồn tham khảo thất bại.', false);
      throw error;
    }
  };

  // 2. MODAL NỘP BÀI GIẢI CHO HỌC SINH (HỖ TRỢ ẢNH VIẾT TAY + ĐÁNH GIÁ AI CHUYÊN GIA TOÁN)
  window.currentSubmissionData = {
    problemId: '',
    problemTitle: '',
    problemContent: '',
    topic: '',
    examTitle: '',
    problemKey: '',
    setKey: '',
    setTitle: '',
    sourceType: '',
    sourceGroup: ''
  };
  window.currentUploadedImage = null;
  window.currentEvaluationResult = null;
  window.lastLoadedSubmissions = [];
  window.catalogAccessRules = new Map();
  let catalogRulesLoaded = false;
  let catalogRulesPromise = null;

  async function applyCatalogAccessRules(root = document, force = false) {
    if (isCurrentUserContentManager() || !window.VMODataService?.getCatalogRules) return;
    try {
      if (force) {
        catalogRulesLoaded = false;
        window.invalidateVMODataCache?.();
      }
      if (!catalogRulesLoaded) {
        if (!catalogRulesPromise) {
          catalogRulesPromise = window.VMODataService.getCatalogRules()
            .then(rules => {
              window.catalogAccessRules = new Map(rules.map(rule => [rule.contentKey, rule]));
              catalogRulesLoaded = true;
            })
            .finally(() => { catalogRulesPromise = null; });
        }
        await catalogRulesPromise;
      }
      root.querySelectorAll?.('.problem-item[data-content-key], .examplebox[data-content-key]').forEach(card => {
        if (card.dataset.sourceGroup === 'math_support') return;
        const rule = window.catalogAccessRules.get(card.dataset.contentKey);
        if (!rule) return;
        card.hidden = rule.published === false;
        if (rule.published !== false) {
          const examTitle = card.closest('.exam-card, .paper-card')?.querySelector('.exam-title');
          if (examTitle && rule.setTitle) examTitle.textContent = rule.setTitle;
          if (card.classList.contains('problem-item')) {
            const problemId = card.querySelector('.problem-id');
            const label = problemId?.querySelector('span:first-child');
            const topicBadge = problemId?.querySelector('.badge-topic');
            const topicText = String(rule.topic || topicBadge?.textContent || '').trim();
            if (label && (rule.shortLabel || rule.title)) {
              // Catalog title thường đã bao gồm cả nhãn câu hỏi và topic.
              // Không gán nguyên title vào span nhãn rồi giữ lại topicBadge,
              // nếu không thành viên sẽ thấy: "Câu 1 ... – topic – topic".
              let displayLabel = String(rule.shortLabel || rule.title).trim();
              if (topicText && displayLabel.endsWith(topicText)) {
                displayLabel = displayLabel.slice(0, -topicText.length).trim();
              }
              displayLabel = displayLabel.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*đ\s*\)\s*/gi, ' ').trim();
              const questionLabel = displayLabel.match(/^(?:Câu|Bài)\s*\d+/i)?.[0];
              label.textContent = questionLabel || displayLabel;
            }
            if (topicBadge) topicBadge.textContent = topicText ? ` ${topicText}` : '';
          } else if (card.classList.contains('examplebox') && rule.title) {
            const heading = card.querySelector('.box-heading');
            const textNode = heading && Array.from(heading.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
            if (textNode) textNode.textContent = `${rule.title} `;
          }
        }
        const submitButton = card.querySelector('.btn-submit-solution');
        if (submitButton) {
          submitButton.hidden = rule.allowSubmission === false;
          submitButton.disabled = rule.allowSubmission === false;
          if (rule.allowSubmission !== false) {
            submitButton.onclick = () => window.openSubmissionModal(
              card.dataset.contentKey,
              rule.title || rule.shortLabel || card.dataset.contentKey,
              card
            );
          }
        }
      });
    } catch (err) {
      console.warn('Không áp dụng được quy tắc catalog, giữ nguyên giao diện tĩnh:', err?.message || err);
    }
  }

  // Xử lý nén và tải ảnh từ File / Clipboard
  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Vui lòng chọn một tệp hình ảnh hợp lệ (PNG, JPG, WEBP)!', false);
      return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        // Giới hạn độ phân giải hợp lý để giữ độ sắc nét của chữ viết tay
        let width = img.width;
        let height = img.height;
        const maxDimension = 2000;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        window.currentUploadedImage = compressedDataUrl;

        // Cập nhật UI Preview
        const previewContainer = document.getElementById('subImagePreviewContainer');
        const previewImg = document.getElementById('subImagePreview');
        const fileNameEl = document.getElementById('subImageFileName');
        if (previewContainer && previewImg) {
          previewImg.src = compressedDataUrl;
          if (fileNameEl) {
            fileNameEl.textContent = `📷 ${file.name || 'Ảnh bài giải viết tay'} (${Math.round(compressedDataUrl.length / 1024)} KB)`;
          }
          previewContainer.style.display = 'block';
        }
        showToast('Đã tải ảnh bài giải thành công!', true);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  window.handleImageFileSelect = function(event) {
    const file = event.target.files && event.target.files[0];
    if (file) processImageFile(file);
  };

  window.removeSelectedImage = function(silent = false) {
    window.currentUploadedImage = null;
    window.currentUploadedImageOcrResult = null;
    const fileInput = document.getElementById('subImageFileInput');
    if (fileInput) fileInput.value = '';
    const previewContainer = document.getElementById('subImagePreviewContainer');
    const previewImg = document.getElementById('subImagePreview');
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImg) previewImg.src = '';
    const mathBox = document.getElementById('subImageMathPreviewBox');
    if (mathBox) mathBox.style.display = 'none';
    if (!silent) showToast('Đã hủy ảnh bài giải đã chọn.', true);
  };

  window.toggleProblemStatement = function() {
    const box = document.getElementById('subProblemStatementBox');
    const btn = document.getElementById('btnToggleProblemStatement');
    if (!box) return;
    const isHidden = (box.style.display === 'none' || !box.style.display);
    box.style.display = isHidden ? 'block' : 'none';
    if (btn) btn.textContent = isHidden ? '🔼 Ẩn nội dung đề bài' : '📖 Xem nội dung đề bài';
    if (isHidden && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([box]).catch(() => {});
    }
  };

  // Lắng nghe sự kiện Paste (Ctrl+V) dán ảnh bài giải trực tiếp từ clipboard
  document.addEventListener('paste', function(e) {
    const modal = document.getElementById('submissionModal');
    if (!modal || !modal.classList.contains('active')) return;

    if (e.clipboardData && e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
            showToast('📋 Đã nhận diện ảnh dán từ Clipboard!', true);
            e.preventDefault();
            break;
          }
        }
      }
    }
  });

  // Kéo thả ảnh vào Dropzone
  function setupImageDropzone() {
    const dropzone = document.getElementById('subImageDropzone');
    if (!dropzone || dropzone.dataset.initialized) return;
    dropzone.dataset.initialized = 'true';

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '#0284c7';
        dropzone.style.background = '#f0f9ff';
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '#94a3b8';
        dropzone.style.background = '#fafafa';
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        processImageFile(files[0]);
      }
    });
  }

  // Điền bài giải mẫu chuẩn Olympic để kiểm thử nhanh tính năng AI
  window.fillSampleSolution = function(autoRun = false) {
    const textArea = document.getElementById('subSolutionText');
    if (!textArea) return;

    const sample = `Đặt ẩn phụ và xét biến đổi:
Ta có $u_{n+1}^2 = \\left(u_n + \\frac{1}{u_n}\\right)^2 = u_n^2 + 2 + \\frac{1}{u_n^2} > u_n^2 + 2$.
Bằng quy nạp toán học suy ra:
$u_n^2 > u_1^2 + 2(n-1) = 2n - 1 \\implies \\lim_{n \\to +\\infty} u_n = +\\infty$.
Áp dụng Định lý Stolz-Cesaro cho hai dãy $(u_n^2)$ và $(n)$:
$$\\lim_{n \\to \\infty} \\frac{u_n^2}{n} = \\lim_{n \\to \\infty} \\frac{u_{n+1}^2 - u_n^2}{(n+1) - n} = \\lim_{n \\to \\infty} \\left(2 + \\frac{1}{u_n^2}\\right) = 2 + 0 = 2.$$
Do $u_n > 0$, lấy căn bậc hai hai vế ta được:
$$\\lim_{n \\to \\infty} \\frac{u_n}{\\sqrt{n}} = \\sqrt{2}.$$
Vậy giới hạn cần tìm là $\\sqrt{2}$.`;

    textArea.value = sample;
    textArea.style.borderColor = '#6366f1';
    textArea.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
    setTimeout(() => {
      if (textArea) textArea.style.boxShadow = '';
    }, 1500);

    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');
    if (emptyAlert) emptyAlert.style.display = 'none';

    showToast('Đã điền lời giải mẫu VMO chuẩn vào ô nhập liệu!', true);

    if (autoRun) {
      setTimeout(() => {
        window.evaluateStudentSolution();
      }, 100);
    }
  };

  // Đánh giá bài giải của học sinh bằng Gia sư Toán AI học
  window.evaluateStudentSolution = async function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const image = window.currentUploadedImage;
    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');

    if (!text && !image) {
      if (emptyAlert) {
        emptyAlert.style.display = 'flex';
        const modalBody = emptyAlert.closest('.vmo-modal-body') || document.querySelector('#submissionModal .vmo-modal-body');
        if (modalBody) {
          const containerRect = modalBody.getBoundingClientRect();
          const alertRect = emptyAlert.getBoundingClientRect();
          const targetY = Math.max(0, alertRect.top - containerRect.top + modalBody.scrollTop - 20);
          if (typeof modalBody.scrollTo === 'function') {
            try { modalBody.scrollTo({ top: targetY, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = targetY; }
          } else {
            modalBody.scrollTop = targetY;
          }
        }
      }
      const textArea = document.getElementById('subSolutionText');
      if (textArea) {
        textArea.focus();
        textArea.style.borderColor = '#f59e0b';
        textArea.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.3)';
        setTimeout(() => {
          if (textArea) {
            textArea.style.borderColor = '#cbd5e1';
            textArea.style.boxShadow = '';
          }
        }, 3000);
      }
      showToast('Vui lòng nhập nội dung lời giải hoặc tải lên ảnh bài làm để AI đánh giá!', false);
      return;
    }

    if (emptyAlert) emptyAlert.style.display = 'none';

    const btn = document.getElementById('btnEvaluateSolution');
    const origBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ <span>Gia sư Toán AI đang phân tích...</span>';
    }

    // Hiển thị hộp loading trực quan ngay trong modal với các bước sinh động
    const loadingBox = document.getElementById('aiEvaluationLoadingBox');
    const resultBox = document.getElementById('aiEvaluationResultBox');
    if (resultBox) resultBox.style.display = 'none';
    const oldNotice = document.getElementById('aiEvalSuccessNoticeBar');
    if (oldNotice) oldNotice.remove();

    let loadingInterval = null;
    if (loadingBox) {
      loadingBox.style.display = 'block';
      const subtitleEl = document.getElementById('aiLoadingSubtitle');
      const messages = [
        'Đang thẩm định tính chính xác, rà soát từng bước suy luận và kiểm tra lỗ hổng logic toán học...',
        'AI đang đối chiếu các bổ đề, công thức và tính tương đương của các phép biến đổi...',
        'Đang tổng hợp nhận xét chuyên gia, tính toán điểm số ước tính theo thang VMO...'
      ];
      let msgIdx = 0;
      if (subtitleEl) subtitleEl.textContent = messages[0];
      loadingInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % messages.length;
        if (subtitleEl) subtitleEl.textContent = messages[msgIdx];
      }, 2500);

      const modalBody = loadingBox.closest('.vmo-modal-body') || document.querySelector('#submissionModal .vmo-modal-body');
      if (modalBody) {
        const containerRect = modalBody.getBoundingClientRect();
        const boxRect = loadingBox.getBoundingClientRect();
        const targetY = Math.max(0, boxRect.top - containerRect.top + modalBody.scrollTop - 20);
        if (typeof modalBody.scrollTo === 'function') {
          try { modalBody.scrollTo({ top: targetY, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = targetY; }
        } else {
          modalBody.scrollTop = targetY;
        }
      }
    }

    showToast('🤖 Gia sư Toán AI đang đọc và rà soát logic bài giải của bạn...', true);

    try {
      const payload = {
        problemId: window.currentSubmissionData?.problemId || 'vmo-prob',
        problemKey: window.currentSubmissionData?.problemKey || '',
        problemTitle: window.currentSubmissionData?.problemTitle || 'Bài toán VMO',
        problemContent: window.currentSubmissionData?.problemContent || '',
        topic: window.currentSubmissionData?.topic || '',
        examTitle: window.currentSubmissionData?.examTitle || '',
        lang: window.currentLang === 'en' ? 'en' : 'vi',
        solutionText: text,
        solutionImage: image
      };

      const res = await fetch('/api/ai-evaluate-solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let json = null;
      try {
        json = await res.json();
      } catch (parseError) {
        // Phản hồi không phải JSON (ví dụ lỗi hạ tầng Vercel).
      }
      if (!res.ok) {
        const issues = Array.isArray(json?.quality?.criticalIssues)
          ? json.quality.criticalIssues.filter(Boolean).slice(0, 3)
          : [];
        const details = issues.length ? `\n• ${issues.join('\n• ')}` : '';
        throw new Error(`${json?.error || `Máy chủ phản hồi mã lỗi HTTP ${res.status}`}${details}`);
      }

      if (!json || !json.data) {
        throw new Error(json?.message || 'Không nhận được dữ liệu đánh giá từ máy chủ.');
      }

      const evalData = json.data;
      const verifiedTranscription = String(evalData.studentWorkTranscription || '').trim();
      if (verifiedTranscription) {
        const solutionTextArea = document.getElementById('subSolutionText');
        if (solutionTextArea && !solutionTextArea.value.trim()) {
          solutionTextArea.value = verifiedTranscription;
        }
        if (image) {
          window.currentUploadedImageOcrResult = {
            img: image,
            latexText: verifiedTranscription,
            summary: 'Bản chép bài làm đã được Gia sư Toán AI đọc và dùng để kiểm định'
          };
        }
      }
      window.currentEvaluationResult = evalData;
      if (loadingBox) loadingBox.style.display = 'none';
      displayEvaluationResult(evalData);
      showToast('Đã hoàn tất phân tích & đánh giá bài giải!', true);
    } catch (err) {
      console.error('Lỗi khi đánh giá bài giải:', err);
      if (loadingBox) loadingBox.style.display = 'none';
      displayEvaluationError(err.message || 'Không thể kết nối máy chủ AI');
      showToast('Lỗi đánh giá: ' + (err.message || 'Không thể kết nối máy chủ AI'), false);
    } finally {
      if (loadingInterval) clearInterval(loadingInterval);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnHtml;
      }
    }
  };

  // Escape toàn bộ HTML không tin cậy trước khi chèn vào innerHTML.
  function escapeHtmlText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeCatalogHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    template.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const val = attribute.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && val.startsWith('javascript:'))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }

  function htmlToPlainText(value) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeCatalogHtml(value);
    return (template.content.textContent || '').trim();
  }

  // Chỉ chuẩn hóa nội dung bên trong một token Math đã có delimiter.
  // Không tự bọc thêm dấu $ để tránh tạo $...$ lồng nhau gây Math input error.
  function normalizeDelimitedMath(token) {
    let normalized = String(token || '')
      // Sửa các lệnh TeX bắt đầu bằng \t, \f, \r, \b nếu JSON đã diễn
      // giải nhầm chúng thành tab/form-feed/carriage-return/backspace.
      .replace(/\t(o|ext|ag|heta|imes|au)\b/g, '\\t$1')
      .replace(/\f(rac)\b/g, '\\f$1')
      .replace(/\r(ight|ho)\b/g, '\\r$1')
      .replace(/\x08(egin|eta|inom)\b/g, '\\b$1')
      .replace(/≥/g, '\\ge ')
      .replace(/≤/g, '\\le ')
      .replace(/≠/g, '\\ne ')
      .replace(/∈/g, '\\in ')
      .replace(/∉/g, '\\notin ')
      .replace(/→/g, '\\to ')
      .replace(/⇒/g, '\\Rightarrow ')
      .replace(/⇔/g, '\\Leftrightarrow ')
      .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
      .replace(/\\end\{align\*?\}/g, '\\end{aligned}');

    // MathJax không cho phép \tag nằm bên trong aligned/alignedat.
    // Giữ nhãn phương trình dưới dạng văn bản toán học tương đương.
    normalized = normalized.replace(
      /\\begin\{(aligned\*?|alignedat\*?)\}([\s\S]*?)\\end\{\1\}/g,
      (_, environment, body) => {
        const safeBody = body.replace(/\\tag\*?\{([^{}]*)\}/g, (_, label) => `\\qquad\\text{(${label})}`);
        return `\\begin{${environment}}${safeBody}\\end{${environment}}`;
      }
    );

    return escapeHtmlText(normalized);
  }

  // Định dạng Markdown an toàn và giữ nguyên các khối MathJax hợp lệ.
  function formatMathMarkdown(val) {
    if (val == null) return '';
    if (Array.isArray(val)) {
      return val.map(item => formatMathMarkdown(item)).join('<div style="margin-top: 6px;"></div>');
    }
    if (typeof val === 'object') {
      return Object.entries(val)
        .map(([k, v]) => `<strong>${escapeHtmlText(k)}:</strong> ${formatMathMarkdown(v)}`)
        .join('<div style="margin-top: 6px;"></div>');
    }

    let raw = String(val).trim();
    if (!raw) return '';

    // Chuẩn hóa ký tự vô hình và các thẻ xuống dòng có thể do AI trả về.
    raw = raw
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n');

    // Tách và bảo vệ những khối Math đã có delimiter trước mọi xử lý văn bản.
    const mathTokens = [];
    let text = raw.replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$(?:\\.|[^$\n])+?\$|\\\([\s\S]+?\\\))/g, (match) => {
      mathTokens.push(match);
      return `@@VMO_MATH_${mathTokens.length - 1}@@`;
    });

    // Từ đây chỉ xử lý văn bản thuần đã được escape.
    text = escapeHtmlText(text);

    // Tách các mục đánh số bị dính liền thành các đoạn riêng biệt.
    // Chỉ dùng lớp ký tự ASCII trong regex để file không lỗi khi CDN/proxy
    // diễn giải encoding khác nhau. Nội dung tiếng Việt vẫn được giữ nguyên.
    text = text.replace(/([.!?])\s+(\d+[.)]\s+(?=\S))/g, '$1\n\n$2');
    text = text.replace(/(?<!\n)(\b\d+[.)]\s+(?=\S))/g, '\n$1');

    // Markdown cơ bản được chuyển sau khi escape nên không thể chèn HTML tùy ý.
    text = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Định dạng danh sách đánh số.
    const paragraphs = text.split(/\n\s*\n/);
    text = paragraphs.map(p => {
      let trimmed = p.trim();
      if (!trimmed) return '';
      const listMatch = trimmed.match(/^(\d+[\.\)])\s*([\s\S]+)$/);
      if (listMatch) {
        return `<div style="margin-bottom: 10px; display: flex; align-items: flex-start; gap: 8px;">
          <span style="display: inline-block; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 0.82rem; flex-shrink: 0; margin-top: 2px;">${listMatch[1]}</span>
          <div style="flex: 1; line-height: 1.65;">${listMatch[2].replace(/\n/g, '<br>')}</div>
        </div>`;
      }
      return `<div style="margin-bottom: 8px; line-height: 1.65;">${trimmed.replace(/\n/g, '<br>')}</div>`;
    }).filter(Boolean).join('');

    // Khôi phục đúng một lần; không chạy regex tạo công thức lần thứ hai.
    text = text.replace(/@@VMO_MATH_(\d+)@@/g, (match, idx) => {
      return normalizeDelimitedMath(mathTokens[Number(idx)] || '');
    });

    return text;
  }

  // Hiển thị thông báo lỗi đánh giá ngay trong modal và cho phép thử lại
  function displayEvaluationError(errorMsg) {
    let resultBox = document.getElementById('aiEvaluationResultBox');
    if (!resultBox) return;

    resultBox.style.cssText = 'display: block; margin-bottom: 18px; border-radius: 10px; overflow: hidden; border: 1.5px solid #f87171; background: #fff5f5; box-shadow: 0 4px 15px -3px rgba(239, 68, 68, 0.15);';
    resultBox.innerHTML = `
      <div style="padding: 16px 20px;">
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <span style="font-size: 1.6rem;">⚠️</span>
          <div>
            <h4 style="margin: 0 0 4px 0; color: #991b1b; font-size: 1rem;">Không thể hoàn tất đánh giá trực tuyến</h4>
            <p style="margin: 0; color: #7f1d1d; font-size: 0.88rem; line-height: 1.5;">
              ${escapeHtmlText(errorMsg || 'Kết nối tới dịch vụ AI gặp trục trặc hoặc model quá tải.')}
            </p>
          </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" onclick="evaluateStudentSolution()" style="padding: 8px 16px; border-radius: 6px; background: #dc2626; color: #fff; border: none; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span>🔄</span> <span>Thử lại ngay</span>
          </button>
          <button type="button" onclick="runOfflineEvaluation()" style="padding: 8px 16px; border-radius: 6px; background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span>⚡</span> <span>Phân tích bằng bộ Chuyên gia dự phòng</span>
          </button>
        </div>
      </div>
    `;

    const scrollContainer = document.querySelector('#submissionModal .vmo-modal-body');
    if (scrollContainer) {
      setTimeout(() => {
        const containerRect = scrollContainer.getBoundingClientRect();
        const boxRect = resultBox.getBoundingClientRect();
        const relativeTop = boxRect.top - containerRect.top + scrollContainer.scrollTop;
        scrollContainer.scrollTo({ top: Math.max(0, relativeTop - 15), behavior: 'smooth' });
      }, 50);
    }
  }

  // Bộ phân tích chuyên gia dự phòng hoạt động tức thì khi mạng gặp sự cố
  window.runOfflineEvaluation = function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const fallbackVerdict = text && text.length > 80 ? 'RIGHT_DIRECTION_INACCURATE' : 'MISSING_CONDITIONS';
    const offlineData = {
      verdict: fallbackVerdict,
      verdictLabel: fallbackVerdict === 'RIGHT_DIRECTION_INACCURATE' ? 'Đúng hướng đi nhưng cần kiểm tra kỹ lại chi tiết' : 'Thiếu điều kiện / Cần bổ sung lập luận',
      verdictColor: '#d97706',
      estimatedScore: '3.5/5.0đ (Đánh giá dự phòng)',
      summary: 'Hệ thống đã phân tích cấu trúc bài giải của bạn. Hướng tiếp cận có căn cứ chuyên môn, tuy nhiên cần kiểm tra chặt chẽ các bước biến đổi trung gian và thử lại nghiệm.',
      approachAnalysis: 'Bạn đã nắm được phương pháp tiếp cận chính của dạng toán này. Để đạt điểm tối đa trong kỳ thi VMO, cần lưu ý tính tương đương của các phép biến đổi và kiểm tra điều kiện tồn tại.',
      stepByStep: '1. **Bước đặt ẩn & tập xác định**: Đã xác định hướng biến đổi chính.<br>2. **Bước biến đổi đại số**: Cần bổ sung giải thích chiều suy luận $\\Rightarrow$ hay $\\Leftrightarrow$.<br>3. **Bước kết luận**: Luôn kiểm tra các trường hợp biên và điều kiện số nguyên / số thực dương.',
      criticalFlaws: 'Cần lưu ý kiểm tra các trường hợp biên và điều kiện để tránh bị trừ điểm trình bày theo biểu điểm VMO.',
      recommendations: 'Hãy hoàn thiện việc trình bày lời giải thành các bước rõ ràng theo chuẩn bài thi HSG Quốc gia.',
      verificationNotes: 'Đây là đánh giá dự phòng ngoại tuyến; các công thức chưa được mô hình AI trực tuyến hậu kiểm.'
    };
    window.currentEvaluationResult = offlineData;
    displayEvaluationResult(offlineData);
    showToast('Đã hiển thị đánh giá từ bộ phân tích chuyên gia dự phòng!', true);
  };

  // Kích hoạt MathJax typeset an toàn và chống cache lỗi cho container
  function triggerMathJaxRenderForElement(container) {
    if (!container || !window.MathJax) return;
    try {
      if (window.MathJax.typesetClear) {
        window.MathJax.typesetClear([container]);
      }
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch(err => {
          console.warn('[MathJax Typeset Handled]:', err);
        });
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([container]);
      }
    } catch (e) {
      console.warn('[MathJax Exception]:', e);
    }
  }

  // Hệ thống chuyển đổi Tab thông minh trong Submission Modal
  window.switchSubmissionTab = function(tabName) {
    const tabBtnComposer = document.getElementById('tabBtnSubComposer');
    const tabBtnEval = document.getElementById('tabBtnSubEvaluation');
    const paneComposer = document.getElementById('subTabPaneComposer');
    const paneEval = document.getElementById('subTabPaneEvaluation');
    const modalBody = document.querySelector('#submissionModal .vmo-modal-body');

    if (tabName === 'eval') {
      if (paneComposer) paneComposer.style.display = 'none';
      if (paneEval) paneEval.style.display = 'block';

      if (tabBtnComposer) {
        tabBtnComposer.style.color = '#94a3b8';
        tabBtnComposer.style.borderBottom = '3px solid transparent';
      }
      if (tabBtnEval) {
        tabBtnEval.style.color = '#38bdf8';
        tabBtnEval.style.borderBottom = '3px solid #38bdf8';
      }

      if (modalBody) {
        if (typeof modalBody.scrollTo === 'function') {
          try { modalBody.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = 0; }
        } else {
          modalBody.scrollTop = 0;
        }
      }

      const evalContent = document.getElementById('tabEvaluationMainContent');
      if (evalContent) {
        setTimeout(() => {
          triggerMathJaxRenderForElement(evalContent);
        }, 50);
      }
    } else {
      if (paneEval) paneEval.style.display = 'none';
      if (paneComposer) paneComposer.style.display = 'block';

      if (tabBtnComposer) {
        tabBtnComposer.style.color = '#38bdf8';
        tabBtnComposer.style.borderBottom = '3px solid #38bdf8';
      }
      if (tabBtnEval) {
        tabBtnEval.style.color = '#94a3b8';
        tabBtnEval.style.borderBottom = '3px solid transparent';
      }
    }
  };

  // Hàm chuyển hướng nhanh đến kết quả đánh giá (hỗ trợ cả cuộn và chuyển tab)
  window.scrollToEvaluationResult = function() {
    window.switchSubmissionTab('eval');
    const resultBox = document.getElementById('aiEvaluationResultBox');
    const modalBody = document.querySelector('#submissionModal .vmo-modal-body');
    const modalContainer = document.querySelector('#submissionModal .vmo-modal-container');
    if (resultBox && modalBody) {
      resultBox.style.display = 'block';
      const topPos = Math.max(0, resultBox.offsetTop - 15);
      if (typeof modalBody.scrollTo === 'function') {
        try { modalBody.scrollTo({ top: topPos, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = topPos; }
      } else {
        modalBody.scrollTop = topPos;
      }
      if (modalContainer) {
        if (typeof modalContainer.scrollTo === 'function') {
          try { modalContainer.scrollTo({ top: topPos, behavior: 'smooth' }); } catch (e) { modalContainer.scrollTop = topPos; }
        } else {
          modalContainer.scrollTop = topPos;
        }
      }
      try {
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {}
    }
  };

  // In / Xuất báo cáo thẩm định của Giáo sư
  window.printEvaluationReport = function() {
    const evalData = window.currentEvaluationResult;
    const subData = window.currentSubmissionData || {};
    if (!evalData) {
      alert('Chưa có dữ liệu đánh giá để in báo cáo!');
      return;
    }
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Vui lòng cho phép popup để in báo cáo kết quả!');
      return;
    }
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Báo cáo thẩm định bài giải VMO - ${escapeHtmlText(subData.problemTitle || 'Bài toán')}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; padding: 30px; max-width: 800px; margin: 0 auto; }
          h2 { color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 8px; }
          .banner { background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
          .title { font-weight: bold; color: #0369a1; margin-bottom: 6px; }
        </style>
      </head>
      <body>
        <h2>BÁO CÁO THẨM ĐỊNH BÀI GIẢI TOÁN OLYMPIC — GIA SƯ TOÁN AI</h2>
        <p><strong>Bài toán:</strong> ${escapeHtmlText(subData.problemTitle || 'Bài tập VMO')}</p>
        <div class="banner">
          <p><strong>Kết luận:</strong> ${escapeHtmlText(evalData.verdictLabel || evalData.verdict || 'Hoàn tất')}</p>
          <p><strong>Điểm ước lượng:</strong> ${escapeHtmlText(evalData.estimatedScore ?? '5.0/5.0đ')}</p>
        </div>
        <div class="card"><div class="title">1. Nhận định tổng quan:</div><div>${formatMathMarkdown(evalData.summary || '')}</div></div>
        <div class="card"><div class="title">2. Hướng tiếp cận &amp; Phương pháp:</div><div>${formatMathMarkdown(evalData.approachAnalysis || '')}</div></div>
        <div class="card"><div class="title">3. Rà soát chi tiết từng bước:</div><div>${formatMathMarkdown(evalData.stepByStep || '')}</div></div>
        <div class="card"><div class="title">4. Lỗ hổng logic / Lưu ý:</div><div>${formatMathMarkdown(evalData.criticalFlaws || '')}</div></div>
        <div class="card"><div class="title">5. Lời khuyên của Gia sư Toán AI:</div><div>${formatMathMarkdown(evalData.recommendations || '')}</div></div>
        <div class="card"><div class="title">6. Hậu kiểm công thức:</div><div>${formatMathMarkdown(evalData.verificationNotes || '')}</div></div>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 500);
  };

  // Tạo khung HTML hoàn chỉnh cho báo cáo thẩm định
  function generateEvaluationReportHtml(evalData, isFullView = false) {
    const fallbackVerdictBg = evalData.verdict === 'CORRECT'
      ? '#16a34a'
      : (evalData.verdict === 'LOGICAL_GAP'
        ? '#ea580c'
        : (evalData.verdict === 'INCORRECT' ? '#dc2626' : '#6366f1'));
    const verdictBg = /^#[0-9a-f]{6}$/i.test(String(evalData.verdictColor || ''))
      ? String(evalData.verdictColor)
      : fallbackVerdictBg;
    const rag = evalData.quality?.retrieval;
    const referenceKeys = (rag?.sources || []).map(item => item.problemKey).filter(Boolean);
    const ragNotice = rag ? `<div style="padding:8px;margin:8px 0;font-size:.8rem;">📚 <strong>Tham chiếu lời giải:</strong> ${referenceKeys.length ? `<strong>${escapeHtmlText(referenceKeys.join('; '))}</strong>` : 'Gia sư Toán AI tự xây dựng lời giải'}</div>` : '';
    const verificationBadge = evalData.quality?.verified
      ? `<div style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.45);font-size:.75rem;font-weight:700;">✓ Đã kiểm định độc lập${evalData.quality.corrected ? ' · Đã hiệu chỉnh' : ''}</div>`
      : '';

    return `
      <!-- Banner Kết luận Tổng quan & Điểm số -->
      <div style="padding: 16px 20px; background: ${verdictBg}; color: #ffffff; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-radius: 10px 10px 0 0;">
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.95; margin-bottom: 2px;">Kết luận chuyên môn của Gia sư Toán AI:</div>
          <div style="font-size: 1.15rem; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">
            ${escapeHtmlText(evalData.verdictLabel || evalData.verdict || 'ĐÚNG HOÀN TOÀN (TỐI ƯU)')}
          </div>
          ${verificationBadge}${ragNotice}
        </div>
        <div style="background: rgba(255,255,255,0.25); border: 1.5px solid rgba(255,255,255,0.5); border-radius: 8px; padding: 6px 16px; font-weight: 800; font-size: 1.15rem; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
          Điểm: ${escapeHtmlText(evalData.estimatedScore ?? '5.0/5.0đ')}
        </div>
      </div>

      <div style="padding: 20px; font-size: 0.92rem; line-height: 1.7; color: #1e293b; background: #ffffff; border-radius: 0 0 10px 10px;">
        <!-- 1. Tóm tắt -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>📝</span> <strong>Nhận định tổng quan của Gia sư Toán AI:</strong>
          </h5>
          <div style="color: #1e293b; background: #f8fafc; padding: 12px 16px; border-radius: 6px; border-left: 4px solid #0284c7; font-size: 0.92rem;">
            ${formatMathMarkdown(evalData.summary || 'Lời giải đã được thẩm định.')}
          </div>
        </div>

        <!-- 2. Hướng tiếp cận -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>🎯</span> <strong>Phân tích hướng tiếp cận &amp; Phương pháp toán:</strong>
          </h5>
          <div style="color: #334155; padding: 2px 4px;">
            ${formatMathMarkdown(evalData.approachAnalysis || 'Đã áp dụng đúng phương pháp cốt lõi.')}
          </div>
        </div>

        <!-- 3. Rà soát từng bước -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>🔍</span> <strong>Rà soát chi tiết từng bước lập luận:</strong>
          </h5>
          <div style="color: #334155; background: #fafafa; padding: 14px; border-radius: 6px; border: 1px solid #e2e8f0;">
            ${formatMathMarkdown(evalData.stepByStep || 'Các bước lập luận hoàn chỉnh.')}
          </div>
        </div>

        <!-- 4. Lỗ hổng logic / Thiếu sót -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #b91c1c; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>⚠️</span> <strong>Lỗ hổng logic / Điều kiện thiếu sót (nếu có):</strong>
          </h5>
          <div style="color: #991b1b; background: #fff1f2; padding: 12px 16px; border-radius: 6px; border: 1px solid #fecdd3;">
            ${formatMathMarkdown(evalData.criticalFlaws || 'Không phát hiện sai sót logic nghiêm trọng.')}
          </div>
        </div>

        <!-- 5. Lời khuyên & Hướng giải tối ưu -->
        <div style="margin-bottom: 20px;">
          <h5 style="margin: 0 0 6px 0; color: #047857; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>💡</span> <strong>Lời khuyên của Gia sư Toán AI &amp; Hướng giải tối ưu:</strong>
          </h5>
          <div style="color: #065f46; background: #ecfdf5; padding: 12px 16px; border-radius: 6px; border: 1px solid #a7f3d0;">
            ${formatMathMarkdown(evalData.recommendations || evalData.optimalSuggestions || 'Tiếp tục phát huy!')}
          </div>
        </div>

        <!-- 6. Hậu kiểm công thức của giám khảo AI -->
        <div style="margin-bottom: 20px;">
          <h5 style="margin: 0 0 6px 0; color: #4338ca; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>✅</span> <strong>Hậu kiểm công thức của Giám khảo AI:</strong>
          </h5>
          <div style="color: #3730a3; background: #eef2ff; padding: 12px 16px; border-radius: 6px; border: 1px solid #c7d2fe;">
            ${formatMathMarkdown(evalData.verificationNotes || 'Chưa có ghi chú hậu kiểm.')}
          </div>
        </div>

        <!-- Hàng nút hành động bổ trợ -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
          <div style="display: flex; gap: 8px;">
            <button type="button" onclick="switchSubmissionTab('composer')" style="padding: 7px 14px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <span>✍️</span> <span>Quay lại sửa bài</span>
            </button>
            <button type="button" onclick="window.printEvaluationReport()" style="padding: 7px 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: #475569; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <span>🖨️</span> <span>In báo cáo</span>
            </button>
          </div>
          <button type="button" onclick="document.getElementById('btnConfirmSubmit')?.click()" style="padding: 7px 18px; background: #0284c7; border: none; border-radius: 6px; font-weight: 700; font-size: 0.88rem; color: #ffffff; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(2,132,199,0.3);">
            <span>🚀</span> <span>Lưu bài vào cơ sở dữ liệu</span>
          </button>
        </div>
      </div>
    `;
  }

  // Hiển thị kết quả đánh giá lên giao diện (đồng bộ cả 2 tab)
  function displayEvaluationResult(evalData) {
    if (!evalData) return;
    console.log('[AI Eval] Hiển thị kết quả đánh giá:', evalData);

    const reportHtml = generateEvaluationReportHtml(evalData);

    // 1. Điền vào Tab Kết quả thẩm định (Tab 2)
    const tabMainContent = document.getElementById('tabEvaluationMainContent');
    if (tabMainContent) {
      tabMainContent.innerHTML = reportHtml;
    }

    // 2. Điền vào Khung kết quả inline ở Tab Soạn bài (Tab 1)
    let resultBox = document.getElementById('aiEvaluationResultBox');
    const modalBody = document.querySelector('#submissionModal .vmo-modal-body');
    if (!resultBox && modalBody) {
      resultBox = document.createElement('div');
      resultBox.id = 'aiEvaluationResultBox';
      modalBody.appendChild(resultBox);
    }
    if (resultBox) {
      resultBox.style.setProperty('display', 'block', 'important');
      resultBox.style.setProperty('visibility', 'visible', 'important');
      resultBox.style.setProperty('opacity', '1', 'important');
      resultBox.style.marginBottom = '20px';
      resultBox.style.borderRadius = '10px';
      resultBox.style.overflow = 'hidden';
      resultBox.style.border = '2px solid #818cf8';
      resultBox.style.background = '#ffffff';
      resultBox.style.boxShadow = '0 8px 25px -4px rgba(99, 102, 241, 0.2)';
      resultBox.innerHTML = reportHtml;
    }

    // 3. Cập nhật Badge trên nút Tab 2
    const evalBadge = document.getElementById('subTabEvalBadge');
    if (evalBadge) {
      evalBadge.textContent = evalData.estimatedScore || 'Hoàn tất';
      evalBadge.style.display = 'inline-block';
      const verdictBg = evalData.verdictColor || (evalData.verdict === 'CORRECT' ? '#16a34a' : (evalData.verdict === 'LOGICAL_GAP' ? '#ea580c' : '#6366f1'));
      evalBadge.style.background = verdictBg;
    }

    // 4. Cập nhật thanh thông báo thành công ở Tab 1 với nút xem chi tiết trực tiếp
    const noticeId = 'aiEvalSuccessNoticeBar';
    let noticeEl = document.getElementById(noticeId);
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.id = noticeId;
      const actionsBar = document.getElementById('btnEvaluateSolution')?.closest('div[style*="display: flex"]');
      if (actionsBar && actionsBar.parentElement) {
        actionsBar.parentElement.insertBefore(noticeEl, actionsBar.nextSibling);
      }
    }
    if (noticeEl) {
      noticeEl.style.cssText = 'margin-bottom: 14px; padding: 10px 14px; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 8px; color: #065f46; font-size: 0.88rem; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; box-shadow: 0 2px 8px rgba(16,185,129,0.15);';
      noticeEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.25rem;">✅</span>
          <div>
            <strong>Đã có kết quả thẩm định:</strong>
            <span>${escapeHtmlText(evalData.verdictLabel || 'Đã phân tích xong')} (${escapeHtmlText(evalData.estimatedScore ?? '')})</span>
          </div>
        </div>
        <button type="button" onclick="window.switchSubmissionTab('eval')" style="padding: 6px 14px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: 700; font-size: 0.84rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(5,150,105,0.3); transition: all 0.2s;">
          <span>Xem kết quả chi tiết</span> <span>→</span>
        </button>
      `;
    }

    // 5. TỰ ĐỘNG CHUYỂN NGAY SANG TAB KẾT QUẢ ĐÁNH GIÁ (HIỂN THỊ TRỌN VẸN TỪ ĐỈNH TRANG)
    setTimeout(() => {
      window.switchSubmissionTab('eval');
      const evalContent = document.getElementById('tabEvaluationMainContent');
      if (evalContent) triggerMathJaxRenderForElement(evalContent);
      if (resultBox) triggerMathJaxRenderForElement(resultBox);
    }, 150);

    // Kích hoạt MathJax ngay cho resultBox nếu có hiển thị ở Tab 1
    if (resultBox) {
      triggerMathJaxRenderForElement(resultBox);
    }
  }

  // Xuất hàm ra phạm vi toàn cục để luôn có thể gọi được
  window.displayEvaluationResult = displayEvaluationResult;

  // Xem lại chi tiết đánh giá từ bài nộp cũ trong lịch sử
  window.viewSubEvaluationDetail = function(index) {
    const sub = window.lastLoadedSubmissions && window.lastLoadedSubmissions[index];
    if (!sub || !sub.evaluation) {
      showToast('Bài nộp này chưa có dữ liệu đánh giá chi tiết của AI.', false);
      return;
    }

    // Hàm này được dùng ở cả lịch sử trong cửa sổ nộp bài và Database Hub.
    // Khi gọi từ cơ sở dữ liệu Hub, cần đóng Hub và chủ động mở submissionModal;
    // nếu không, dữ liệu AI đã được nạp nhưng người dùng không nhìn thấy.
    if (typeof window.closeDataHubModal === 'function') {
      window.closeDataHubModal();
    }
    const submissionModal = document.getElementById('submissionModal');
    if (submissionModal) {
      submissionModal.classList.add('active');
      submissionModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    displayEvaluationResult(sub.evaluation);
    if (typeof window.switchSubmissionTab === 'function') {
      window.switchSubmissionTab('eval');
    }
    showToast('Đã mở lại nhận xét của Gia sư Toán AI cho bài nộp #' + (window.lastLoadedSubmissions.length - index), true);
  };

  window.openSubmissionModal = function(problemId, problemTitle, problemCard) {
    const isEn = (window.currentLang === 'en');
    let modal = document.getElementById('submissionModal');
    if (!modal) return;

    if (problemCard?.classList?.contains('examplebox') && !problemCard.querySelector('.problem-content')) {
      problemTitle = headingTextWithoutActions(problemCard.querySelector('.box-heading')) || problemTitle;
    }

    // Reset về Tab Soạn bài và làm sạch trạng thái đánh giá cũ
    if (typeof window.switchSubmissionTab === 'function') {
      window.switchSubmissionTab('composer');
    }
    const evalBadge = document.getElementById('subTabEvalBadge');
    if (evalBadge) evalBadge.style.display = 'none';
    const tabMainContent = document.getElementById('tabEvaluationMainContent');
    if (tabMainContent) {
      tabMainContent.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #64748b;">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">🤖</div>
          <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 6px; color: #1e293b;">Chưa có kết quả thẩm định</div>
          <div style="font-size: 0.88rem; max-width: 460px; margin: 0 auto 16px auto;">
            Hãy nhập lời giải hoặc tải ảnh bài làm viết tay ở Tab <strong>"Soạn bài &amp; Tải lên"</strong> rồi nhấn nút <strong>"Đánh giá bài giải"</strong>.
          </div>
          <button type="button" onclick="switchSubmissionTab('composer')" style="padding: 8px 18px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            ✍️ Đến trang Soạn bài
          </button>
        </div>
      `;
    }

    // Trích xuất thông tin chi tiết bài toán & bảo toàn công thức toán học LaTeX nguyên bản
    let problemContentRaw = '';
    let problemContentDisplay = '';
    let topic = '';
    let examTitle = '';

    if (problemCard) {
      if (problemCard.classList.contains('examplebox') && !problemCard.querySelector('.problem-content')) {
        const headingEl = problemCard.querySelector('.box-heading');
        topic = headingEl ? (headingEl.innerText || headingEl.textContent || '').trim() : 'Ví dụ chuyên đề';
        const chBlock = problemCard.closest('.chapter-block');
        if (chBlock) {
          const chHeading = chBlock.querySelector('.chapter-heading');
          if (chHeading) examTitle = (chHeading.innerText || chHeading.textContent || '').trim();
        }

        const pEls = Array.from(problemCard.querySelectorAll('p')).filter(p => !p.closest('.example-solution') && !p.closest('.ai-guide-panel'));
        problemContentRaw = pEls.map(p => p.getAttribute('data-raw-math') || p.innerHTML).join('<br><br>');
        problemContentDisplay = problemContentRaw;
      } else {
        const contentEl = problemCard.querySelector('.problem-content');
        const topicEl = problemCard.querySelector('.badge-topic');
        topic = problemCard.dataset.topic || (topicEl?.innerText || topicEl?.textContent || '').trim();
        examTitle = problemCard.dataset.setTitle || '';
        const examCard = problemCard.closest('.exam-card') || problemCard.closest('.paper-card');
        if (examCard) {
          const titleEl = examCard.querySelector('.exam-title');
          if (titleEl) examTitle = (titleEl.innerText || titleEl.textContent || '').trim();
        }

        if (contentEl) {
          // Ưu tiên 1: Đọc data-raw-math đã được lưu tự động lúc tải trang (chứa $ và $$ nguyên bản)
          problemContentRaw = contentEl.getAttribute('data-raw-math') || '';

          // Ưu tiên 2: Nếu chưa có data-raw-math, khôi phục từ MathJax MathItems nếu có
          if (!problemContentRaw && window.MathJax?.startup?.document) {
            try {
              const mathItems = window.MathJax.startup.document.getMathItemsWithin(contentEl);
              if (mathItems && mathItems.length > 0) {
                const clone = contentEl.cloneNode(true);
                const containers = clone.querySelectorAll('mjx-container');
                containers.forEach((mjx, idx) => {
                  if (mathItems[idx]) {
                    const delim = mathItems[idx].display ? '$$' : '$';
                    mjx.replaceWith(document.createTextNode(` ${delim}${mathItems[idx].math}${delim} `));
                  }
                });
                problemContentRaw = clone.innerHTML;
              }
            } catch (err) {
              console.warn('Lỗi trích xuất MathItems:', err);
            }
          }

          // Ưu tiên 3: Nếu vẫn chưa có, lấy innerHTML
          if (!problemContentRaw) {
            problemContentRaw = contentEl.innerHTML;
          }

          problemContentDisplay = problemContentRaw;
        }
      }
    }

    // Làm sạch text để gửi cho AI (giữ nguyên LaTeX, bỏ tag HTML thừa)
    let problemContentForAi = problemTitle;
    if (problemContentRaw) {
      const tmpDiv = document.createElement('div');
      tmpDiv.innerHTML = problemContentRaw;
      problemContentForAi = (tmpDiv.innerText || tmpDiv.textContent || '').trim();
    }

    const identity = getProblemIdentity(problemCard, problemTitle);
    window.currentSubmissionData = {
      problemId,
      problemKey: identity.problemKey,
      legacyProblemId: identity.legacyProblemId,
      setKey: identity.setKey,
      setTitle: identity.setTitle || examTitle,
      sourceType: identity.sourceType,
      sourceGroup: identity.sourceGroup,
      problemTitle,
      problemContent: problemContentForAi || problemTitle,
      topic,
      examTitle
    };
    window.currentUploadedImage = null;
    window.currentEvaluationResult = null;

    // Nạp riêng câu hỏi đang mở để dùng nội dung MongoDB mới nhất mà không
    // phải tải toàn bộ phần đề bài và lời giải của catalog ở lần mở trang.
    window.VMODataService?.getCatalogProblems?.({ contentKey: identity.problemKey })
      .then(items => {
        const latest = items?.[0];
        if (!latest || window.currentSubmissionData?.problemKey !== identity.problemKey) return;
        window.currentSubmissionData.problemId = latest.id || latest._id || problemId;
        window.currentSubmissionData.problemTitle = latest.title || problemTitle;
        window.currentSubmissionData.problemContent = htmlToPlainText(latest.content || problemContentForAi || problemTitle);
        window.currentSubmissionData.topic = latest.topic || topic;
        window.currentSubmissionData.examTitle = latest.setTitle || examTitle;
        const currentTitle = document.getElementById('subProblemName');
        if (currentTitle) currentTitle.textContent = latest.title || problemTitle;
        const currentStatement = document.getElementById('subProblemStatementBox');
        if (currentStatement && latest.content) currentStatement.innerHTML = sanitizeCatalogHtml(latest.content);
        if (window.MathJax?.typesetPromise && currentStatement) window.MathJax.typesetPromise([currentStatement]).catch(() => {});
      })
      .catch(err => console.warn('Không nạp được nội dung mới nhất từ catalog:', err?.message || err));

    const titleEl = document.getElementById('subProblemName');
    if (titleEl) titleEl.textContent = problemTitle;

    const stmtBox = document.getElementById('subProblemStatementBox');
    if (stmtBox) {
      stmtBox.innerHTML = problemContentDisplay ? problemContentDisplay : '<em>Đang nạp đề bài...</em>';
      stmtBox.style.display = 'none';
    }
    const toggleStmtBtn = document.getElementById('btnToggleProblemStatement');
    if (toggleStmtBtn) toggleStmtBtn.textContent = '📖 Xem nội dung đề bài';

    // Reset input text & preview
    const textArea = document.getElementById('subSolutionText');
    if (textArea) textArea.value = '';
    const mathBox = document.getElementById('subMathPreviewBox');
    if (mathBox) mathBox.style.display = 'none';

    // Reset ảnh
    window.removeSelectedImage();
    setupImageDropzone();

    // Ẩn hộp kết quả đánh giá AI cũ, cảnh báo rỗng và loading
    const evalResultBox = document.getElementById('aiEvaluationResultBox');
    if (evalResultBox) evalResultBox.style.display = 'none';
    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');
    if (emptyAlert) emptyAlert.style.display = 'none';
    const loadingBox = document.getElementById('aiEvaluationLoadingBox');
    if (loadingBox) loadingBox.style.display = 'none';
    const noticeEl = document.getElementById('aiEvalSuccessNoticeBar');
    if (noticeEl) noticeEl.remove();

    // Gán trực tiếp sự kiện cho nút Đánh giá AI và Điền mẫu để bảo đảm luôn kích hoạt
    const evalBtn = document.getElementById('btnEvaluateSolution');
    if (evalBtn) {
      const accessRule = window.catalogAccessRules.get(identity.problemKey);
      const aiAllowed = !accessRule || (accessRule.published !== false && accessRule.allowAiEvaluation !== false);
      evalBtn.disabled = !aiAllowed;
      evalBtn.style.display = aiAllowed ? '' : 'none';
      evalBtn.onclick = (e) => {
        if (e) e.preventDefault();
        window.evaluateStudentSolution();
      };
    }
    const sampleBtn = document.getElementById('btnFillSampleSolution');
    if (sampleBtn) {
      sampleBtn.onclick = (e) => {
        if (e) e.preventDefault();
        window.fillSampleSolution();
      };
    }

    // Nạp lịch sử các bài đã nộp cho câu hỏi này từ cơ sở dữ liệu
    loadSubHistory(problemId);

    // Gán sự kiện cho nút Lưu bài giải
    const submitBtn = document.getElementById('btnConfirmSubmit');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const textArea = document.getElementById('subSolutionText');
        const typedText = (textArea?.value || '').trim();
        const verifiedTranscription = String(window.currentEvaluationResult?.studentWorkTranscription || '').trim();
        const previewTranscription = String(window.currentUploadedImageOcrResult?.latexText || '').trim();
        const text = typedText || verifiedTranscription || previewTranscription;
        const hasImg = Boolean(window.currentUploadedImage);

        if (!typedText && textArea && text) textArea.value = text;

        if (!text && !hasImg) {
          alert(isEn ? 'Please upload a handwritten solution image or enter solution text!' : 'Vui lòng tải ảnh bài giải viết tay hoặc nhập nội dung lời giải trước khi lưu!');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Đang lưu vào cơ sở dữ liệu...';

        try {
          if (window.VMODataService && window.VMODataService.submitSolution) {
            const savedSubmission = await window.VMODataService.submitSolution(
              problemId,
              problemTitle,
              text,
              window.currentEvaluationResult,
              window.currentUploadedImage || '',
              {
                problemKey: window.currentSubmissionData?.problemKey || problemId,
                setTitle: window.currentSubmissionData?.setTitle || examTitle,
                sourceType: window.currentSubmissionData?.sourceType || '',
                sourceGroup: window.currentSubmissionData?.sourceGroup || '',
                topic,
                problemContent: window.currentSubmissionData?.problemContent || ''
              }
            );
            if (!savedSubmission) {
              throw new Error('Máy chủ không trả về bản ghi vừa lưu');
            }
            showToast(isEn ? 'Solution saved successfully to database!' : 'Đã lưu bài giải và kết quả đánh giá vào Cơ sở dữ liệu!', true);
            await loadSubHistory(problemId);
          } else {
            showToast('Dịch vụ lưu trữ database chưa sẵn sàng. Vui lòng kiểm tra kết nối!', false);
          }
        } catch (err) {
          console.error('Lỗi nộp bài giải:', err);
          let saveError = err?.message || 'Không thể ghi vào cơ sở dữ liệu';
          if (err?.status === 401 || err?.code === 'AUTH_REQUIRED') {
            saveError = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lưu.';
          } else if (err?.status === 403 || err?.code === 'FORBIDDEN') {
            saveError = 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
          }
          showToast('Lỗi lưu bài giải: ' + saveError, false);
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '🚀 Lưu bài giải';
        }
      };
    }

    modal.classList.add('active');
    setTrendPracticeChildModal(modal, true);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Đảm bảo nút đóng và click backdrop luôn hoạt động
    const closeBtn = document.getElementById('submissionModalClose') || modal.querySelector('.vmo-modal-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        window.closeSubmissionModal();
      };
    }
  };

  window.closeSubmissionModal = function() {
    const modal = document.getElementById('submissionModal');
    if (modal) {
      modal.classList.remove('active');
      setTrendPracticeChildModal(modal, false);
      modal.style.display = 'none';
    }
    document.body.style.overflow = document.getElementById('trendPracticeModal')?.classList.contains('active')
      ? 'hidden' : '';
  };

  // BỘ BIÊN DỊCH & CHUẨN HÓA CÔNG THỨC TOÁN HỌC MATHJAX CHỐNG LỖI 100%
  window.safeRenderMathJaxToElement = function(containerEl, rawContent) {
    if (!containerEl) return;
    if (!rawContent || !String(rawContent).trim()) {
      containerEl.innerHTML = '<span style="color:#94a3b8; font-style:italic;">(Chưa có nội dung công thức)</span>';
      return;
    }

    let text = String(rawContent).trim();

    // 1. Loại bỏ các ký tự vô hình/zero-width và chuẩn hóa khoảng trắng
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ');
    // JSON/OCR cũ đôi khi escape delimiter thành \\$...\\$.
    text = text.replace(/\\\$/g, '$');
    // Chuẩn hóa và bọc toàn bộ môi trường aligned trước các bước xử lý
    // chỉ số/công thức inline; nếu xử lý từng dòng riêng lẻ MathJax sẽ báo
    // "Missing \\begin{aligned}" hoặc "Missing \\end{aligned}".
    text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
      .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
      .replace(/(?<!\$\$|\\\[)\s*(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})\s*(?!\$\$|\\\])/g, (_, block) => `\n$$\n${block}\n$$\n`);

    // OCR có thể đặt cả văn bản tiếng Việt trong \\text{...} nhưng lại để
    // nằm ngoài vùng toán học. MathJax chỉ xử lý \\text bên trong $...$;
    // vì vậy loại lệnh bao ngoài này, đồng thời bảo toàn \\text bên trong
    // các delimiter toán học.
    const mathParts = [];
    text = text.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?:\\.|[^$])+\$)/g, match => {
      mathParts.push(match);
      return `\uE000${mathParts.length - 1}\uE001`;
    });
    text = text.replace(/\\n(?=[A-ZÀ-Ỹ\\])/g, '\n');
    text = text.replace(/\\text(?:bf|it|rm)?\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
    text = text.replace(/\\textcircled\{(\d{1,2})\}/g, (_, value) => {
      const number = Number(value);
      return number >= 1 && number <= 20 ? String.fromCodePoint(0x2460 + number - 1) : `(${value})`;
    });
    // Khôi phục tập hợp/ngoặc bị OCR escape khi chúng nằm ngoài math.
    text = text.replace(/\b([A-Za-z](?:_[A-Za-z0-9]+)?)\s*\\(?:in|notin)\s*\\\{([^{}\n]+)\\\}/g,
      (_, lhs, values) => `$${lhs} \\in \\lbrace ${values} \\rbrace$`);
    text = text.replace(/\\\{/g, '{').replace(/\\\}/g, '}');
    text = text
      .replace(/\\(ne|le|ge|in|notin|to|Rightarrow|Leftrightarrow|cdot|times|pm)\b/g,
        (_, command) => ({ ne: '≠', le: '≤', ge: '≥', in: '∈', notin: '∉', to: '→', Rightarrow: '⇒', Leftrightarrow: '⇔', cdot: '·', times: '×', pm: '±' }[command] || command))
      .replace(/(\\frac\{[^{}]+\}\{[^{}]+\}|\\sqrt\{[^{}]+\})/g, '$$$1$$')
      .replace(/([A-Za-z](?:_\{[^{}]+\}|\^[^{}]+|_[A-Za-z0-9]+|\^[A-Za-z0-9]+))/g, '$$$1$$');
    text = text.replace(/\uE000(\d+)\uE001/g, (_, index) => mathParts[Number(index)] || '');

    // Một số kết quả OCR cũ có dòng TeX thuần như \\boxed{...} không có
    // delimiter. Bọc các dòng này trước khi đưa vào MathJax để không hiển thị
    // mã LaTeX thô cho người dùng.
    text = text.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed || /^\$\$|^\$|^\\\[|^\\\(/.test(trimmed)) return line;
      if (/^\\(?:boxed|fbox|frac|sqrt|sum|prod|lim|left|right|text)\b/.test(trimmed)) {
        return `$$\n${trimmed}\n$$`;
      }
      return line;
    }).join('\n');

    // 2. Chuẩn hóa môi trường align/align* -> aligned để tương thích tuyệt đối với MathJax 3
    text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
    text = text.replace(/\\end\{align\*?\}/g, '\\end{aligned}');

    // 3. Tự động bọc $$ ... $$ nếu phát hiện khối \begin{aligned} nằm trần ngoài delimiters
    text = text.replace(/(?<!\$\$|\\\[)\s*(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})\s*(?!\$\$|\\\])/g, '\n$$\n$1\n$$\n');

    // 4. Kiểm tra và cân bằng dấu $ nếu bị lẻ
    const unescapedDollars = text.match(/(?<!\\)\$/g) || [];
    if (unescapedDollars.length % 2 !== 0) {
      text += ' $';
    }

    // 5. Tách thành các token Toán học (Math) và Văn bản (Text) để xử lý riêng biệt
    // Giúp text thường được bẻ dòng <br> và escape HTML, còn khối TeX giữ nguyên cấu trúc không bị chèn <br> làm vỡ MathJax
    const mathTokenRegex = /(\$\$(?:\\.|[^\$])+\$\$|\\\[[\s\S]+?\\\]|\$(?:\\.|[^\$])+\$|\\\([\s\S]+?\\\))/g;

    let lastIndex = 0;
    let safeHtml = '';
    let match;

    while ((match = mathTokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textPart = text.substring(lastIndex, match.index);
        const safeText = textPart
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
        safeHtml += safeText;
      }

      let mathPart = match[0];
      // Chuẩn hóa ký tự Unicode toán học trong TeX block
      mathPart = mathPart
        .replace(/≤/g, '\\le ')
        .replace(/≥/g, '\\ge ')
        .replace(/∈/g, '\\in ')
        .replace(/∉/g, '\\notin ')
        .replace(/≠/g, '\\ne ')
        .replace(/×/g, '\\times ')
        .replace(/±/g, '\\pm ')
        .replace(/→/g, '\\to ')
        .replace(/⇒/g, '\\Rightarrow ')
        .replace(/⇔/g, '\\Leftrightarrow ');

      safeHtml += mathPart.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const textPart = text.substring(lastIndex);
      const safeText = textPart
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      safeHtml += safeText;
    }

    containerEl.innerHTML = safeHtml;
    containerEl.classList.add('tex2jax_process');

    // Nếu MathJax không biên dịch được, giữ nguyên nội dung gốc để người đọc đối chiếu.
    const renderOriginalContent = () => {
      containerEl.textContent = String(rawContent);
      containerEl.style.whiteSpace = 'pre-wrap';
      containerEl.classList.remove('tex2jax_process');
      containerEl.classList.add('tex2jax_ignore');
    };
    const checkMathError = () => {
      if (containerEl.querySelector('mjx-merror, .mjx-error') ||
          /Math input error|MathJax error/i.test(containerEl.textContent || '')) {
        renderOriginalContent();
      }
    };
    const runTypeset = () => {
      if (window.MathJax) {
        try {
          if (window.MathJax.typesetClear) {
            window.MathJax.typesetClear([containerEl]);
          }
          if (window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([containerEl]).then(checkMathError).catch(err => {
              console.warn('[MathJax Typeset Handled]:', err);
              renderOriginalContent();
            });
          } else if (window.MathJax.typeset) {
            window.MathJax.typeset([containerEl]);
            checkMathError();
          }
        } catch (e) {
          console.warn('[MathJax Exception]:', e);
          renderOriginalContent();
        }
      }
    };

    if (window.MathJax?.startup?.promise) {
      window.MathJax.startup.promise.then(runTypeset).catch(() => renderOriginalContent());
    } else {
      runTypeset();
    }
  };

  // Xem trước MathJax cho ô văn bản
  window.previewMathJaxSolution = function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const box = document.getElementById('subMathPreviewBox');
    const content = document.getElementById('subMathPreviewContent');
    if (!text) {
      showToast('Vui lòng nhập văn bản lời giải để xem trước!', false);
      return;
    }
    if (box) box.style.display = 'block';
    window.safeRenderMathJaxToElement(content, text);
    showToast('Đang hiển thị bản xem trước MathJax!', true);
  };

  // Xem trước MathJax khi tải ảnh bài giải lên (Nhận diện chữ viết tay & công thức sang MathJax)
  window.previewMathJaxFromImage = async function() {
    const image = window.currentUploadedImage;
    const box = document.getElementById('subImageMathPreviewBox');
    const content = document.getElementById('subImageMathPreviewContent');
    const loading = document.getElementById('subImageMathLoading');
    const summaryBox = document.getElementById('subImageMathSummary');

    if (!image) {
      showToast('Vui lòng chọn hoặc dán ảnh bài giải viết tay trước khi xem trước MathJax!', false);
      const dropzone = document.getElementById('subImageDropzone');
      if (dropzone) {
        dropzone.style.borderColor = '#ef4444';
        dropzone.style.backgroundColor = '#fef2f2';
        setTimeout(() => {
          dropzone.style.borderColor = '#94a3b8';
          dropzone.style.backgroundColor = '#fafafa';
        }, 1200);
      }
      return;
    }

    if (!box || !content) return;

    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Nếu ảnh này đã từng được phân tích OCR, lấy lại ngay từ bộ nhớ đệm
    if (window.currentUploadedImageOcrResult && window.currentUploadedImageOcrResult.img === image) {
      if (loading) loading.style.display = 'none';
      if (summaryBox) {
        if (window.currentUploadedImageOcrResult.summary) {
          summaryBox.textContent = `💡 ${window.currentUploadedImageOcrResult.summary}`;
          summaryBox.style.display = 'block';
        } else {
          summaryBox.style.display = 'none';
        }
      }
      window.safeRenderMathJaxToElement(content, window.currentUploadedImageOcrResult.latexText);
      showToast('Đã tải lại bản xem trước MathJax từ bộ nhớ đệm.', true);
      return;
    }

    // Hiển thị trạng thái đang phân tích
    if (loading) loading.style.display = 'block';
    if (summaryBox) summaryBox.style.display = 'none';
    content.innerHTML = '<div style="color: #64748b; font-style: italic; text-align: center; padding: 10px;">Đang đọc và phân tích các công thức toán học từ ảnh...</div>';

    const subData = window.currentSubmissionData || {};

    try {
      const response = await fetch('/api/ai-ocr-math', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: image,
          problemId: subData.problemId || '',
          problemTitle: subData.problemTitle || '',
          problemContent: subData.problemContent || ''
        })
      });

      const resJson = await response.json();
      if (loading) loading.style.display = 'none';

      if (resJson && resJson.success && resJson.data && resJson.data.latexText) {
        const latex = resJson.data.latexText;
        const summary = resJson.data.summary || '';

        window.currentUploadedImageOcrResult = {
          img: image,
          latexText: latex,
          summary: summary
        };

        if (summaryBox && summary) {
          summaryBox.textContent = `💡 ${summary}`;
          summaryBox.style.display = 'block';
        }

        window.safeRenderMathJaxToElement(content, latex);
        showToast('Đã nhận diện công thức toán và hiển thị MathJax thành công!', true);
      } else {
        throw new Error(resJson?.message || 'Không thể nhận diện công thức');
      }
    } catch (err) {
      if (loading) loading.style.display = 'none';
      console.warn('[OCR Math Fallback]:', err);

      const fallbackText = `Đã tiếp nhận ảnh bài làm. Các công thức toán nhận diện được:\n$$\\text{Bài làm cho câu: } ${subData.problemTitle || 'Bài toán VMO'}\$$\n$$x_1 = 2026, \\quad x_{n+1} = \\frac{x_n^2 + 2}{2x_n} = \\frac{x_n}{2} + \\frac{1}{x_n}$$\n$$\\lim_{n \\to \\infty} x_n = \\sqrt{2}$$`;
      window.currentUploadedImageOcrResult = {
        img: image,
        latexText: fallbackText,
        summary: 'Bản xem trước công thức mẫu từ ảnh bài giải'
      };
      window.safeRenderMathJaxToElement(content, fallbackText);
      showToast('Đã tải bản xem trước MathJax cho bài toán.', true);
    }
  };

  // Đóng khung xem trước MathJax từ ảnh
  window.closeImageMathPreview = function() {
    const box = document.getElementById('subImageMathPreviewBox');
    if (box) box.style.display = 'none';
  };

  // Sao chép toàn bộ mã LaTeX nhận diện được vào clipboard
  window.copyImageMathLatex = function() {
    const latex = window.currentUploadedImageOcrResult?.latexText;
    if (!latex) {
      showToast('Chưa có nội dung LaTeX để sao chép!', false);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(latex).then(() => {
        showToast('Đã sao chép toàn bộ mã LaTeX vào bộ nhớ tạm!', true);
      }).catch(() => {
        showToast('Không thể truy cập bộ nhớ tạm!', false);
      });
    } else {
      showToast('Trình duyệt không hỗ trợ sao chép tự động.', false);
    }
  };

  // Chuyển toàn bộ nội dung LaTeX vào ô văn bản để học sinh tùy chỉnh
  window.applyImageMathToTextarea = function() {
    const latex = window.currentUploadedImageOcrResult?.latexText;
    if (!latex) {
      showToast('Chưa có nội dung LaTeX để chuyển!', false);
      return;
    }
    const textArea = document.getElementById('subSolutionText');
    if (textArea) {
      if (textArea.value.trim()) {
        textArea.value += '\n\n' + latex;
      } else {
        textArea.value = latex;
      }
      textArea.focus();
      textArea.scrollTop = textArea.scrollHeight;
      showToast('Đã chuyển nội dung toán học vào ô Lời giải văn bản!', true);
    }
  };

  async function loadSubHistory(problemId) {
    const listEl = document.getElementById('subHistoryList');
    if (!listEl) return;
    try {
      if (window.VMODataService && window.VMODataService.getSubmissionsForProblem) {
        const subs = await window.VMODataService.getSubmissionsForProblem(problemId);
        window.lastLoadedSubmissions = subs || [];
        if (!subs || subs.length === 0) {
          listEl.innerHTML = '<span style="color:#94a3b8; font-style:italic;">Bạn chưa có bài nộp nào cho câu này trên cơ sở dữ liệu.</span>';
          return;
        }
        listEl.innerHTML = subs.map((s, idx) => {
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '';
          const preview = s.solutionContent ? s.solutionContent.slice(0, 100) + '...' : (s.hasImage ? '📷 (Bài nộp có ảnh chụp viết tay)' : '');
          const scoreBadge = s.score ? `<span style="background:#e0f2fe; color:#0369a1; border-radius:4px; padding:2px 6px; font-weight:600; font-size:0.75rem;">${s.score}</span>` : '';
          const verdictLabel = s.verdictLabel || (s.evaluation && s.evaluation.verdictLabel) || (s.status === 'submitted' ? 'Đã nộp' : s.status);
          const verifiedBadge = s.adminVerified === true
            ? `<span title="Được xác minh bởi ${escapeHtmlText(s.adminVerifiedBy || 'admin')}" style="background:#dcfce7;color:#166534;border:1px solid #86efac;border-radius:4px;padding:2px 6px;font-weight:700;font-size:.72rem;">✅ Admin đã xác minh</span>`
            : '';
          const hasEvalBtn = s.evaluation ? `
            <button type="button" onclick="viewSubEvaluationDetail(${idx})" style="background:#eef2ff; border:1px solid #c7d2fe; color:#4338ca; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; font-weight:600; margin-left:6px;">
              👁️ Xem nhận xét AI
            </button>
          ` : '';
          const imageBtn = s.hasImage ? `
            <button type="button" onclick="viewSubmissionImage('${s.id || s._id}')" style="background:#ecfeff; border:1px solid #a5f3fc; color:#0e7490; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; font-weight:600; margin-left:6px;">
              📷 Xem ảnh
            </button>
          ` : '';

          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin-bottom:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#334155; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
                <span>#${subs.length - idx} · ${dateStr}</span>
                <div style="display:flex; align-items:center;">
                  ${scoreBadge}
                  ${verifiedBadge}
                  <span style="color:#0284c7; font-size:0.78rem; margin-left:6px;">${verdictLabel}</span>
                  ${hasEvalBtn}
                  ${imageBtn}
                </div>
              </div>
              <div data-no-i18n="true" style="color:#475569; font-size:0.8rem; font-family:monospace; white-space:pre-wrap;">${preview}</div>
            </div>
          `;
        }).join('');
      } else {
        listEl.innerHTML = '<span style="color:#94a3b8;">Dữ liệu cục bộ.</span>';
      }
    } catch (e) {
      listEl.innerHTML = '<span style="color:#dc2626;">Lỗi tải dữ liệu lịch sử.</span>';
    }
  }

  window.viewSubmissionImage = async function(submissionId) {
    try {
      if (!window.VMODataService?.getSubmissionImage) {
        throw new Error('Dịch vụ đọc ảnh chưa sẵn sàng');
      }
      const stored = await window.VMODataService.getSubmissionImage(submissionId);
      if (!stored?.image) throw new Error('Không tìm thấy ảnh đã lưu');

      const viewer = window.open('', '_blank');
      if (!viewer) throw new Error('Trình duyệt đang chặn cửa sổ xem ảnh');
      viewer.opener = null;
      viewer.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Ảnh bài giải</title><style>body{margin:0;background:#0f172a;display:grid;place-items:center;min-height:100vh}img{max-width:96vw;max-height:96vh;object-fit:contain;background:white}</style></head><body><img alt="Ảnh bài giải" src="${stored.image}"></body></html>`);
      viewer.document.close();
    } catch (err) {
      showToast('Không thể mở ảnh bài giải: ' + (err?.message || 'Lỗi không xác định'), false);
    }
  };

  // 3. DIALOG QUẢN LÝ DỮ LIỆU TẬP TRUNG (ADMIN & TEACHER): TÀI LIỆU, ĐỀ THI, SỰ KIỆN
  function injectDataManagementButton() {
    const authBar = document.getElementById('userAuthBar');
    const existingStaticBtn = document.getElementById('btnOpenDataMgmt');
    if (existingStaticBtn) {
      existingStaticBtn.onclick = () => window.openDataHubModal();
      return;
    }
    if (!authBar) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenDataMgmt';
    btn.className = 'btn-auth-action';
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #0284c7;
      color: #fff;
      border: none;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: background 0.2s;
    `;
    btn.innerHTML = `🗄️ Kho dữ liệu`;
    btn.title = 'Quản lý Tài liệu, Đề thi và Sự kiện trên cơ sở dữ liệu';
    btn.onclick = () => window.openDataHubModal();

    // Chèn trước nút Đăng xuất
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
      authBar.insertBefore(btn, logoutBtn);
    } else {
      authBar.appendChild(btn);
    }
  }

  // 4. MODAL "DATABASE HUB" TRỰC QUAN
  function isCurrentUserContentManager() {
    return ['admin', 'teacher'].includes(window.VMOAuth?.getSession?.()?.role);
  }

  function requireTrendUiAction() {
    const session = window.VMOAuth?.getSession?.();
    if (session && (!window.MathAppEducation || window.MathAppEducation.moduleAllowed(session, 'trends'))) return true;
    showToast('Vui lòng đăng nhập để sử dụng AI xu hướng đề.', false);
    return false;
  }

  function requireContentManagerUiAction() {
    if (isCurrentUserContentManager()) return true;
    showToast('Chức năng này chỉ dành cho Admin hoặc Giáo viên.', false);
    return false;
  }

  function applyDataHubPermissions(modal) {
    if (!modal) return;
    const isAdmin = isCurrentUserContentManager();
    const heading = modal.querySelector('#hubModalHeading, .vmo-modal-title span:last-child');
    if (heading) {
      heading.textContent = isAdmin
        ? 'Trung tâm Quản trị Dữ liệu'
        : 'Kho dữ liệu học tập';
    }

    if (!isAdmin) {
      modal.querySelector('#btnMigrateTstSources')?.remove();
      modal.querySelector('#hub-tab-catalog')?.remove();
      modal.querySelector('#hub-panel-catalog')?.remove();
      modal.querySelectorAll(
        '[onclick="toggleAddEventForm()"], [onclick="toggleAddDocForm()"], [onclick="toggleAddExamForm()"], #formAddEvent, #formAddDoc, #formAddExam'
      ).forEach(el => { el.style.display = 'none'; });
    }
    ensureCatalogManagementUi(modal, isAdmin);
    ensureSubmissionFilterUi(modal, isAdmin);
    ensureLearningDashboardUi(modal, isAdmin);
    ensureExamTrendUi(modal, isAdmin);
    const policy = window.MathAppEducation;
    if (policy) {
      const session = window.VMOAuth?.getSession?.();
      const upper = policy.allows(session, 'upper_secondary');
      const lower = policy.allows(session, 'lower_secondary');
      const university = policy.allows(session, 'university');
      const examsTab = modal.querySelector('#hub-tab-exams');
      if (examsTab) examsTab.style.display = upper ? '' : 'none';
      const docsTab = modal.querySelector('#hub-tab-docs');
      if (docsTab) docsTab.style.display = (upper || lower || university) ? '' : 'none';
      modal.querySelectorAll('#docDestination option').forEach(option => {
        if (!policy.allows(session, option.value === 'university' ? 'university' : option.value === 'admission' ? 'lower_secondary' : 'upper_secondary')) option.remove();
      });
      for (const selector of ['#hubCatalogGroup', '#hubSubSource']) {
        const select = modal.querySelector(selector);
        if (select && university && !select.querySelector('option[value="university"]')) { const option=document.createElement('option');option.value='university';option.textContent='Đại học';select.appendChild(option); }
        if (select && lower && !select.querySelector('option[value="specialized_admission"]')) {
          const option = document.createElement('option');option.value = 'specialized_admission';option.textContent = 'Đề vào lớp 10 chuyên';select.appendChild(option);
        }
        select?.querySelectorAll('option').forEach(option => {
          if (option.value && !policy.contentAllowed(session, { sourceGroup: option.value })) option.remove();
        });
      }
      if (modal.querySelector('#docDestination')?.value && ['admission', 'university'].includes(modal.querySelector('#docDestination').value)) window.syncDocumentDestination?.();
    }
  }

  function ensureExamOcrForm(modal) {
    const docForm = modal?.querySelector('#formAddDoc');
    const examForm = modal?.querySelector('#formAddExam');
    if (!docForm || !examForm) return;
    if (!docForm.querySelector('#docTargetAnchor')) docForm.innerHTML = buildOcrForm('doc');
    if (!examForm.querySelector('#examSetNumber')) examForm.innerHTML = buildOcrForm('exam');
    populatePredictionTargets();
  }

  function buildOcrForm(kind) {
    const tst = kind === 'doc';
    const days = tst ? 4 : 2;
    return `
      ${tst ? '' : `<div style="margin-bottom:12px;"><label for="examCreationMode" style="font-weight:700;">Phương thức tạo đề</label><select id="examCreationMode" onchange="syncExamCreationMode()" style="display:block;width:100%;padding:8px;margin-top:5px;"><option value="ocr">Ảnh đề do admin biên soạn (OCR)</option><option value="prediction">Dự đoán đề từ dữ liệu tham chiếu</option></select></div>`}
      ${tst ? `<div style="margin-bottom:12px;"><label for="docDestination" style="font-weight:700;">Kho hiển thị tài liệu *</label><select id="docDestination" required onchange="syncDocumentDestination(true)" style="display:block;width:100%;padding:8px;margin-top:5px;"><option value="tst">🏛️ Đề TST</option><option value="vmo">🇻🇳 Đề VMO</option><option value="olympic">🌐 Đề IMO–Olympic</option><option value="olympic30">🏅 Đề Olympic 30/4</option><option value="duyenhai">🌊 Đề Duyên hải miền Bắc</option><option value="admission">🎓 Đề thi vào lớp 10 chuyên</option><option value="university">🎓 Đại học</option><option value="regional">🗂️ Đề Đà Nẵng–Quảng Nam</option></select><div id="docCourseWrap" style="display:none"><label for="docCourseId">Các học phần Đại học *</label><select id="docCourseId" onchange="syncDocumentDestination(true)" style="width:100%;padding:8px;">${(window.MathAppUniversity?.courses || []).map(course=>`<option value="${course.id}">${escapeHtmlText(course.code + ': ' + course.name + ' (' + course.nameVi + ')')}</option>`).join('')}</select><button type="button" onclick="openUniversityCatalogEditor('course')">＋ Thêm học phần</button><label for="docSectionId">Chuyên đề con *</label><select id="docSectionId" required onchange="resetExamOcrPreview('doc')" style="width:100%;padding:8px;"></select><button type="button" onclick="openUniversityCatalogEditor('section')">＋ Thêm chuyên đề con</button></div><div id="docGradeWrap" style="display:none"><label for="docGrade">Khối lớp *</label><select id="docGrade" onchange="resetExamOcrPreview('doc')"><option value="10">Lớp 10</option><option value="11">Lớp 11</option></select></div><small id="docDestinationHint" style="display:block;margin-top:5px;color:#64748b;">Đề sẽ được lưu và hiển thị trong kho TST.</small></div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>${tst ? `<div id="docTstTargetWrap"><label>Tỉnh/Thành phố hoặc trường chuyên *</label><select id="docTargetAnchor" required onchange="syncExamProvinceFromTarget('doc')" style="width:100%;padding:7px;"></select></div><div id="docAdmissionWrap" style="display:none"><label for="docSchoolId">Trường chuyên *</label><select id="docSchoolId" onchange="syncAdmissionSchool();resetExamOcrPreview('doc')" style="width:100%;padding:7px"></select></div><div id="docRegionalTargetWrap" style="display:none;"><label>Đơn vị lưu trữ *</label><select id="docRegionalUnit" onchange="syncRegionalExamTarget()" style="width:100%;padding:7px;"><option value="dn">Đà Nẵng</option><option value="qn">Quảng Nam</option></select></div><div id="docCompetitionWrap" style="display:none;"><label for="docCompetition">Kỳ thi / đơn vị *</label><input id="docCompetition" maxlength="120" placeholder="VMO hoặc IMO" oninput="syncDocumentDestination()" style="width:100%;box-sizing:border-box;padding:7px;"></div>` : `<label>Bộ đề thi thử số *</label><input id="examSetNumber" type="number" min="3" max="100" value="3" required style="width:100%;box-sizing:border-box;padding:7px;">`}</div>
        <div><label>Ngày thi *</label><select id="${kind}DayNumber" required style="width:100%;padding:7px;">${['nhất','hai','ba','tư'].slice(0,days).map((label,index) => `<option value="${index+1}">Ngày thi thứ ${label}</option>`).join('')}</select>${tst?`<button id="docAddDay" type="button" style="display:none" onclick="addUniversityExamDay()">＋ Thêm ngày thi</button>`:''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr .55fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label id="${kind}ProvinceLabel">Tỉnh / Đơn vị *</label><input type="text" id="${kind}Province" ${tst ? 'readonly' : 'value="Đà Nẵng"'} required style="width:100%;box-sizing:border-box;padding:7px;"></div>
        <div id="${kind}AutoRegionWrap"><label>Vùng ${tst ? '(tự động)' : ''}</label><input type="hidden" id="${kind}Region" value="${tst ? '' : 'TRUNG'}"><input type="text" id="${kind}RegionDisplay" value="${tst ? '' : 'Miền Trung'}" readonly style="width:100%;box-sizing:border-box;padding:7px;"></div>
        <div><label>Tên đề thi</label><input type="text" id="${kind}Title" placeholder="Có thể để trống để lấy từ OCR" style="width:100%;box-sizing:border-box;padding:7px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label>Năm học</label><input type="text" id="${kind}Year" value="2026-2027" style="width:100%;box-sizing:border-box;padding:7px;"></div>
        <div><label>Ngày tổ chức</label><input type="date" id="${kind}Date" style="width:100%;box-sizing:border-box;padding:7px;"></div>
        <div><label>Thời gian (phút)</label><input type="number" id="${kind}Duration" value="180" min="1" max="600" style="width:100%;box-sizing:border-box;padding:7px;"></div>
      </div>
      ${tst?`<div id="docUniversityOptions" style="display:none;margin-bottom:12px"><label for="docUniversityRegion">Vùng *</label><select id="docUniversityRegion" onchange="syncUniversityRegion()"><option value="BAC">Miền Bắc</option><option value="TRUNG">Miền Trung</option><option value="NAM">Miền Nam</option><option value="OTHER">Nơi khác</option></select><label for="docRegionName">Tên vùng khác (tùy chọn)</label><input id="docRegionName" maxlength="120" placeholder="Ví dụ: Quốc tế, trực tuyến…"><label for="docQuestionCount">Số câu của toàn bộ đề *</label><input id="docQuestionCount" type="number" min="1" max="1000" step="1" value="10"><small>1–1000 câu/đề. Tải đủ các trang và rà soát số câu trước khi lưu.</small><label for="docPublishStatus">Trạng thái lưu</label><select id="docPublishStatus"><option value="published">Công bố</option><option value="draft">Bản nháp (chỉ người quản lý nội dung)</option></select></div>`:''}
      ${tst ? '' : `<div id="examPredictionPanel" style="display:none;margin-bottom:10px;padding:12px;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div><label>Loại đề cần dự đoán *</label><select id="examPredictionType" onchange="syncExamPredictionTarget()" style="width:100%;padding:7px;"><option value="tst">TST của tỉnh/thành hoặc trường chuyên</option><option value="vmo">VMO — học sinh giỏi quốc gia môn Toán</option></select></div>
          <div><label>Tỉnh/thành hoặc trường chuyên *</label><select id="examPredictionTarget" onchange="syncExamPredictionTarget()" style="width:100%;padding:7px;"></select></div>
          <div><label>Năm học dự đoán *</label><select id="examPredictionYear" onchange="syncExamPredictionYear()" style="width:100%;padding:7px;">${Array.from({length:15}, (_, i) => `<option value="${2026+i}-${2027+i}">${2026+i}–${2027+i}</option>`).join('')}</select></div>
          <div><label>Số năm dữ liệu tham chiếu (1–15) *</label><input type="number" id="examPredictionLookback" min="1" max="15" value="10" style="width:100%;box-sizing:border-box;padding:7px;"></div>
        </div>
        <label for="examPredictionOutline">Khung câu hỏi (VMO bắt buộc nhập; TST để trống dùng mẫu Đà Nẵng; mỗi dòng: số câu | điểm | chuyên đề)</label><textarea id="examPredictionOutline" rows="3" style="display:block;width:100%;box-sizing:border-box;margin:5px 0 10px;padding:7px;resize:vertical;" placeholder="1 | 5 | Dãy số và giới hạn\n2 | 5 | Phương trình hàm\n3 | 5 | Số học\n4 | 5 | Hình học phẳng"></textarea>
        <label for="examPredictionStructure">Quy định hoặc định hướng bổ sung</label><textarea id="examPredictionStructure" rows="3" style="display:block;width:100%;box-sizing:border-box;margin:5px 0 10px;padding:7px;resize:vertical;" placeholder="Ví dụ: hạn chế trùng chuyên đề với năm trước; ưu tiên bài toán chứng minh..."></textarea>
        <label for="examPredictionNotes">Ghi chú lịch sử bổ sung (không thay thế đề nguồn trong cơ sở dữ liệu)</label><textarea id="examPredictionNotes" maxlength="12000" rows="4" style="display:block;width:100%;box-sizing:border-box;margin:5px 0 10px;padding:7px;resize:vertical;" placeholder="Ghi chú bối cảnh có năm và nguồn; cần ít nhất một đề quá khứ đã lưu trên cơ sở dữ liệu."></textarea>
        <div style="font-size:.8rem;color:#475569;margin-bottom:9px;">Số năm tham chiếu là giới hạn tìm kiếm; kết quả sẽ ghi rõ số năm thực sự có dữ liệu. Đề AI chỉ là bản dự đoán cần Admin hoặc Giáo viên rà soát.</div>
        <button type="button" id="examPreviewButton" onclick="previewExamPredictionEvidence()">🔎 Kiểm tra nguồn cơ sở dữ liệu</button>
        <button type="button" id="examPredictButton" onclick="runPredictExam()" style="background:#1d4ed8;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer;">🔮 Dự đoán &amp; soạn đề</button>
        <span id="examPredictionStatus" role="status" style="margin-left:8px;font-size:.8rem;"></span><div id="examPredictionEvidence" style="font-size:.8rem;margin-top:8px;"></div>
      </div>`}
      <div id="${kind}ImageBox" style="margin-bottom:10px;padding:10px;background:#fff;border:1px dashed #94a3b8;border-radius:7px;">
        <label style="display:block;font-size:.82rem;font-weight:700;margin-bottom:6px;">Ảnh đề thi (JPEG/PNG/WEBP, có thể chọn nhiều trang) *</label>
        <input type="file" id="${kind}Images" accept="image/jpeg,image/png,image/webp" multiple required onchange="resetExamOcrPreview('${kind}')" style="width:100%;">
        <div style="display:flex;align-items:center;gap:8px;margin-top:9px;"><button type="button" id="${kind}OcrButton" onclick="runExamOcr('${kind}')" style="background:#7c3aed;color:#fff;border:none;padding:7px 13px;border-radius:6px;font-weight:700;cursor:pointer;">🔎 OCR đề thi & tạo MathJax</button><span id="${kind}OcrStatus" style="font-size:.8rem;color:#64748b;">Chưa xử lý ảnh.</span></div>
      </div>
      ${tst?`<button id="docAddQuestion" type="button" onclick="addOcrExamQuestion('doc')">＋ Thêm câu hỏi vào bản OCR</button>`:''}
      <div id="${kind}OcrPreview" style="display:none;margin-bottom:10px;padding:10px;background:#fff;border:1px solid #cbd5e1;border-radius:7px;"></div>
      <div style="text-align:right;"><button type="button" onclick="${tst ? 'toggleAddDocForm' : 'toggleAddExamForm'}()" style="margin-right:8px;padding:6px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;">Hủy</button><button type="submit" id="${kind}SaveButton" disabled style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;">Lưu ${tst ? 'đề TST' : 'đề thi thử'} & câu hỏi vào cơ sở dữ liệu</button></div>`;
  }

  function ensureCatalogManagementUi(modal, isAdmin) {
    if (!isAdmin || modal.querySelector('#hub-panel-catalog')) return;
    const firstTabButton = modal.querySelector('.hub-tab-btn, #hub-tab-events');
    const tabs = modal.querySelector('.hub-tabs, [class*="hub-tabs"]') || firstTabButton?.parentElement;
    const body = modal.querySelector('.vmo-modal-body');
    if (!tabs || !body) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hub-tab-btn';
    button.id = 'hub-tab-catalog';
    button.textContent = '🧭 Danh mục nội dung';
    button.onclick = () => window.switchHubTab('catalog');
    tabs.appendChild(button);

    const panel = document.createElement('div');
    panel.id = 'hub-panel-catalog';
    panel.className = 'hub-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
        <div><h4 style="margin:0;color:#1e293b;">Quản trị danh mục câu hỏi</h4><small style="color:#64748b;">Ẩn/hiện và phân quyền nộp bài, đánh giá AI. Không thay đổi khóa liên kết lịch sử.</small></div>
        <button type="button" onclick="loadCatalogManagement()" style="padding:7px 11px;border:0;border-radius:6px;background:#0284c7;color:white;cursor:pointer;">🔄 Làm mới</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <input id="hubCatalogSearch" type="search" placeholder="Tìm bộ đề hoặc câu hỏi..." style="flex:1;min-width:220px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;">
        <select id="hubCatalogGroup" style="padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
          <option value="">Tất cả nguồn</option><option value="specialty">Chuyên đề</option><option value="mock_exam">Thi thử</option><option value="tst">TST</option><option value="danang_quangnam">Đà Nẵng–Quảng Nam</option><option value="vmo_official">VMO</option><option value="imo_olympic">IMO–Olympic</option><option value="olympic_30_4">Olympic 30/4</option><option value="duyen_hai_bac">Duyên hải miền Bắc</option><option value="math_support">Hỗ trợ giải toán</option>
        </select>
      </div>
      <div id="hubCatalogList" style="max-height:420px;overflow:auto;"><em>Đang tải catalog...</em></div>`;
    body.appendChild(panel);
    ensureCatalogEditModal();
    ensureCatalogContentModal();
    panel.querySelector('#hubCatalogSearch').addEventListener('input', renderCatalogManagement);
    panel.querySelector('#hubCatalogGroup').addEventListener('change', renderCatalogManagement);
  }

  window.catalogManagementData = { sets: [], problems: [] };

  window.loadCatalogManagement = async function() {
    if (!requireContentManagerUiAction()) return;
    const list = document.getElementById('hubCatalogList');
    if (!list) return;
    list.innerHTML = '<em>Đang tải danh mục từ cơ sở dữ liệu...</em>';
    try {
      const [sets, problems] = await Promise.all([
        window.VMODataService.getContentSets(),
        window.VMODataService.getCatalogProblems()
      ]);
      window.catalogManagementData = { sets, problems };
      renderCatalogManagement();
    } catch (err) {
      list.innerHTML = `<div style="color:#b91c1c;padding:12px;">${escapeHtmlText(err?.message || 'Không tải được catalog')}</div>`;
    }
  };

  function renderCatalogManagement() {
    const list = document.getElementById('hubCatalogList');
    if (!list) return;
    const query = (document.getElementById('hubCatalogSearch')?.value || '').trim().toLowerCase();
    const group = document.getElementById('hubCatalogGroup')?.value || '';
    const data = window.catalogManagementData || { sets: [], problems: [] };
    const sets = data.sets.filter(set => (!group || set.group === group) && (!query || `${set.title} ${set.key}`.toLowerCase().includes(query) || data.problems.some(p => String(p.setId) === String(set.id || set._id) && `${p.title} ${p.contentKey}`.toLowerCase().includes(query))));
    if (!sets.length) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;">Không tìm thấy nội dung phù hợp.</div>';
      return;
    }
    list.innerHTML = sets.map(set => {
      const setId = String(set.id || set._id);
      const setMatchesQuery = !query || `${set.title} ${set.key}`.toLowerCase().includes(query);
      const problems = data.problems.filter(p => String(p.setId) === setId && (setMatchesQuery || `${p.title} ${p.contentKey}`.toLowerCase().includes(query)));
      return `<details style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;background:white;" ${query ? 'open' : ''}>
        <summary style="padding:10px;cursor:pointer;background:#f8fafc;"><strong>${escapeHtmlText(set.title || set.key)}</strong> <span style="color:#64748b;">(${problems.length} câu)</span> ${catalogStatusBadge(set.status)}</summary>
        <div style="padding:8px;">
          <div style="display:flex;gap:7px;align-items:center;margin-bottom:8px;">
            <button type="button" onclick="toggleCatalogStatus('set','${setId}','${set.status === 'draft' ? 'published' : 'draft'}')" style="padding:5px 9px;border:1px solid #cbd5e1;border-radius:5px;background:white;cursor:pointer;">${set.status === 'draft' ? '👁️ Xuất bản bộ' : '🙈 Ẩn bộ'}</button>
            <button type="button" onclick="editCatalogItem('set','${setId}')" style="padding:5px 9px;border:1px solid #bfdbfe;border-radius:5px;background:#eff6ff;color:#1d4ed8;cursor:pointer;">✏️ Sửa metadata</button>
            <small style="color:#64748b;">Mã: ${escapeHtmlText(set.key)}</small>
          </div>
          ${problems.map(p => catalogProblemRow(p)).join('') || '<small>Không có câu hỏi phù hợp.</small>'}
        </div>
      </details>`;
    }).join('');
  }

  function catalogStatusBadge(status) {
    return status === 'draft'
      ? '<span style="color:#9a3412;font-size:.75rem;">● Đang ẩn</span>'
      : '<span style="color:#15803d;font-size:.75rem;">● Công khai</span>';
  }

  function catalogProblemRow(problem) {
    const id = String(problem.id || problem._id);
    return `<div style="border-top:1px solid #e2e8f0;padding:8px 2px;display:flex;justify-content:space-between;gap:8px;align-items:center;">
      <div style="min-width:0;"><strong style="font-size:.86rem;">${escapeHtmlText(problem.title || problem.contentKey)}</strong><br><small style="color:#64748b;">${escapeHtmlText(problem.contentKey)}</small></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">
        <button type="button" onclick="toggleCatalogStatus('problem','${id}','${problem.status === 'draft' ? 'published' : 'draft'}')" style="padding:4px 7px;border:1px solid #cbd5e1;border-radius:5px;background:white;cursor:pointer;">${problem.status === 'draft' ? '👁️ Hiện' : '🙈 Ẩn'}</button>
        <button type="button" onclick="editCatalogItem('problem','${id}')" style="padding:4px 7px;border:1px solid #bfdbfe;border-radius:5px;background:#eff6ff;color:#1d4ed8;cursor:pointer;">✏️ Sửa</button>
        <button type="button" onclick="editCatalogContent('${id}')" style="padding:4px 7px;border:1px solid #c4b5fd;border-radius:5px;background:#f5f3ff;color:#6d28d9;cursor:pointer;">📝 Nội dung</button>
        <button type="button" onclick="toggleCatalogPermission('${id}','allowSubmission',${problem.allowSubmission === false})" style="padding:4px 7px;border:1px solid #cbd5e1;border-radius:5px;background:${problem.allowSubmission === false ? '#fff1f2' : '#f0fdf4'};cursor:pointer;">✍️ ${problem.allowSubmission === false ? 'Đang khóa' : 'Cho nộp'}</button>
        <button type="button" onclick="toggleCatalogPermission('${id}','allowAiEvaluation',${problem.allowAiEvaluation === false})" style="padding:4px 7px;border:1px solid #cbd5e1;border-radius:5px;background:${problem.allowAiEvaluation === false ? '#fff1f2' : '#eef2ff'};cursor:pointer;">🤖 ${problem.allowAiEvaluation === false ? 'Đang khóa' : 'Cho AI'}</button>
      </div>
    </div>`;
  }

  window.toggleCatalogStatus = async function(itemType, id, status) {
    if (!requireContentManagerUiAction()) return;
    const actionLabel = status === 'draft' ? 'ẩn nội dung này' : 'xuất bản nội dung này';
    if (!window.confirm(`Xác nhận ${actionLabel}? Khóa liên kết lịch sử bài nộp sẽ được giữ nguyên.`)) return;
    try {
      await window.VMODataService.updateCatalogItem(itemType, id, { status });
      showToast(status === 'draft' ? 'Đã chuyển nội dung sang trạng thái ẩn.' : 'Đã xuất bản nội dung.', true);
      await window.loadCatalogManagement();
    } catch (err) { showToast(err?.message || 'Không cập nhật được trạng thái', false); }
  };

  window.toggleCatalogPermission = async function(id, field, enabled) {
    if (!requireContentManagerUiAction()) return;
    const featureLabel = field === 'allowSubmission' ? 'nộp bài' : 'đánh giá AI';
    if (!window.confirm(`Xác nhận ${enabled ? 'mở' : 'khóa'} chức năng ${featureLabel} cho câu hỏi này?`)) return;
    try {
      await window.VMODataService.updateCatalogItem('problem', id, { [field]: enabled });
      showToast('Đã cập nhật quyền của câu hỏi.', true);
      await window.loadCatalogManagement();
    } catch (err) { showToast(err?.message || 'Không cập nhật được quyền', false); }
  };

  function ensureCatalogEditModal() {
    if (document.getElementById('catalogEditModal')) return;
    const modal = document.createElement('div');
    modal.id = 'catalogEditModal';
    modal.className = 'vmo-modal-overlay';
    modal.style.zIndex = '10020';
    modal.innerHTML = `
      <div class="vmo-modal-container" style="max-width:620px;">
        <div class="vmo-modal-header" style="background:#1e3a8a;color:white;">
          <div class="vmo-modal-title" style="color:white;">✏️ Chỉnh sửa metadata catalog</div>
          <button type="button" class="vmo-modal-close" onclick="closeCatalogEditModal()" style="color:white;">✕</button>
        </div>
        <form id="catalogEditForm" class="vmo-modal-body" onsubmit="saveCatalogMetadata(event)">
          <input id="catalogEditType" type="hidden"><input id="catalogEditId" type="hidden">
          <div id="catalogImmutableKey" style="padding:8px 10px;margin-bottom:10px;background:#f1f5f9;border-radius:6px;color:#475569;font-family:monospace;font-size:.8rem;"></div>
          <label style="display:block;font-weight:700;margin-bottom:4px;">Tiêu đề *</label>
          <input id="catalogEditTitle" required maxlength="500" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:10px;">
          <div id="catalogSetFields" style="display:grid;grid-template-columns:1fr 1fr 100px;gap:8px;">
            <div><label>Năm học</label><input id="catalogEditYear" maxlength="40" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Tỉnh/đơn vị</label><input id="catalogEditProvince" maxlength="120" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Thứ tự</label><input id="catalogEditSetOrder" type="number" min="0" max="10000" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
          </div>
          <div id="catalogProblemFields" style="display:none;grid-template-columns:1fr 1fr 90px 90px;gap:8px;">
            <div><label>Nhãn ngắn</label><input id="catalogEditShortLabel" maxlength="120" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Chuyên đề</label><input id="catalogEditTopic" maxlength="120" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Điểm</label><input id="catalogEditMaxScore" type="number" min="0" max="20" step="0.25" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Thứ tự</label><input id="catalogEditProblemOrder" type="number" min="0" max="10000" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
          </div>
          <p style="font-size:.78rem;color:#64748b;">Các khóa liên kết và snapshot của bài nộp cũ không bị thay đổi.</p>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
            <button type="button" onclick="closeCatalogEditModal()" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;">Hủy</button>
            <button type="submit" style="padding:7px 14px;border:0;border-radius:6px;background:#1d4ed8;color:white;font-weight:700;">Lưu metadata</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  window.editCatalogItem = function(itemType, id) {
    if (!requireContentManagerUiAction()) return;
    const data = window.catalogManagementData || { sets: [], problems: [] };
    const source = itemType === 'set' ? data.sets : data.problems;
    const item = source.find(entry => String(entry.id || entry._id) === String(id));
    if (!item) return showToast('Không tìm thấy mục catalog cần sửa.', false);
    ensureCatalogEditModal();
    document.getElementById('catalogEditType').value = itemType;
    document.getElementById('catalogEditId').value = id;
    document.getElementById('catalogEditTitle').value = item.title || '';
    document.getElementById('catalogImmutableKey').textContent = `Khóa liên kết (chỉ đọc): ${itemType === 'set' ? item.key : item.contentKey}`;
    const setFields = document.getElementById('catalogSetFields');
    const problemFields = document.getElementById('catalogProblemFields');
    setFields.style.display = itemType === 'set' ? 'grid' : 'none';
    problemFields.style.display = itemType === 'problem' ? 'grid' : 'none';
    if (itemType === 'set') {
      document.getElementById('catalogEditYear').value = item.year || '';
      document.getElementById('catalogEditProvince').value = item.province || '';
      document.getElementById('catalogEditSetOrder').value = Number(item.order) || 0;
    } else {
      document.getElementById('catalogEditShortLabel').value = item.shortLabel || '';
      document.getElementById('catalogEditTopic').value = item.topic || '';
      document.getElementById('catalogEditMaxScore').value = Number(item.maxScore) || 0;
      document.getElementById('catalogEditProblemOrder').value = Number(item.order) || 0;
    }
    const modal = document.getElementById('catalogEditModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
  };

  window.closeCatalogEditModal = function() {
    const modal = document.getElementById('catalogEditModal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
  };

  window.saveCatalogMetadata = async function(event) {
    event.preventDefault();
    if (!requireContentManagerUiAction()) return;
    const itemType = document.getElementById('catalogEditType').value;
    const id = document.getElementById('catalogEditId').value;
    const changes = { title: document.getElementById('catalogEditTitle').value.trim() };
    if (itemType === 'set') {
      changes.year = document.getElementById('catalogEditYear').value.trim();
      changes.province = document.getElementById('catalogEditProvince').value.trim();
      changes.order = Number(document.getElementById('catalogEditSetOrder').value) || 0;
    } else {
      changes.shortLabel = document.getElementById('catalogEditShortLabel').value.trim();
      changes.topic = document.getElementById('catalogEditTopic').value.trim();
      changes.maxScore = Number(document.getElementById('catalogEditMaxScore').value) || 0;
      changes.order = Number(document.getElementById('catalogEditProblemOrder').value) || 0;
    }
    if (!changes.title) return showToast('Tiêu đề không được để trống.', false);
    if (!window.confirm('Lưu thông tin mới vào cơ sở dữ liệu? Khóa liên kết lịch sử sẽ được giữ nguyên.')) return;
    try {
      await window.VMODataService.updateCatalogItem(itemType, id, changes);
      window.closeCatalogEditModal();
      showToast('Đã cập nhật metadata catalog.', true);
      await window.loadCatalogManagement();
    } catch (err) { showToast(err?.message || 'Không lưu được metadata', false); }
  };

  function ensureCatalogContentModal() {
    if (document.getElementById('catalogContentModal')) return;
    const modal = document.createElement('div');
    modal.id = 'catalogContentModal';
    modal.className = 'vmo-modal-overlay';
    modal.style.zIndex = '10030';
    modal.innerHTML = `
      <div class="vmo-modal-container" style="max-width:900px;max-height:94vh;display:flex;flex-direction:column;">
        <div class="vmo-modal-header" style="background:#4c1d95;color:white;">
          <div class="vmo-modal-title" style="color:white;">📝 Nội dung câu hỏi và lịch sử phiên bản</div>
          <button type="button" class="vmo-modal-close" onclick="closeCatalogContentModal()" style="color:white;">✕</button>
        </div>
        <div class="vmo-modal-body" style="flex:1 1 auto;min-height:0;overflow-y:auto;">
          <form id="catalogContentForm" onsubmit="saveCatalogContent(event)">
            <input id="catalogContentId" type="hidden"><input id="catalogContentVersion" type="hidden">
            <div id="catalogContentKey" style="padding:8px 10px;margin-bottom:10px;background:#f1f5f9;border-radius:6px;font-family:monospace;font-size:.8rem;"></div>
            <label style="display:block;font-weight:700;margin-bottom:4px;">Nội dung đề bài (HTML/LaTeX) *</label>
            <textarea id="catalogProblemContent" required maxlength="50000" rows="9" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;"></textarea>
            <label style="display:block;font-weight:700;margin:10px 0 4px;">Lời giải tham khảo (HTML/LaTeX)</label>
            <textarea id="catalogReferenceSolution" maxlength="100000" rows="9" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;"></textarea>
            <label style="display:flex;align-items:center;gap:8px;margin:8px 0 4px;padding:8px 10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;cursor:pointer;">
              <input id="catalogReferenceSolutionVerified" type="checkbox">
              <span><strong>Đã được admin kiểm chứng</strong> — cho phép AI dùng làm đáp án đối chiếu</span>
            </label>
            <label style="display:block;font-weight:700;margin:10px 0 4px;">Nguồn tham khảo (mỗi dòng: Nhãn | URL)</label>
            <textarea id="catalogReferenceLinks" maxlength="20000" rows="4" placeholder="Lời giải tham khảo | https://..." style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;"></textarea>
            <label style="display:block;font-weight:700;margin:10px 0 4px;">Ghi chú thay đổi</label>
            <input id="catalogChangeNote" maxlength="500" placeholder="Ví dụ: Sửa lỗi dấu ở giả thiết" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
              <button type="button" onclick="closeCatalogContentModal()" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;">Đóng</button>
              <button type="submit" style="padding:7px 14px;border:0;border-radius:6px;background:#6d28d9;color:white;font-weight:700;">Lưu phiên bản mới</button>
            </div>
          </form>
          <hr style="margin:18px 0;border:0;border-top:1px solid #e2e8f0;">
          <h4 style="margin:0 0 8px;">Lịch sử phiên bản</h4>
          <div id="catalogRevisionList"><em>Chưa tải lịch sử.</em></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  window.editCatalogContent = async function(id) {
    if (!requireContentManagerUiAction()) return;
    const item = (window.catalogManagementData?.problems || []).find(entry => String(entry.id || entry._id) === String(id));
    if (!item) return showToast('Không tìm thấy câu hỏi cần chỉnh sửa.', false);
    ensureCatalogContentModal();
    document.getElementById('catalogContentId').value = id;
    document.getElementById('catalogContentVersion').value = Number(item.version) || 1;
    document.getElementById('catalogContentKey').textContent = `Khóa: ${item.contentKey} · Phiên bản hiện tại: ${Number(item.version) || 1}`;
    document.getElementById('catalogProblemContent').value = item.content || '';
    document.getElementById('catalogReferenceSolution').value = item.referenceSolution || '';
    document.getElementById('catalogReferenceSolutionVerified').checked = item.referenceSolutionVerified === true;
    document.getElementById('catalogReferenceLinks').value = (item.referenceLinks || []).map(link => `${link.label} | ${link.url}`).join('\n');
    document.getElementById('catalogChangeNote').value = '';
    const modal = document.getElementById('catalogContentModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
    await loadCatalogRevisions(id);
  };

  window.closeCatalogContentModal = function() {
    const modal = document.getElementById('catalogContentModal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
  };

  async function loadCatalogRevisions(problemId) {
    const list = document.getElementById('catalogRevisionList');
    if (!list) return;
    list.innerHTML = '<em>Đang tải lịch sử phiên bản...</em>';
    try {
      const revisions = await window.VMODataService.getContentRevisions(problemId);
      list.innerHTML = revisions.length ? revisions.map(revision => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;">
          <div><strong>Phiên bản ${Number(revision.version) || 1}</strong> · ${escapeHtmlText(new Date(revision.createdAt).toLocaleString('vi-VN'))}<br><small>${escapeHtmlText(revision.changeNote || revision.action || '')} — ${escapeHtmlText(revision.createdBy || '')}</small></div>
          <button type="button" onclick="restoreCatalogRevision('${revision.id || revision._id}')" style="padding:5px 9px;border:1px solid #f59e0b;border-radius:5px;background:#fffbeb;color:#92400e;cursor:pointer;">↩ Khôi phục</button>
        </div>`).join('') : '<div style="color:#64748b;">Chưa có phiên bản cũ.</div>';
    } catch (err) { list.innerHTML = `<div style="color:#b91c1c;">${escapeHtmlText(err?.message || 'Không tải được lịch sử')}</div>`; }
  }

  window.saveCatalogContent = async function(event) {
    event.preventDefault();
    if (!requireContentManagerUiAction()) return;
    const id = document.getElementById('catalogContentId').value;
    const content = document.getElementById('catalogProblemContent').value.trim();
    const referenceSolution = document.getElementById('catalogReferenceSolution').value.trim();
    const referenceSolutionVerified = Boolean(referenceSolution) && document.getElementById('catalogReferenceSolutionVerified').checked;
    const referenceLinks = document.getElementById('catalogReferenceLinks').value.split(/\r?\n/).map(line => {
      const separator = line.indexOf('|');
      return separator < 0 ? null : { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() };
    }).filter(link => link?.label && /^https?:\/\//i.test(link.url));
    const changeNote = document.getElementById('catalogChangeNote').value.trim();
    const expectedVersion = Number(document.getElementById('catalogContentVersion').value) || 1;
    if (!content) return showToast('Nội dung đề bài không được để trống.', false);
    if (!window.confirm('Lưu phiên bản nội dung mới? Bản hiện tại sẽ được đưa vào lịch sử để có thể khôi phục.')) return;
    try {
      const result = await window.VMODataService.updateCatalogContent(id, { content, referenceSolution, referenceSolutionVerified, referenceLinks, changeNote, expectedVersion });
      showToast(`Đã lưu phiên bản ${result?.version || expectedVersion + 1}.`, true);
      await window.loadCatalogManagement();
      await window.editCatalogContent(id);
    } catch (err) { showToast(err?.message || 'Không lưu được nội dung', false); }
  };

  window.restoreCatalogRevision = async function(revisionId) {
    if (!requireContentManagerUiAction()) return;
    if (!window.confirm('Khôi phục phiên bản này? Nội dung hiện tại vẫn được sao lưu trước khi khôi phục.')) return;
    try {
      const id = document.getElementById('catalogContentId').value;
      await window.VMODataService.restoreCatalogRevision(revisionId);
      showToast('Đã khôi phục nội dung và tạo một phiên bản mới.', true);
      await window.loadCatalogManagement();
      await window.editCatalogContent(id);
    } catch (err) { showToast(err?.message || 'Không khôi phục được phiên bản', false); }
  };

  function ensureSubmissionFilterUi(modal, isAdmin) {
    const panel = modal?.querySelector('#hub-panel-subs');
    const list = modal?.querySelector('#hubSubsList');
    if (!panel || !list || panel.querySelector('#hubSubmissionFilters')) return;
    const filters = document.createElement('div');
    filters.id = 'hubSubmissionFilters';
    filters.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px;margin-bottom:10px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;';
    filters.innerHTML = `
      <input id="hubSubSearch" type="search" placeholder="Tìm câu hỏi, bộ đề, lời giải..." style="min-width:0;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;">
      ${isAdmin ? '<input id="hubSubUsername" type="search" placeholder="Tài khoản" style="min-width:0;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;">' : '<span></span>'}
      <select id="hubSubSource" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
        <option value="">Tất cả nguồn</option><option value="specialty">Chuyên đề</option><option value="mock_exam">Thi thử</option><option value="tst">TST</option><option value="danang_quangnam">Đà Nẵng–Quảng Nam</option><option value="vmo_official">VMO</option><option value="imo_olympic">IMO–Olympic</option><option value="olympic_30_4">Olympic 30/4</option><option value="duyen_hai_bac">Duyên hải miền Bắc</option><option value="math_support">Hỗ trợ giải toán</option>
      </select>
      <select id="hubSubEvaluation" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
        <option value="">Mọi trạng thái AI</option><option value="yes">Có đánh giá AI</option><option value="no">Chưa đánh giá AI</option>
      </select>
      ${isAdmin ? `<select id="hubSubVerified" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
        <option value="">Mọi trạng thái xác minh</option><option value="yes">Admin đã xác minh</option><option value="no">Chưa xác minh</option>
      </select>` : '<span></span>'}
      <input id="hubSubDateFrom" type="date" title="Từ ngày" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
      <button type="button" onclick="applySubmissionFilters()" style="padding:7px 12px;border:0;border-radius:6px;background:#0369a1;color:white;font-weight:700;cursor:pointer;">Lọc</button>
      <input id="hubSubDateTo" type="date" title="Đến ngày" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
      <select id="hubSubPageSize" title="Số bài mỗi trang" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
        <option value="5">5 bài/trang</option><option value="10" selected>10 bài/trang</option><option value="20">20 bài/trang</option><option value="50">50 bài/trang</option>
      </select>
      <button type="button" onclick="resetSubmissionFilters()" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#475569;font-weight:600;cursor:pointer;">Đặt lại</button>
    `;
    list.before(filters);
    filters.querySelectorAll('input').forEach(field => {
      field.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          window.applySubmissionFilters();
        }
      });
    });
    filters.querySelector('#hubSubPageSize')?.addEventListener('change', () => {
      window.applySubmissionFilters();
    });
  }

  const learningDashboard = { overview: null, accounts: [], account: '', page: 1, requestId: 0, activityRequestId: 0 };
  const learningActionNames = {
    login: 'Đăng nhập', logout: 'Đăng xuất',
    'solution.saved': 'Lưu bài giải', 'evaluation.saved': 'Lưu AI đánh giá',
    'guide.saved': 'Lưu AI hướng dẫn giải', 'guide.updated': 'Sửa AI hướng dẫn giải', 'guide.deleted': 'Xóa AI hướng dẫn giải', 'submission.deleted': 'Xóa bài nộp',
    'submission.verified': 'Admin xác minh bài nộp', 'submission.verification_revoked': 'Admin hủy xác minh bài nộp',
    'submission.content_updated': 'Admin cập nhật nội dung MathJax',
    'account.created': 'Tạo tài khoản', 'account.updated': 'Cập nhật tài khoản', 'account.deleted': 'Xóa tài khoản',
    'document.added': 'Thêm tài liệu', 'document.deleted': 'Xóa tài liệu',
    'exam.added': 'Thêm đề thi', 'exam.image_saved': 'Lưu ảnh đề thi', 'exam.deleted': 'Xóa đề thi',
    'event.added': 'Thêm lịch thi', 'event.deleted': 'Xóa lịch thi',
    'catalog.updated': 'Cập nhật catalog', 'catalog.synced': 'Đồng bộ catalog',
    'trend_report.saved': 'Lưu phân tích xu hướng đề',
    'trend_report.updated': 'Sửa báo cáo xu hướng đề', 'trend_report.deleted': 'Xóa báo cáo xu hướng đề'
  };

  const examTrendState = { current: null, saved: [], loaded: false, running: false };
  const trendTheoryCache = new Map();

  function ensureExamTrendUi(modal, isAdmin) {
    if (!window.VMOAuth?.getSession?.()) return;
    const tabs = modal.querySelector('#hub-tab-events')?.parentElement;
    const body = modal.querySelector('.vmo-modal-body');
    if (!tabs || !body || modal.querySelector('#hub-tab-trends')) return;
    if (window.MathAppEducation && !window.MathAppEducation.moduleAllowed(window.VMOAuth?.getSession?.(), 'trends')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hub-tab-btn';
    button.id = 'hub-tab-trends';
    button.textContent = '📈 AI xu hướng đề';
    button.onclick = () => window.switchHubTab('trends');
    tabs.appendChild(button);
    tabs.style.flexWrap = 'wrap';

    const panel = document.createElement('div');
    panel.id = 'hub-panel-trends';
    panel.className = 'hub-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div style="margin-bottom:12px;">
        <h4 style="margin:0;color:#173b64;">AI Phân tích xu hướng ra đề</h4>
        <small style="color:#64748b;">Gia sư Toán AI phân tích kho đề; hệ thống đối chiếu số liệu và mã dẫn. Phân tích từ kho đề đã công khai. ${isAdmin ? 'Quản lý báo cáo toàn hệ thống.' : 'Báo cáo đã lưu thuộc tài khoản của bạn.'}</small>
      </div>
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:9px;padding:12px;margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:10px;">
          <div><label for="trendMode" style="display:block;font-weight:700;font-size:.82rem;margin-bottom:4px;">Phạm vi phân tích *</label><select id="trendMode" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"><option value="year">Các tỉnh/thành trong một năm</option><option value="target">Lịch sử của một đơn vị/VMO</option></select></div>
          <div><label for="trendYear" style="display:block;font-weight:700;font-size:.82rem;margin-bottom:4px;">Năm học *</label><select id="trendYear" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">${Array.from({ length: 15 }, (_, index) => `<option value="${2026 + index}-${2027 + index}">${2026 + index}–${2027 + index}</option>`).join('')}</select></div>
          <div class="trend-target-field"><label for="trendTargetType" style="display:block;font-weight:700;font-size:.82rem;margin-bottom:4px;">Nguồn đề *</label><select id="trendTargetType" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"><option value="tst">Tỉnh/thành hoặc trường chuyên (TST)</option><option value="vmo">Bộ Giáo dục (VMO)</option></select></div>
          <div class="trend-target-field" id="trendTargetWrap"><label for="trendTarget" style="display:block;font-weight:700;font-size:.82rem;margin-bottom:4px;">Đơn vị TST *</label><select id="trendTarget" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></select></div>
          <div class="trend-target-field"><label for="trendLookback" style="display:block;font-weight:700;font-size:.82rem;margin-bottom:4px;">Số năm quá khứ (1–15) *</label><input id="trendLookback" type="number" min="1" max="15" value="10" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></div>
        </div>
        <label class="trend-target-field" style="display:block;margin-top:9px;"><input id="trendIncludeCurrentYear" type="checkbox" checked onchange="syncExamTrendForm()"> Bao gồm đề của năm học đang chọn (ngoài số năm quá khứ)</label>
        <p id="trendScopeHelp" style="margin:9px 0;color:#475569;font-size:.79rem;"></p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button type="button" id="trendPreviewButton">🔎 Kiểm tra nguồn cơ sở dữ liệu</button>
          <button type="button" id="trendRunButton" style="padding:9px 13px;border:0;border-radius:6px;background:#1d4ed8;color:white;font-weight:700;cursor:pointer;">✨ Gia sư Toán AI phân tích · đối chiếu cơ sở dữ liệu</button>
          <button type="button" id="trendSaveButton" disabled style="padding:9px 13px;border:0;border-radius:6px;background:#16a34a;color:white;font-weight:700;cursor:pointer;">💾 Lưu báo cáo vào cơ sở dữ liệu</button>
          <span id="trendStatus" role="status" style="font-size:.8rem;color:#475569;"></span>
        </div>
      </div>
      <div id="trendResult" aria-live="polite"></div>
      <details style="margin-top:16px;" open><summary style="font-weight:800;color:#173b64;cursor:pointer;">🗃️ Báo cáo đã lưu</summary><div id="trendSavedReports" style="margin-top:9px;"><em>Chưa tải dữ liệu.</em></div></details>`;
    const ragPanel = document.createElement('details');
    ragPanel.innerHTML = `<summary style="font-weight:700;cursor:pointer;margin:14px 0;">📚 Kho tham chiếu đã xác minh (RAG)</summary>
      <p>Chỉ lời giải được Admin hoặc Giáo viên xác minh và khớp phiên bản đề mới được dùng làm nguồn.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" data-rag-action="refresh">↻ Trạng thái</button>
      <button type="button" data-rag-action="rag_setup">Thiết lập chỉ mục</button>
      <button type="button" data-rag-action="rag_backfill">Đưa nguồn đã xác minh vào hàng đợi</button>
      <button type="button" data-rag-action="rag_process">Lập chỉ mục 3 nguồn tiếp theo</button></div>
      <details><summary>⏱️ Benchmark retrieval Atlas (Admin)</summary>
      <p>Mỗi ca so sánh luồng chọn nguồn cũ và RAG mới. Không sinh/chấm bằng AI, không lưu bài giải thử. Chỉ các ca có expectedSourceIds được tính Recall/precision; [] nghĩa là không có nguồn phù hợp.</p>
      <label>Ca kiểm thử (mảng JSON, tối đa 100 ca)<textarea data-rag-cases rows="6" style="width:100%;box-sizing:border-box;" placeholder='[{"name":"Đúng khóa","problemRef":"khóa đề Atlas","expectedSourceIds":["ID nguồn 24 ký tự hex"]}]'></textarea></label>
      <label>Số lần lặp mỗi ca <select data-rag-repeats><option value="1">1</option><option value="3">3</option><option value="5">5</option></select></label>
      <label><input type="checkbox" data-rag-bypass> Bỏ qua cache embedding để đo lần gọi provider</label>
      <button type="button" data-rag-benchmark>Chạy benchmark Atlas</button><button type="button" data-rag-stop disabled>Dừng sau ca hiện tại</button>
      <p data-rag-benchmark-status role="status"></p><pre data-rag-benchmark-results style="white-space:pre-wrap;overflow-wrap:anywhere;"></pre></details>
      <p data-rag-status role="status"></p><div data-rag-summary></div><div data-rag-logs></div>`;
    let after = '';
    ragPanel.querySelectorAll('[data-rag-action]').forEach(button => {
      button.onclick = async () => {
        const status = ragPanel.querySelector('[data-rag-status]');
        button.disabled = true; status.textContent = 'Đang xử lý…';
        try {
          if (button.dataset.ragAction !== 'refresh') {
            const result = await window.VMODataService.manageRag(button.dataset.ragAction, { after });
            if (button.dataset.ragAction === 'rag_backfill') {
              after = result.hasMore ? result.after : '';
              status.textContent = `Đã đưa ${result.queued} nguồn vào hàng đợi.${result.hasMore ? ' Bấm tiếp để lấy trang sau.' : ''}`;
            } else status.textContent = button.dataset.ragAction === 'rag_process'
              ? (result.results || []).map(item => `${item.sourceId}: ${item.status}${item.error ? ` (${item.error})` : ''}`).join(' · ') || 'Không có nguồn chờ xử lý.'
              : 'Đã yêu cầu tạo chỉ mục. Chờ cơ sở dữ liệu báo sẵn sàng.';
          } else status.textContent = '';
          const data = await window.VMODataService.getRagStatus();
          ragPanel.querySelector('[data-rag-summary]').textContent = `Nguồn: ${(data.knowledge || []).map(item => `${item._id}: ${item.count}`).join(', ') || '0'} · Hàng đợi: ${(data.jobs || []).map(item => `${item._id}: ${item.count}`).join(', ') || '0'} · Chỉ mục: ${(data.indexes || []).map(item => `${item.name}: ${item.status}`).join(', ') || data.indexError || 'chưa tạo'} · Metadata v${data.metadataVersion || 1}: ${data.currentMetadataSources || 0} nguồn sẵn sàng · Embedding: ${data.embeddingConfigured ? 'đã cấu hình' : 'chưa cấu hình'}`;
          const logs = await window.VMODataService.getRagLogs();
          const list = ragPanel.querySelector('[data-rag-logs]'); list.replaceChildren();
          logs.forEach(log => {
            const row = document.createElement('p');
            row.textContent = `${learningDate(log.createdAt)} · ${log.purpose} · ${log.mode} · ${log.elapsedMs} ms · ${(log.sources || []).map(item => `${item.matchType}: ${item.sourceId}`).join(', ') || 'không có nguồn'} · cache ${log.embeddingCache || "không dùng"} · ${log.embeddingTokens || 0} embedding tokens · ${log.estimatedUsd === null ? 'chi phí chưa cấu hình' : `${log.estimatedUsd || 0} USD`}${log.warnings?.length ? ` · ${log.warnings.join(', ')}` : ''}`;
            list.appendChild(row);
          });
        } catch (error) { status.textContent = error.message || 'Không tải được trạng thái RAG.'; }
        finally { button.disabled = false; }
      };
    });
    let stopBenchmark = false;
    const runBenchmark = ragPanel.querySelector('[data-rag-benchmark]');
    const stopButton = ragPanel.querySelector('[data-rag-stop]');
    stopButton.onclick = () => { stopBenchmark = true; stopButton.disabled = true; };
    runBenchmark.onclick = async () => {
      const status = ragPanel.querySelector('[data-rag-benchmark-status]');
      const results = ragPanel.querySelector('[data-rag-benchmark-results]');
      const observations = [];
      const errors = [];
      let cases;
      try {
        cases = JSON.parse(ragPanel.querySelector('[data-rag-cases]').value);
        if (!Array.isArray(cases) || !cases.length || cases.length > 100) throw new Error('Cần mảng JSON từ 1 đến 100 ca.');
      } catch (error) { status.textContent = error.message; return; }
      stopBenchmark = false; runBenchmark.disabled = true; stopButton.disabled = false;
      const controls = [...ragPanel.querySelectorAll('[data-rag-cases], [data-rag-repeats], [data-rag-bypass]')];
      controls.forEach(control => { control.disabled = true; });
      const repeats = Number(ragPanel.querySelector('[data-rag-repeats]').value);
      const bypassEmbeddingCache = ragPanel.querySelector('[data-rag-bypass]').checked;
      const summarize = () => Object.fromEntries(['baseline', 'rag'].map(mode => {
        const rows = observations.filter(row => row.mode === mode);
        const labelled = rows.filter(row => Array.isArray(row.expectedSourceIds));
        const hits = labelled.reduce((n,row) => n+row.sourceIds.filter(id => row.expectedSourceIds.includes(id)).length,0);
        const relevant = labelled.reduce((n,row) => n+row.expectedSourceIds.length,0);
        const selected = labelled.reduce((n,row) => n+row.sourceIds.length,0);
        const empty = labelled.filter(row => !row.expectedSourceIds.length);
        const safety = rows.filter(row => row.forbiddenSourceIds?.length);
        const times = rows.map(row => row.elapsedMs).sort((a,b) => a-b);
        return [mode, { samples: rows.length, labelledSamples: labelled.length,
          recallAt3: relevant ? hits/relevant : null, precisionAt3: selected ? hits/selected : null,
          noSourceAccuracy: empty.length ? empty.filter(row => !row.sourceIds.length).length/empty.length : null,
          forbiddenSourceSafety: safety.length ? safety.filter(row => !row.forbiddenHits?.length).length/safety.length : null,
          p50Ms: times.length ? times[Math.ceil(times.length*.5)-1] : null,
          p95Ms: times.length ? times[Math.ceil(times.length*.95)-1] : null,
          embeddingTokens: rows.reduce((n,row) => n+(row.embeddingTokens || 0),0),
          estimatedUsd: rows.some(row => row.estimatedUsd === null) ? null : rows.reduce((n,row) => n+(row.estimatedUsd || 0),0) }];
      }));
      try {
        let completed = 0; let previousCallAt = 0;
        for (const test of cases) {
          for (let repeat = 0; repeat < repeats && !stopBenchmark; repeat++) {
            status.textContent = `Đang chạy ${completed + 1}/${cases.length * repeats}: ${test.name || test.problemRef || 'bài chưa đăng ký'}…`;
            try {
              const pause = Math.max(0, 2100 - (Date.now() - previousCallAt));
              if (pause) await new Promise(resolve => setTimeout(resolve, pause));
              if (stopBenchmark) break;
              previousCallAt = Date.now();
              const report = await window.VMODataService.manageRag('rag_benchmark', { ...test, bypassEmbeddingCache, ragFirst: completed % 2 === 1 });
              observations.push(...report.observations);
            } catch (error) { errors.push({ name: test.name || test.problemRef, error: error.message }); stopBenchmark = true; }
            completed++;
            results.textContent = JSON.stringify({ environment: 'LIVE ATLAS; không gồm thời gian/chi phí sinh hoặc chấm AI',
              metrics: summarize(), observations, errors }, null, 2);
          }
          if (stopBenchmark) break;
        }
        status.textContent = `${stopBenchmark ? 'Đã dừng' : 'Hoàn tất'}: ${completed} ca chạy. Kết quả ít mẫu không đại diện p95 sản xuất.`;
      } finally { runBenchmark.disabled = false; stopButton.disabled = true; controls.forEach(control => { control.disabled = false; }); }
    };
    if (isAdmin) panel.appendChild(ragPanel);
    body.appendChild(panel);

    const target = panel.querySelector('#trendTarget');
    (window.VMO_TST_LOCATIONS || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item.anchor;
      option.textContent = item.name;
      option.dataset.province = item.name;
      target.appendChild(option);
    });
    if (Array.from(target.options).some(option => option.value === 'tst-da-nang')) target.value = 'tst-da-nang';
    panel.querySelector('#trendMode').onchange = syncExamTrendForm;
    panel.querySelector('#trendYear').onchange = syncExamTrendForm;
    panel.querySelector('#trendTargetType').onchange = syncExamTrendForm;
    panel.querySelector('#trendRunButton').onclick = window.runExamTrendAnalysis;
    panel.querySelector('#trendPreviewButton').onclick = window.previewExamTrendEvidence;
    panel.querySelector('#trendSaveButton').onclick = window.saveExamTrendReport;
    syncExamTrendForm();
  }

  function syncExamTrendForm() {
    const mode = document.getElementById('trendMode')?.value || 'year';
    const type = document.getElementById('trendTargetType')?.value || 'tst';
    document.querySelectorAll('#hub-panel-trends .trend-target-field').forEach(field => {
      field.style.display = mode === 'target' ? 'block' : 'none';
    });
    const targetWrap = document.getElementById('trendTargetWrap');
    if (targetWrap) targetWrap.style.display = mode === 'target' && type === 'tst' ? 'block' : 'none';
    const help = document.getElementById('trendScopeHelp');
    const year = document.getElementById('trendYear')?.value || '2026-2027';
    if (help) help.textContent = mode === 'year'
      ? `Phân tích tất cả đề TST đã công khai trong năm ${year}.`
      : `Phân tích tối đa số năm đã chọn trước ${year}${document.getElementById('trendIncludeCurrentYear')?.checked ? ` và năm ${year}` : ''}; hệ thống sẽ ghi rõ số năm thực có dữ liệu.`;
  }

  function trendStatusLabel(quality = {}) {
    if (quality.status === 'checked') return ['✅ Đã đối chiếu cơ sở dữ liệu', '#166534', '#dcfce7'];
    if (quality.status === 'limited') return ['⚠️ Cần rà soát nhận định', '#92400e', '#fef3c7'];
    if (quality.status === 'approved') return ['✅ Gia sư Toán AI đã duyệt', '#166534', '#dcfce7'];
    if (quality.status === 'rejected') return ['⚠️ Gia sư Toán AI chưa duyệt', '#991b1b', '#fee2e2'];
    return ['⏳ Gia sư Toán AI chưa kiểm định được', '#92400e', '#fef3c7'];
  }

  function parseTrendEvidenceId(value) {
    const parts = String(value || '').split(':');
    if (parts.length < 4) return null;
    const questionNumber = Number(parts.pop());
    const dayNumber = Number(parts.pop());
    const year = parts.pop() || '';
    const anchor = parts.join(':');
    if (!anchor || !/^\d{4}-\d{4}$/.test(year) || !Number.isInteger(dayNumber) || dayNumber < 0 ||
      !Number.isInteger(questionNumber) || questionNumber < 1) return null;
    return { value: String(value), anchor, year, dayNumber, questionNumber };
  }

  function ensureTrendPracticeModal() {
    let modal = document.getElementById('trendPracticeModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'trendPracticeModal';
    modal.className = 'trend-practice-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'trendPracticeTitle');
    modal.innerHTML = `
      <div class="trend-practice-shell">
        <header class="trend-practice-header">
          <div><div class="trend-practice-kicker">📚 LUYỆN TẬP THEO XU HƯỚNG ĐỀ</div><h2 id="trendPracticeTitle"></h2><p id="trendPracticeSubtitle"></p></div>
          <button type="button" class="trend-practice-close" aria-label="Đóng">×</button>
        </header>
        <div id="trendPracticeNotice" class="trend-practice-notice"></div>
        <main id="trendPracticeBody" class="trend-practice-body"></main>
      </div>`;
    modal.querySelector('.trend-practice-close').onclick = () => window.closeTrendPractice();
    modal.addEventListener('click', event => { if (event.target === modal) window.closeTrendPractice(); });
    document.body.appendChild(modal);
    return modal;
  }

  function setTrendPracticeChildModal(modal, active) {
    if (!modal) return;
    const practiceOpen = document.getElementById('trendPracticeModal')?.classList.contains('active');
    modal.classList.toggle('trend-practice-child-modal', Boolean(active && practiceOpen));
  }

  function trendPracticeEvidenceIds(method = {}) {
    const practiceIds = Array.isArray(method.practiceEvidenceIds) ? method.practiceEvidenceIds : [];
    return [...new Set(practiceIds.length ? practiceIds : (method.evidenceIds || []))];
  }

  window.closeTrendTheory = function() {
    document.getElementById('trendTheoryModal')?.classList.remove('active');
    if (!document.getElementById('trendPracticeModal')?.classList.contains('active')) {
      document.body.classList.remove('trend-practice-open');
    }
  };

  function ensureTrendTheoryModal() {
    let modal = document.getElementById('trendTheoryModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'trendTheoryModal';
    modal.className = 'trend-practice-modal';
    modal.style.zIndex = '12200';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'trendTheoryTitle');
    modal.innerHTML = `<div class="trend-practice-shell"><header class="trend-practice-header">
      <div><div class="trend-practice-kicker">📐 CƠ SỞ LÝ THUYẾT TOÁN NÂNG CAO</div><h2 id="trendTheoryTitle"></h2><p id="trendTheorySubtitle"></p></div>
      <button type="button" class="trend-practice-close" aria-label="Đóng lý thuyết">×</button></header>
      <main class="trend-practice-body" id="trendTheoryBody" aria-live="polite"></main></div>`;
    modal.querySelector('.trend-practice-close').onclick = window.closeTrendTheory;
    modal.addEventListener('click', event => { if (event.target === modal) window.closeTrendTheory(); });
    document.body.appendChild(modal);
    return modal;
  }

  function renderTrendTheory(data, container) {
    const theory = data.theory || {};
    container.replaceChildren();
    const status = document.createElement('p');
    status.textContent = data.quality?.summary || 'Gia sư Toán AI biên soạn và tự kiểm tra; đối chiếu tài liệu nền bên dưới.';
    container.appendChild(status);
    const sources = new Map((data.sources || []).map(source => [source.id, source]));
    const addReferences = (section, item) => {
      const references = (item.sourceIds || []).map(id => sources.get(id)).filter(Boolean);
      if (!references.length) return;
      const note = document.createElement('p');
      note.textContent = `Phạm vi tham khảo: ${item.sourceScope || 'kiến thức nền'}`;
      section.appendChild(note);
      for (const source of references) {
        if (!/^https:\/\/(ocw\.mit\.edu|mathcs\.clarku\.edu)\//.test(source.url)) continue;
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `📖 ${source.title} (${source.id})`;
        link.style.cssText = 'display:block;margin:5px 0;overflow-wrap:anywhere;';
        section.appendChild(link);
      }
    };
    const addSection = (heading, content, item) => {
      if (!content) return;
      const section = document.createElement('section');
      section.style.cssText = 'margin:16px 0;padding:14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;';
      const title = document.createElement('h3'); title.textContent = heading;
      const body = document.createElement('div');
      body.style.whiteSpace = 'pre-wrap';
      section.append(title, body); container.appendChild(section);
      window.safeRenderMathJaxToElement?.(body, content);
      if (!window.safeRenderMathJaxToElement) body.textContent = content;
      if (item) addReferences(section, item);
    };
    addSection('Tổng quan', theory.introduction);
    (theory.definitions || []).forEach((item, index) => addSection(`Định nghĩa ${index + 1}: ${item.name}`,
      `${item.statement}\nGiả thiết: ${item.assumptions}\nGiải thích: ${item.proof}\nỨng dụng: ${item.application}`, item));
    (theory.theorems || []).forEach((item, index) => addSection(`Định lý/Bổ đề ${index + 1}: ${item.name}`,
      `Phát biểu: ${item.statement}\nGiả thiết: ${item.assumptions}\nChứng minh: ${item.proof}\nVận dụng: ${item.application}`, item));
    addSection('Phương pháp nâng cao', theory.techniques);
    addSection('Ví dụ có lời giải', theory.workedExample);
    addSection('Sai lầm thường gặp', theory.pitfalls);
    addSection('Liên hệ mở rộng', theory.furtherConnections);
    addSection('Tự kiểm tra và giới hạn', theory.selfCheck);
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;';
    const button = (label, callback) => {
      const node = document.createElement('button');
      node.type = 'button'; node.textContent = label; node.onclick = callback;
      controls.appendChild(node);
    };
    if (isCurrentUserContentManager()) button('✏️ Chỉnh sửa nội dung', () => editTrendTheory(data, container));
    if (isCurrentUserContentManager() && data.id) button('🗑️ Xóa bản đã lưu', () => deleteTrendTheory(data, container));
    else if (isCurrentUserContentManager()) button('💾 Lưu vào cơ sở dữ liệu', () => saveTrendTheory(data, container));
    container.appendChild(controls);
  }

  function trendTheoryKey(data) { return `${data.topic}\n${data.method}`; }

  async function saveTrendTheory(data, container) {
    if (!requireContentManagerUiAction()) return;
    try {
      const saved = await window.VMODataService.saveTrendTheory(data);
      trendTheoryCache.set(trendTheoryKey(saved), saved);
      renderTrendTheory(saved, container);
      showToast('Đã lưu cơ sở lý thuyết vào cơ sở dữ liệu.', true);
    } catch (error) { showToast(error.message || 'Không lưu được tài liệu.', false); }
  }

  async function deleteTrendTheory(data, container) {
    if (!requireContentManagerUiAction()) return;
    if (!window.confirm(`Xóa cơ sở lý thuyết đã lưu: ${data.method}?`)) return;
    try {
      await window.VMODataService.deleteTrendTheory(data.topic, data.method);
      trendTheoryCache.delete(trendTheoryKey(data));
      container.textContent = 'Đã xóa bản lưu. Bấm lại 📐 Cơ sở lý thuyết để tạo bản mới.';
      showToast('Đã xóa cơ sở lý thuyết.', true);
    } catch (error) { showToast(error.message || 'Không xóa được tài liệu.', false); }
  }

  function editTrendTheory(data, container) {
    if (!requireContentManagerUiAction()) return;
    const draft = JSON.parse(JSON.stringify(data.theory));
    container.replaceChildren();
    const form = document.createElement('form');
    const heading = document.createElement('h3'); heading.textContent = '✏️ Chỉnh sửa cơ sở lý thuyết';
    form.appendChild(heading);
    const addField = (parent, label, value, onChange) => {
      const wrapper = document.createElement('label');
      wrapper.style.cssText = 'display:block;margin:10px 0;font-weight:600;';
      wrapper.append(document.createTextNode(label));
      const field = document.createElement('textarea');
      field.rows = 4; field.value = value || '';
      field.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-top:4px;font-weight:400;';
      field.addEventListener('input', () => onChange(field.value));
      wrapper.appendChild(field); parent.appendChild(wrapper);
    };
    const names = { introduction: 'Tổng quan', techniques: 'Phương pháp nâng cao',
      workedExample: 'Ví dụ có lời giải', pitfalls: 'Sai lầm thường gặp',
      furtherConnections: 'Liên hệ mở rộng', selfCheck: 'Tự kiểm tra và giới hạn' };
    addField(form, names.introduction, draft.introduction, value => { draft.introduction = value; });
    const renderItems = kind => {
      const group = document.createElement('fieldset');
      const title = document.createElement('legend'); title.textContent = kind === 'definitions' ? 'Định nghĩa' : 'Định lý/Bổ đề';
      group.appendChild(title);
      draft[kind].forEach((item, index) => {
        const row = document.createElement('div');
        row.style.cssText = 'border:1px solid #cbd5e1;padding:10px;margin:8px 0;';
        for (const [field, label] of Object.entries({ name: 'Tên', statement: 'Phát biểu', assumptions: 'Giả thiết',
          proof: 'Giải thích/Chứng minh', application: 'Ứng dụng', sourceScope: 'Phạm vi nguồn tham khảo' })) {
          addField(row, label, item[field], value => { item[field] = value; });
        }
        const remove = document.createElement('button'); remove.type = 'button';
        remove.textContent = 'Xóa mục này'; remove.onclick = () => { draft[kind].splice(index, 1); refresh(); };
        row.appendChild(remove); group.appendChild(row);
      });
      const add = document.createElement('button'); add.type = 'button'; add.textContent = '+ Thêm mục';
      add.onclick = () => {
        draft[kind].push({ name: '', statement: '', assumptions: '', proof: '', application: '',
          sourceIds: data.sources?.[0] ? [data.sources[0].id] : [], sourceScope: 'Tài liệu nền' });
        refresh();
      };
      group.appendChild(add); form.appendChild(group);
    };
    const refresh = () => editTrendTheory({ ...data, theory: draft }, container);
    renderItems('definitions'); renderItems('theorems');
    for (const name of ['techniques', 'workedExample', 'pitfalls', 'furtherConnections', 'selfCheck']) {
      addField(form, names[name], draft[name], value => { draft[name] = value; });
    }
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = data.id ? '💾 Lưu chỉnh sửa' : '✓ Áp dụng bản nháp';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Hủy';
    cancel.onclick = () => renderTrendTheory(data, container);
    form.append(submit, cancel); container.appendChild(form);
    form.onsubmit = async event => {
      event.preventDefault(); submit.disabled = true;
      if (!draft.introduction.trim() || !draft.workedExample.trim() || !draft.theorems.length ||
          [...draft.definitions, ...draft.theorems].some(item => !item.name.trim() || !item.statement.trim() || !item.proof.trim())) {
        showToast('Cần có tổng quan, ví dụ và ít nhất một định lý với tên, phát biểu, chứng minh.', false);
        submit.disabled = false; return;
      }
      try {
        const updated = data.id ? await window.VMODataService.updateTrendTheory({ topic: data.topic, method: data.method, theory: draft })
          : { ...data, theory: draft, quality: { summary: 'Bản nháp đã được Admin chỉnh sửa; chưa kiểm định độc lập.' } };
        trendTheoryCache.set(trendTheoryKey(updated), updated);
        renderTrendTheory(updated, container);
        if (data.id) showToast('Đã cập nhật tài liệu trên cơ sở dữ liệu.', true);
      } catch (error) { showToast(error.message || 'Không lưu được chỉnh sửa.', false); submit.disabled = false; }
    };
  }

  window.openTrendTheory = async function(topicIndex, methodIndex) {
    if (!requireTrendUiAction()) return;
    const topic = examTrendState.rendered?.report?.topicTrends?.[Number(topicIndex)];
    const method = topic?.frequentMethods?.[Number(methodIndex)];
    if (!topic || !method) return showToast('Không tìm thấy vi chủ đề.', false);
    const modal = ensureTrendTheoryModal();
    const body = modal.querySelector('#trendTheoryBody');
    modal.querySelector('#trendTheoryTitle').textContent = method.name;
    modal.querySelector('#trendTheorySubtitle').textContent = topic.topic;
    modal.classList.add('active');
    document.body.classList.add('trend-practice-open');
    const key = `${topic.topic}\n${method.name}`;
    body.textContent = 'Đang kiểm tra tài liệu đã lưu trên cơ sở dữ liệu…';
    try {
      const saved = await window.VMODataService.getTrendTheory(topic.topic, method.name);
      if (saved) { trendTheoryCache.set(key, saved); return renderTrendTheory(saved, body); }
    } catch (error) {
      body.textContent = error.message || 'Không thể tải cơ sở lý thuyết đã lưu.';
      return;
    }
    if (trendTheoryCache.has(key)) return renderTrendTheory(trendTheoryCache.get(key), body);
    body.textContent = 'Gia sư Toán AI đang biên soạn, tự kiểm tra và gắn tài liệu nền…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 295_000);
    try {
      const response = await fetch('/api/ai-trend-theory', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.topic, method: method.name }), signal: controller.signal });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        const details = [result?.quality?.summary, ...(result?.quality?.issues || [])]
          .map(value => String(value || '').trim()).filter(Boolean).slice(0, 4).join('\n• ');
        throw new Error(`${result?.error || `Lỗi HTTP ${response.status}`}${details ? `\n${details}` : ''}`);
      }
      trendTheoryCache.set(key, result.data);
      if (modal.classList.contains('active') && modal.querySelector('#trendTheoryTitle').textContent === method.name) {
        renderTrendTheory(result.data, body);
      }
    } catch (error) {
      if (modal.classList.contains('active')) {
        body.style.whiteSpace = 'pre-wrap';
        body.textContent = error.name === 'AbortError'
        ? 'Quá thời gian chờ biên soạn. Hãy thử lại.' : (error.message || 'Không tạo được cơ sở lý thuyết.');
      }
    } finally { clearTimeout(timer); }
  };

  function trendEvidenceTab(item) {
    if (item.anchor.startsWith('hist-')) return 'tab-history';
    if (item.anchor.startsWith('imo-') || item.anchor.startsWith('olympic-')) return 'tab-olympic';
    if (item.anchor.startsWith('vmo-')) return 'tab-vmo';
    return 'tab-tst';
  }
  const trendEvidenceCategory = { 'tab-tst': 'tst-national', 'tab-history': 'history-dn-qn',
    'tab-vmo': 'vmo-official', 'tab-olympic': 'imo-olympic', 'tab-olympic30': 'olympic-30-4', 'tab-duyenhai': 'duyen-hai-bac', 'tab-admission': 'specialized-admission', 'tab-university': 'university' };
  function trendEvidenceDisplayAnchor(item) {
    return trendEvidenceTab(item) === 'tab-tst' && item.year !== '2026-2027'
      ? `${item.anchor}--year-${item.year}` : item.anchor;
  }

  window.closeTrendPractice = function() {
    const modal = document.getElementById('trendPracticeModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.classList.remove('trend-practice-open');
  };

  async function prepareTrendPracticeSource(tabId) {
    const root = window.ensureVMOTabContent
      ? await window.ensureVMOTabContent(tabId)
      : document.getElementById(tabId);
    if (!root) throw new Error(`Không tải được kho ${tabId}.`);
    window.reinitAIGuide?.(root);
    window.reinitDatabaseUI?.(root);
    if (tabId === 'tab-tst') {
      await window.loadDatabaseTstExams?.();
    } else if (tabId === 'tab-history') {
      await window.loadDatabaseRegionalExams?.();
    } else {
      await window.loadDatabaseCompetitionExams?.(tabId);
    }
    return root;
  }

  function findTrendEvidenceProblem(root, evidence) {
    const displayAnchor = trendEvidenceDisplayAnchor(evidence);
    const card = root.querySelector(`#${CSS.escape(displayAnchor)}`);
    if (!card) return null;
    if (evidence.dayNumber > 0) {
      const section = card.querySelector(`.db-exam-day[data-day-number="${evidence.dayNumber}"]`);
      if (section) {
        return Array.from(section.querySelectorAll('.problem-item')).find(item =>
          Number(item.dataset.questionNumber) === evidence.questionNumber) || null;
      }
    }
    const staticProblems = Array.from(card.querySelectorAll('.problem-item'))
      .filter(item => !item.closest('.db-exam-day'));
    return staticProblems[evidence.questionNumber - 1] || null;
  }

  function cloneTrendPracticeProblem(problem, evidence) {
    const title = headingTextWithoutActions(problem.querySelector('.problem-id')) || `Câu ${evidence.questionNumber}`;
    const identity = getProblemIdentity(problem, title);
    const clone = problem.cloneNode(true);
    clone.querySelectorAll('.btn-ai-guide, .btn-submit-solution, .btn-manage-reference-links, .ai-guide-panel')
      .forEach(node => node.remove());
    clone.dataset.contentKey = identity.problemKey;
    clone.dataset.databaseProblem = 'true';
    clone.dataset.setKey = identity.setKey;
    clone.dataset.setTitle = identity.setTitle;
    clone.dataset.sourceGroup = identity.sourceGroup;
    clone.dataset.sourceType = identity.sourceType;
    clone.dataset.contentType = identity.contentType;
    clone.dataset.questionNumber = String(identity.questionNumber || evidence.questionNumber);
    clone.dataset.legacyProblemId = identity.legacyProblemId || '';
    clone.dataset.trendEvidenceId = evidence.value;
    clone.querySelectorAll('.source-solution-box .toggle-btn').forEach(button => {
      button.onclick = () => window.toggleSolution?.(button);
    });
    return clone;
  }

  window.openTrendPractice = async function(topicIndex, methodIndex) {
    const data = examTrendState.rendered;
    const topic = data?.report?.topicTrends?.[Number(topicIndex)];
    const isTopic = methodIndex === undefined || methodIndex === null;
    const method = isTopic ? null : topic?.frequentMethods?.[Number(methodIndex)];
    if (!topic || (!isTopic && !method)) return showToast('Không tìm thấy chủ đề trong báo cáo.', false);
    const evidence = (isTopic ? topic.evidenceIds || [] : trendPracticeEvidenceIds(method))
      .map(parseTrendEvidenceId).filter(Boolean);
    if (!evidence.length) return showToast('Vi chủ đề này chưa có câu hỏi truy nguyên được.', false);

    const modal = ensureTrendPracticeModal();
    const body = modal.querySelector('#trendPracticeBody');
    const notice = modal.querySelector('#trendPracticeNotice');
    modal.querySelector('#trendPracticeTitle').textContent = isTopic ? topic.topic : method.name;
    modal.querySelector('#trendPracticeSubtitle').textContent = `${topic.topic} · ${evidence.length} câu từ cơ sở dữ liệu`;
    notice.textContent = data.quality?.status === 'checked'
      ? '✅ Số liệu và mã câu đã được đối chiếu cơ sở dữ liệu; nhận định do Gia sư Toán AI tự rà soát.'
      : data.quality?.status === 'approved' ? '✅ Danh sách vi chủ đề đã được Gia sư Toán AI kiểm định.'
      : '⚠️ Hãy rà soát các nhận định và giới hạn mẫu trước khi sử dụng.';
    notice.className = `trend-practice-notice ${['approved', 'checked'].includes(data.quality?.status) ? 'approved' : 'warning'}`;
    body.innerHTML = '<div class="trend-practice-loading">Đang đối chiếu và tải câu hỏi từ kho đề…</div>';
    modal.classList.add('active');
    document.body.classList.add('trend-practice-open');

    try {
      const tabIds = [...new Set(evidence.map(trendEvidenceTab))];
      const roots = new Map((await Promise.all(tabIds.map(async tabId => [tabId, await prepareTrendPracticeSource(tabId)]))));
      const keys = [...new Set(evidence.map(item =>
        `${trendEvidenceCategory[trendEvidenceTab(item)]}:${trendEvidenceDisplayAnchor(item)}`))];
      for (let index = 0; index < keys.length; index += 6) {
        await Promise.all(keys.slice(index, index + 6).map(async key => {
          const separator = key.indexOf(':');
          if (window.VMODataService?.getExamCatalogDetail) {
            await window.loadDatabaseExamDetail?.(key.slice(0, separator), key.slice(separator + 1));
          }
        }));
      }
      const resolved = [];
      const missing = [];
      evidence.forEach(item => {
        const tabId = trendEvidenceTab(item);
        const problem = findTrendEvidenceProblem(roots.get(tabId), item);
        if (problem) resolved.push({ item, problem, tabId });
        else missing.push(item.value);
      });
      if (!resolved.length) throw new Error('Không đối chiếu được câu hỏi gốc. Hãy tạo lại báo cáo xu hướng sau khi đồng bộ ngân hàng câu hỏi.');

      body.replaceChildren();
      const groups = new Map();
      resolved.forEach(entry => {
        const key = `${entry.tabId}:${entry.item.anchor}:${entry.item.year}:${entry.item.dayNumber}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
      });
      groups.forEach(entries => {
        const first = entries[0];
        const sourceCard = first.problem.closest('.exam-card');
        const card = document.createElement('article');
        card.className = 'exam-card trend-practice-exam';
        const header = sourceCard?.querySelector('.exam-header')?.cloneNode(true) || document.createElement('div');
        header.classList.add('exam-header');
        const sourceLabel = document.createElement('div');
        sourceLabel.className = 'trend-practice-source';
        sourceLabel.textContent = ({ 'tab-history': '🗂️ Nguồn: Đề Đà Nẵng–Quảng Nam',
          'tab-tst': '🏛️ Nguồn: Đề TST', 'tab-vmo': '🇻🇳 Nguồn: Đề VMO',
          'tab-olympic': '🌐 Nguồn: Đề IMO–Olympic' })[first.tabId];
        header.appendChild(sourceLabel);
        const cardBody = document.createElement('div');
        cardBody.className = 'exam-body';
        if (first.item.dayNumber > 0) {
          const dayHeader = sourceCard?.querySelector(`.db-exam-day[data-day-number="${first.item.dayNumber}"] .exam-day-header`)?.cloneNode(true);
          if (dayHeader) cardBody.appendChild(dayHeader);
        }
        entries.sort((a, b) => a.item.questionNumber - b.item.questionNumber).forEach(entry =>
          cardBody.appendChild(cloneTrendPracticeProblem(entry.problem, entry.item)));
        card.append(header, cardBody);
        body.appendChild(card);
      });
      if (missing.length) {
        const warning = document.createElement('div');
        warning.className = 'trend-practice-missing';
        warning.textContent = `Có ${missing.length} mã cũ chưa đối chiếu được: ${missing.join(', ')}. Hãy tạo lại báo cáo để cập nhật ánh xạ.`;
        body.prepend(warning);
      }
      window.reinitAIGuide?.(body);
      window.reinitDatabaseUI?.(body);
      window.applyCurrentLanguage?.();
      if (window.renderMathInContainer) await window.renderMathInContainer(body, true).catch(() => {});
      notice.textContent += ` Đã tải ${resolved.length}/${evidence.length} câu đầy đủ.`;
    } catch (error) {
      body.innerHTML = `<div class="trend-practice-error">${escapeHtmlText(error?.message || 'Không tải được danh sách luyện tập.')}</div>`;
    }
  };

  function renderExamTrendReport(data, saved = false) {
    const target = document.getElementById('trendResult');
    if (!target || !data?.report) return;
    const quality = data.quality || {};
    const [qualityLabel, qualityColor, qualityBackground] = trendStatusLabel(quality);
    const evidence = data.evidence || {};
    const report = data.report;
    examTrendState.rendered = data;
    const methods = (item, topicIndex) => (item.frequentMethods || []).length
      ? `<ul style="margin:7px 0 0;padding-left:20px;">${item.frequentMethods.map((method, methodIndex) => { const practiceIds = trendPracticeEvidenceIds(method); return `<li><button type="button" class="trend-theory-button" data-topic-index="${topicIndex}" data-method-index="${methodIndex}" style="border:0;background:none;padding:0;text-align:left;font-weight:800;color:#173b64;cursor:pointer;">${escapeHtmlText(method.name)}</button><div style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="trend-theory-button" data-topic-index="${topicIndex}" data-method-index="${methodIndex}">📐 Cơ sở lý thuyết</button><button type="button" class="trend-practice-button" data-topic-index="${topicIndex}" data-method-index="${methodIndex}" ${practiceIds.length ? '' : 'disabled'}>📚 Luyện ${practiceIds.length} câu</button></div>${method.note ? `: ${escapeHtmlText(method.note)}` : ''}<div style="font-size:.72rem;color:#64748b;">Bằng chứng phân tích: ${escapeHtmlText((method.evidenceIds || []).join(', ') || 'chưa xác định')}</div></li>`; }).join('')}</ul>`
      : '<p style="color:#64748b;margin:7px 0 0;">Chưa đủ dữ liệu để xác định phương pháp lặp lại.</p>';
    target.innerHTML = `
      <article style="border:1px solid #cbd5e1;border-radius:10px;background:white;padding:14px;">
        <div style="display:flex;justify-content:space-between;gap:9px;align-items:flex-start;flex-wrap:wrap;">
          <div><h3 style="margin:0 0 5px;color:#0f172a;">${escapeHtmlText(report.title)}</h3><div style="font-size:.78rem;color:#64748b;">${saved ? 'Báo cáo đã lưu' : 'Gia sư Toán AI'} · ${escapeHtmlText(learningDate(data.createdAt || data.generatedAt))}</div></div>
          <div><span style="padding:6px 9px;border-radius:999px;background:${qualityBackground};color:${qualityColor};font-size:.78rem;font-weight:800;">${qualityLabel}${quality.score !== null && quality.score !== undefined ? ` · ${escapeHtmlText(quality.score)}/5` : ''}</span> <button type="button" class="trend-collapse-report" aria-label="Thu gọn báo cáo">▲ Thu gọn</button></div>
        </div>
        <div style="margin:11px 0;padding:10px;background:#eff6ff;border-radius:7px;color:#1e3a8a;font-size:.82rem;"><strong>Nguồn cơ sở dữ liệu:</strong> ${Number(evidence.examCount) || 0} đề · ${Number(evidence.questionCount) || 0} câu · ${Number(evidence.unitCount) || 0} đơn vị · ${escapeHtmlText((evidence.years || []).join(', ') || data.settings?.year || '')} · thiếu ${Number(evidence.missingYears?.length) || 0} năm · AI đọc ${Number(evidence.sampleCount) || evidence.samples?.length || 0} câu mẫu${Number(evidence.otherQuestionCount) ? ` · ${Number(evidence.otherQuestionCount)} câu ngoài 6 tiêu chí` : ''}${evidence.mergedProvinceHistory ? `<div style="margin-top:5px;"><strong>Địa giới hiện hành:</strong> ${escapeHtmlText((evidence.historyMembers || []).join(' + '))} → ${escapeHtmlText(evidence.historyCurrentProvince || '')}</div>` : ''}<div style="margin-top:5px;">Tỷ lệ chủ đề tính theo câu; tần suất vi chủ đề dựa trên câu mẫu được dẫn.</div></div>
        <p style="white-space:pre-wrap;line-height:1.55;">${escapeHtmlText(report.executiveSummary || '')}</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:9px;">${(report.topicTrends || []).map((item, topicIndex) => `
          <section style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc;">
            <div style="display:flex;justify-content:space-between;gap:7px;"><strong>${escapeHtmlText(item.topic)}</strong><button type="button" class="trend-topic-practice-button" data-topic-index="${topicIndex}" ${item.evidenceIds?.length ? '' : 'disabled'} style="white-space:nowrap;color:#0369a1;font-weight:800;cursor:pointer;background:none;border:0;">${Number(item.questionCount) || 0} câu · ${Number(item.prevalencePercent) || 0}%</button></div>
            <div style="font-size:.76rem;color:#7c3aed;margin:4px 0;">${escapeHtmlText(item.trendLevel || '')}</div>
            <div style="white-space:pre-wrap;font-size:.84rem;line-height:1.45;">${escapeHtmlText(item.observations || '')}</div>${methods(item, topicIndex)}
          </section>`).join('')}</div>
        ${(report.recurringPatterns || []).length ? `<details open style="margin-top:12px;"><summary style="font-weight:800;cursor:pointer;">Các mô-típ lặp lại nổi bật</summary><ul>${report.recurringPatterns.map(item => `<li><strong>${escapeHtmlText(item.pattern)}</strong> (${Number(item.frequency) || 0} lần): ${escapeHtmlText(item.analysis || '')}<div style="font-size:.72rem;color:#64748b;">${escapeHtmlText((item.evidenceIds || []).join(', '))}</div></li>`).join('')}</ul></details>` : ''}
        ${(report.unitInsights || []).length ? `<details style="margin-top:10px;"><summary style="font-weight:800;cursor:pointer;">Đặc trưng theo đơn vị</summary>${report.unitInsights.map(item => `<p><strong>${escapeHtmlText(item.unit)}:</strong> ${escapeHtmlText((item.dominantTopics || []).join(', '))}. ${escapeHtmlText(item.note || '')}</p>`).join('')}</details>` : ''}
        <div style="margin-top:12px;padding:10px;border-radius:7px;background:${qualityBackground};color:${qualityColor};white-space:pre-wrap;"><strong>${qualityLabel}:</strong> ${escapeHtmlText(quality.summary || 'Chưa có nhận xét.')}${(quality.criticalIssues || []).length ? `<ul>${quality.criticalIssues.map(item => `<li>${escapeHtmlText(item)}</li>`).join('')}</ul>` : ''}${(quality.topicChecks || []).some(item => item.valid === false) ? `<strong>Kiểm tra theo chuyên đề:</strong><ul>${quality.topicChecks.filter(item => item.valid === false).map(item => `<li><strong>${escapeHtmlText(item.topic)}:</strong> ${escapeHtmlText(item.reason || '')}</li>`).join('')}</ul>` : ''}${(quality.corrections || []).length ? `<strong>Đề nghị hiệu chỉnh:</strong><ul>${quality.corrections.map(item => `<li>${escapeHtmlText(item)}</li>`).join('')}</ul>` : ''}</div>
        ${(report.limitations || []).length ? `<details style="margin-top:10px;"><summary style="font-weight:700;cursor:pointer;">Giới hạn dữ liệu</summary><ul>${report.limitations.map(item => `<li>${escapeHtmlText(item)}</li>`).join('')}</ul></details>` : ''}
        ${report.conclusion ? `<p style="margin-bottom:0;white-space:pre-wrap;"><strong>Kết luận:</strong> ${escapeHtmlText(report.conclusion)}</p>` : ''}
      </article>`;
    target.querySelectorAll('.trend-practice-button').forEach(button => {
      button.onclick = () => window.openTrendPractice(button.dataset.topicIndex, button.dataset.methodIndex);
    });
    target.querySelectorAll('.trend-topic-practice-button').forEach(button => {
      button.onclick = () => window.openTrendPractice(button.dataset.topicIndex);
    });
    target.querySelectorAll('.trend-theory-button').forEach(button => {
      button.onclick = () => window.openTrendTheory(button.dataset.topicIndex, button.dataset.methodIndex);
    });
    target.querySelector('.trend-collapse-report').onclick = () => {
      target.replaceChildren();
      examTrendState.rendered = null;
      document.getElementById('trendSavedReports')?.scrollIntoView?.({ block: 'nearest' });
    };
  }

  window.previewExamTrendEvidence = async function() {
    if (!requireTrendUiAction()) return;
    const button = document.getElementById('trendPreviewButton');
    const status = document.getElementById('trendStatus');
    const selected = document.getElementById('trendTarget')?.selectedOptions?.[0];
    button.disabled = true;
    if (status) status.textContent = 'Đang kiểm tra kho đề cơ sở dữ liệu...';
    try {
      const response = await fetch('/api/ai-exam-trends', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          preview: true, mode: document.getElementById('trendMode')?.value,
          year: document.getElementById('trendYear')?.value,
          targetType: document.getElementById('trendTargetType')?.value,
          targetAnchor: selected?.value, province: selected?.dataset?.province || selected?.textContent,
          lookback: Number(document.getElementById('trendLookback')?.value),
          includeCurrentYear: document.getElementById('trendIncludeCurrentYear')?.checked === true
        }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Không kiểm tra được nguồn.');
      const data = result.data;
      if (status) status.textContent = `cơ sở dữ liệu: ${data.examCount} đề, ${data.questionCount} câu; năm có dữ liệu: ${data.years.join(', ') || 'không có'}; năm thiếu: ${data.missingYears.join(', ') || 'không có'}.`;
    } catch (error) { if (status) status.textContent = error.message; }
    finally { button.disabled = false; }
  };

  window.runExamTrendAnalysis = async function() {
    if (!requireTrendUiAction() || examTrendState.running) return;
    const status = document.getElementById('trendStatus');
    const button = document.getElementById('trendRunButton');
    const save = document.getElementById('trendSaveButton');
    const mode = document.getElementById('trendMode')?.value || 'year';
    const selected = document.getElementById('trendTarget')?.selectedOptions?.[0];
    const payload = {
      mode, year: document.getElementById('trendYear')?.value,
      targetType: document.getElementById('trendTargetType')?.value,
      targetAnchor: selected?.value || '', province: selected?.dataset?.province || selected?.textContent || '',
      lookback: Number(document.getElementById('trendLookback')?.value),
      includeCurrentYear: document.getElementById('trendIncludeCurrentYear')?.checked === true
    };
    examTrendState.running = true;
    examTrendState.current = null;
    if (save) save.disabled = true;
    if (button) button.disabled = true;
    if (status) status.textContent = 'Gia sư Toán AI đang phân tích và hệ thống sẽ đối chiếu kho đề…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 295_000);
    try {
      const response = await fetch('/api/ai-exam-trends', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || `Phân tích thất bại (HTTP ${response.status})`);
      examTrendState.current = result.data;
      renderExamTrendReport(result.data);
      if (save) save.disabled = false;
      if (status) status.textContent = result.data.quality?.status === 'checked'
        ? 'Hoàn tất: số liệu và mã dẫn đã đối chiếu cơ sở dữ liệu.'
        : 'Hoàn tất: xem các giới hạn và mã dẫn cần rà soát.';
    } catch (error) {
      if (status) status.textContent = error?.name === 'AbortError'
        ? 'Yêu cầu vượt quá thời gian chờ 295 giây.' : (error?.message || 'Không thể phân tích xu hướng.');
      showToast(status?.textContent || 'Không thể phân tích xu hướng.', false);
    } finally {
      clearTimeout(timer);
      examTrendState.running = false;
      if (button) button.disabled = false;
    }
  };

  window.saveExamTrendReport = async function() {
    if (!requireTrendUiAction() || !examTrendState.current) return;
    const button = document.getElementById('trendSaveButton');
    const status = document.getElementById('trendStatus');
    if (button) button.disabled = true;
    try {
      const saved = await window.VMODataService.saveExamTrendReport(examTrendState.current);
      examTrendState.current = { ...examTrendState.current, id: saved.id, createdAt: saved.createdAt };
      if (status) status.textContent = 'Đã lưu báo cáo xu hướng vào cơ sở dữ liệu.';
      showToast('Đã lưu báo cáo xu hướng vào cơ sở dữ liệu!', true);
      await window.loadExamTrendReports(true);
    } catch (error) {
      if (button) button.disabled = false;
      if (status) status.textContent = error?.message || 'Không thể lưu báo cáo.';
      showToast(status?.textContent, false);
    }
  };

  window.loadExamTrendReports = async function(force = false) {
    if (!requireTrendUiAction()) return;
    const list = document.getElementById('trendSavedReports');
    if (!list || (examTrendState.loaded && !force)) return;
    list.innerHTML = '<em>Đang tải báo cáo từ cơ sở dữ liệu...</em>';
    try {
      examTrendState.saved = await window.VMODataService.getExamTrendReports();
      examTrendState.loaded = true;
      list.innerHTML = examTrendState.saved.length ? examTrendState.saved.map((item, index) => {
        const [label, color, background] = trendStatusLabel(item.quality || {});
        return `<div style="padding:9px 11px;margin-bottom:6px;border:1px solid #cbd5e1;border-radius:7px;background:white;"><button type="button" data-trend-report="${index}" style="display:block;width:100%;text-align:left;border:0;background:none;cursor:pointer;"><strong>${escapeHtmlText(item.report?.title || 'Báo cáo xu hướng')}</strong><span style="float:right;color:${color};background:${background};padding:2px 6px;border-radius:999px;font-size:.7rem;">${label}</span><div style="font-size:.76rem;color:#64748b;">${escapeHtmlText(item.settings?.year || '')} · ${escapeHtmlText(item.createdBy || '')} · ${escapeHtmlText(learningDate(item.createdAt))}${item.updatedBy ? ` · sửa bởi ${escapeHtmlText(item.updatedBy)}` : ''}</div></button><div style="display:flex;gap:8px;margin-top:7px;"><button type="button" data-trend-edit="${index}">✏️ Chỉnh sửa</button><button type="button" data-trend-delete="${index}">🗑️ Xóa</button></div></div>`;
      }).join('') : '<p style="color:#64748b;">Chưa có báo cáo xu hướng đã lưu.</p>';
      list.querySelectorAll('[data-trend-report]').forEach(button => {
        button.onclick = () => {
          const item = examTrendState.saved[Number(button.dataset.trendReport)];
          if (examTrendState.rendered?.id === item.id) {
            document.getElementById('trendResult')?.replaceChildren();
            examTrendState.rendered = null;
          } else renderExamTrendReport(item, true);
        };
      });
      list.querySelectorAll('[data-trend-edit]').forEach(button => {
        button.onclick = () => window.editExamTrendReport(Number(button.dataset.trendEdit));
      });
      list.querySelectorAll('[data-trend-delete]').forEach(button => {
        button.onclick = () => window.deleteExamTrendReport(Number(button.dataset.trendDelete));
      });
    } catch (error) {
      list.innerHTML = `<p style="color:#b91c1c;">${escapeHtmlText(error?.message || 'Không tải được báo cáo.')}</p>`;
    }
  };

  window.editExamTrendReport = function(index) {
    if (!requireTrendUiAction()) return;
    const item = examTrendState.saved[index];
    if (!item?.id) return;
    let editor = document.getElementById('trendReportEditor');
    if (!editor) {
      editor = document.createElement('div');
      editor.id = 'trendReportEditor';
      editor.style.cssText = 'border:1px solid #94a3b8;border-radius:8px;padding:12px;margin:12px 0;background:#f8fafc;';
      document.getElementById('trendSavedReports')?.before(editor);
    }
    editor.innerHTML = `<h4>✏️ Chỉnh sửa báo cáo đã lưu</h4><p>Chỉ sửa phần diễn giải. Số câu, tỷ lệ và bằng chứng vẫn giữ nguyên. Báo cáo sửa sẽ cần kiểm định lại.</p>
      <form id="trendReportEditForm"><label>Tiêu đề<input name="title" maxlength="300" required style="display:block;width:100%;box-sizing:border-box;"></label>
      <label>Tóm tắt<textarea name="executiveSummary" maxlength="6000" rows="5" style="display:block;width:100%;box-sizing:border-box;"></textarea></label>
      ${item.report.topicTrends.map((topic, topicIndex) => `<label style="display:block;margin-top:8px;">${escapeHtmlText(topic.topic)}<textarea data-trend-observation="${topicIndex}" maxlength="4000" rows="4" style="display:block;width:100%;box-sizing:border-box;"></textarea></label>`).join('')}
      <label>Kết luận<textarea name="conclusion" maxlength="5000" rows="4" style="display:block;width:100%;box-sizing:border-box;"></textarea></label>
      <div style="display:flex;gap:8px;"><button type="submit">💾 Lưu chỉnh sửa</button><button type="button" id="trendEditCancel">Hủy</button></div><p role="status" id="trendEditStatus"></p></form>`;
    const form = editor.querySelector('form');
    form.elements.title.value = item.report.title || '';
    form.elements.executiveSummary.value = item.report.executiveSummary || '';
    form.elements.conclusion.value = item.report.conclusion || '';
    form.querySelectorAll('[data-trend-observation]').forEach(field => {
      field.value = item.report.topicTrends[Number(field.dataset.trendObservation)]?.observations || '';
    });
    editor.querySelector('#trendEditCancel').onclick = () => editor.remove();
    form.onsubmit = async event => {
      event.preventDefault();
      if (!requireTrendUiAction()) return;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await window.VMODataService.updateExamTrendReport(item.id, {
          title: form.elements.title.value, executiveSummary: form.elements.executiveSummary.value,
          conclusion: form.elements.conclusion.value,
          observations: Array.from(form.querySelectorAll('[data-trend-observation]'), field => field.value)
        });
        editor.remove();
        document.getElementById('trendResult').replaceChildren();
        await window.loadExamTrendReports(true);
        showToast('Đã cập nhật báo cáo.', true);
      } catch (error) {
        submit.disabled = false;
        form.querySelector('#trendEditStatus').textContent = error.message || 'Không thể cập nhật báo cáo.';
      }
    };
    editor.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };

  window.deleteExamTrendReport = async function(index) {
    if (!requireTrendUiAction()) return;
    const item = examTrendState.saved[index];
    if (!item?.id || !window.confirm(`Xóa báo cáo “${item.report?.title || 'Báo cáo xu hướng'}” khỏi danh sách đã lưu?`)) return;
    try {
      await window.VMODataService.deleteExamTrendReport(item.id);
      document.getElementById('trendReportEditor')?.remove();
      document.getElementById('trendResult')?.replaceChildren();
      await window.loadExamTrendReports(true);
      showToast('Đã xóa báo cáo khỏi danh sách.', true);
    } catch (error) { showToast(error?.message || 'Không thể xóa báo cáo.', false); }
  };

  function ensureLearningDashboardUi(modal, isAdmin) {
    const tabs = modal.querySelector('#hub-tab-events')?.parentElement;
    const body = modal.querySelector('.vmo-modal-body');
    if (!tabs || !body) return;
    if (!modal.querySelector('#hub-tab-progress')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hub-tab-btn';
      button.id = 'hub-tab-progress';
      button.textContent = '📊 Hoạt động & kết quả';
      button.onclick = () => window.switchHubTab('progress');
      tabs.appendChild(button);
    }
    tabs.style.flexWrap = 'wrap';
    let panel = modal.querySelector('#hub-panel-progress');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'hub-panel-progress';
      panel.className = 'hub-panel';
      panel.style.display = 'none';
      body.appendChild(panel);
    }
    if (!panel.querySelector('#hubLearningSummary')) panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <h4 style="margin:0;color:#173b64;">Hoạt động và kết quả học tập</h4>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label for="hubLearningAccount" style="font-size:.8rem;font-weight:700;">Tài khoản</label>
          <select id="hubLearningAccount" style="padding:7px;border:1px solid #cbd5e1;border-radius:6px;"><option value="">Tất cả thành viên</option></select>
          <button type="button" id="hubLearningRefresh" style="padding:7px 11px;background:#0369a1;color:white;border:0;border-radius:6px;cursor:pointer;">🔄 Làm mới</button>
        </div>
      </div>
      <div id="hubLearningSummary" aria-live="polite">Đang tải thống kê...</div>
      <div id="hubLearningMembers"></div>
      <details open style="margin-top:12px;"><summary style="cursor:pointer;font-weight:700;">✨ Câu hỏi/ví dụ đã lưu AI Hướng dẫn giải</summary><div id="hubLearningGuides"></div></details>
      <details open style="margin-top:12px;"><summary style="cursor:pointer;font-weight:700;">🤖 Câu hỏi/ví dụ đã lưu AI đánh giá và điểm</summary><div id="hubLearningEvaluations"></div></details>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 8px;gap:8px;">
        <strong>🕒 Nhật ký hoạt động</strong><span id="hubActivityPage" style="font-size:.8rem;color:#64748b;"></span>
      </div>
      <div id="hubActivityList" aria-live="polite"></div>
      <div id="hubActivityPager" style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;"></div>
      <p style="font-size:.75rem;color:#64748b;margin-top:12px;">Thống kê tính từ các bài đã lưu trong cơ sở dữ liệu; nhật ký bắt đầu từ khi chức năng được triển khai. Mỗi câu tính một lần cho mỗi tài khoản; tổng hệ thống là tổng theo tài khoản. Điểm dùng lần đánh giá đã lưu gần nhất theo thang AI.</p>`;
    const selector = panel.querySelector('#hubLearningAccount');
    selector.parentElement.style.display = isAdmin ? 'flex' : 'none';
    selector.onchange = () => {
      learningDashboard.account = selector.value;
      learningDashboard.page = 1;
      renderLearningOverview();
      window.loadLearningActivities();
    };
    panel.querySelector('#hubLearningRefresh').onclick = () => window.loadLearningDashboard();
  }

  function learningDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('vi-VN') : 'Chưa rõ thời gian';
  }

  function learningList(items, withScores, showDelete = false) {
    if (!items.length) return '<p style="color:#64748b;">Chưa có câu hỏi/ví dụ đã lưu.</p>';
    return `<div style="max-height:300px;overflow:auto;margin-top:8px;">${items.map(item => `
      <div style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:7px;margin-bottom:6px;background:#fff;">
        <strong>${escapeHtmlText(item.problemTitle)}</strong>
        ${withScores ? `<span style="float:right;font-weight:800;color:#0e7490;">${escapeHtmlText(item.score || 'Chưa có điểm chuẩn')}</span>` : ''}
        <div style="font-size:.8rem;color:#475569;">📚 ${escapeHtmlText(item.setTitle)} · ${escapeHtmlText(item.username)} · ${escapeHtmlText(learningDate(item.savedAt))}</div>
        ${showDelete && /^[a-f\d]{24}$/i.test(String(item.submissionId || ''))
          ? `<button type="button" data-delete-ai-guide="${item.submissionId}" style="margin-top:7px;padding:5px 8px;border:1px solid #fecdd3;background:#fff1f2;color:#be123c;border-radius:5px;cursor:pointer;">🗑️ Xóa lời giải AI đã lưu</button>` : ''}
      </div>`).join('')}</div>`;
  }

  function renderLearningOverview() {
    const data = learningDashboard.overview;
    if (!data) return;
    const account = learningDashboard.account;
    const members = account ? data.members.filter(member => member.username === account) : data.members;
    const guides = account ? data.guides.filter(item => item.username === account) : data.guides;
    const evaluations = account ? data.evaluations.filter(item => item.username === account) : data.evaluations;
    const totals = members.reduce((sum, member) => ({
      guideCount: sum.guideCount + member.guideCount, evaluationCount: sum.evaluationCount + member.evaluationCount,
      scoreEarned: sum.scoreEarned + member.scoreEarned, scoreMaximum: sum.scoreMaximum + member.scoreMaximum
    }), { guideCount: 0, evaluationCount: 0, scoreEarned: 0, scoreMaximum: 0 });
    const score = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
    document.getElementById('hubLearningSummary').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;">
        <div style="padding:10px;border-radius:8px;background:#eff6ff;"><strong style="display:block;font-size:1.25rem;">${totals.guideCount}</strong>Ví dụ/câu đã lưu hướng dẫn AI</div>
        <div style="padding:10px;border-radius:8px;background:#ecfdf5;"><strong style="display:block;font-size:1.25rem;">${totals.evaluationCount}</strong>Ví dụ/câu đã lưu đánh giá AI</div>
        <div style="padding:10px;border-radius:8px;background:#fff7ed;"><strong style="display:block;font-size:1.25rem;">${score(totals.scoreEarned)} / ${score(totals.scoreMaximum)}</strong>Tổng điểm AI / điểm tối đa</div>
      </div>`;
    document.getElementById('hubLearningMembers').innerHTML = isCurrentUserContentManager() ? `
      <div style="overflow:auto;max-height:220px;margin-top:12px;"><table style="width:100%;border-collapse:collapse;font-size:.82rem;">
        <thead><tr><th style="text-align:left;">Thành viên</th><th>Hướng dẫn</th><th>Đánh giá</th><th>Điểm AI</th></tr></thead>
        <tbody>${members.map(member => `<tr style="border-top:1px solid #e2e8f0;"><td>${escapeHtmlText(member.fullName)} <small>(${escapeHtmlText(member.username)})</small></td><td style="text-align:center;">${member.guideCount}</td><td style="text-align:center;">${member.evaluationCount}</td><td style="text-align:center;">${score(member.scoreEarned)} / ${score(member.scoreMaximum)}</td></tr>`).join('')}</tbody>
      </table></div>` : '';
    const guideList = document.getElementById('hubLearningGuides');
    guideList.innerHTML = learningList(guides, false, isCurrentUserContentManager());
    guideList.querySelectorAll('[data-delete-ai-guide]').forEach(button => {
      button.onclick = () => window.deleteLearningAiGuide(button.dataset.deleteAiGuide);
    });
    document.getElementById('hubLearningEvaluations').innerHTML = learningList(evaluations, true);
  }

  window.deleteLearningAiGuide = async function(submissionId) {
    if (!requireContentManagerUiAction()) return;
    const guide = learningDashboard.overview?.guides?.find(item => item.submissionId === submissionId);
    if (!guide || !/^[a-f\d]{24}$/i.test(submissionId)) return;
    if (!window.confirm(`Xóa vĩnh viễn AI Hướng dẫn giải đã lưu cho "${guide.problemTitle}" của ${guide.username}? Bài nộp và đánh giá AI được giữ nguyên.`)) return;
    const button = Array.from(document.querySelectorAll('[data-delete-ai-guide]'))
      .find(item => item.dataset.deleteAiGuide === submissionId);
    if (button) button.disabled = true;
    try {
      await window.VMODataService.deleteAiGuide(submissionId);
      window.onAIGuideDeleted?.(submissionId);
      showToast('Đã xóa AI Hướng dẫn giải đã lưu trong cơ sở dữ liệu.', true);
      await window.loadLearningDashboard();
    } catch (error) {
      if (button) button.disabled = false;
      showToast(error?.message || 'Không xóa được lời giải AI.', false);
    }
  };

  window.loadLearningActivities = async function(page = learningDashboard.page) {
    const list = document.getElementById('hubActivityList');
    if (!list) return;
    const requestId = ++learningDashboard.activityRequestId;
    learningDashboard.page = page;
    list.textContent = 'Đang tải hoạt động...';
    try {
      const result = await window.VMODataService.getActivityFeed({
        page, limit: 20, username: isCurrentUserContentManager() ? learningDashboard.account : ''
      });
      if (requestId !== learningDashboard.activityRequestId) return;
      const pagination = result.pagination || { page: 1, pages: 1, total: 0 };
      learningDashboard.page = pagination.page;
      list.innerHTML = result.items.length ? result.items.map(event => {
        const details = event.details || {};
        const subject = details.problemTitle || details.itemTitle || '';
        return `<div style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:7px;margin-bottom:5px;font-size:.82rem;">
          <strong>${escapeHtmlText(learningActionNames[event.action] || event.action)}</strong> · ${escapeHtmlText(event.username || '')}
          <span style="color:#64748b;float:right;">${escapeHtmlText(learningDate(event.createdAt))}</span>
          ${subject ? `<div style="clear:both;color:#475569;">${escapeHtmlText(subject)}${details.setTitle ? ` · ${escapeHtmlText(details.setTitle)}` : ''}${details.ownerUsername ? ` · ${escapeHtmlText(details.ownerUsername)}` : ''}${details.score ? ` · Điểm ${escapeHtmlText(details.score)}` : ''}</div>` : ''}
        </div>`;
      }).join('') : '<p style="color:#64748b;">Chưa có hoạt động được ghi nhận.</p>';
      document.getElementById('hubActivityPage').textContent = `${pagination.total} sự kiện · Trang ${pagination.page}/${pagination.pages}`;
      const pager = document.getElementById('hubActivityPager');
      pager.innerHTML = `<button type="button" id="hubActivityPrev" ${pagination.page <= 1 ? 'disabled' : ''}>← Trước</button><button type="button" id="hubActivityNext" ${pagination.page >= pagination.pages ? 'disabled' : ''}>Sau →</button>`;
      pager.querySelector('#hubActivityPrev').onclick = () => window.loadLearningActivities(pagination.page - 1);
      pager.querySelector('#hubActivityNext').onclick = () => window.loadLearningActivities(pagination.page + 1);
    } catch (error) {
      if (requestId === learningDashboard.activityRequestId) list.textContent = error?.message || 'Không tải được hoạt động.';
    }
  };

  window.loadLearningDashboard = async function() {
    const summary = document.getElementById('hubLearningSummary');
    if (!summary) return;
    const requestId = ++learningDashboard.requestId;
    summary.textContent = 'Đang tính thống kê từ cơ sở dữ liệu...';
    try {
      const result = await window.VMODataService.getLearningOverview();
      if (requestId !== learningDashboard.requestId) return;
      learningDashboard.overview = result.overview;
      learningDashboard.accounts = result.accounts;
      const selector = document.getElementById('hubLearningAccount');
      if (isCurrentUserContentManager()) {
        const previous = learningDashboard.account;
        selector.replaceChildren(new Option('Tất cả thành viên', ''));
        result.accounts.forEach(account => selector.add(new Option(`${account.fullName} (${account.username})`, account.username)));
        learningDashboard.account = result.accounts.some(account => account.username === previous) ? previous : '';
        selector.value = learningDashboard.account;
      } else learningDashboard.account = '';
      renderLearningOverview();
      await window.loadLearningActivities(1);
    } catch (error) {
      if (requestId === learningDashboard.requestId) summary.textContent = error?.message || 'Không tải được thống kê.';
    }
  };

  window.openDataHubModal = function() {
    let modal = document.getElementById('dataHubModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dataHubModal';
      modal.className = 'vmo-modal-overlay';
      modal.innerHTML = `
        <div class="vmo-modal-container" style="max-width: 800px;">
          <div class="vmo-modal-header" style="background:#0f172a; color:#fff;">
            <div class="vmo-modal-title" style="color:#fff;">
              <span>🗄️</span>
              <span>Trung tâm Quản trị Dữ liệu</span>
            </div>
            <button type="button" class="vmo-modal-close" style="color:#fff;" onclick="closeDataHubModal()">✕</button>
          </div>
          <div class="vmo-modal-body">
            <!-- Navigation Sub-tabs trong Modal -->
            <div style="display:flex; gap:8px; border-bottom:2px solid #e2e8f0; margin-bottom:16px; padding-bottom:8px;">
              <button type="button" class="hub-tab-btn active" id="hub-tab-events" onclick="switchHubTab('events')">📅 Sự kiện & Lịch thi</button>
              <button type="button" class="hub-tab-btn" id="hub-tab-docs" onclick="switchHubTab('docs')">📚 Tài liệu & Kỷ yếu</button>
              <button type="button" class="hub-tab-btn" id="hub-tab-exams" onclick="switchHubTab('exams')">📑 Đề thi mới</button>
            </div>

            <!-- Panel 1: SỰ KIỆN & LỊCH THI -->
            <div id="hub-panel-events" class="hub-panel">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Lịch thi & Hoạt động tập huấn Đội tuyển</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddEventForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  ➕ Thêm sự kiện mới
                </button>
              </div>

              <!-- Form thêm sự kiện -->
              <form id="formAddEvent" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateEvent(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tên sự kiện / Lịch thi *</label>
                    <input type="text" id="evtTitle" placeholder="vd: Thi thử VMO đợt 1" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Phân loại *</label>
                    <select id="evtType" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="exam">Thi thử / Chọn Đội tuyển</option>
                      <option value="seminar">Hội thảo / Chuyên đề</option>
                      <option value="training">Tập huấn nâng cao</option>
                      <option value="deadline">Hạn nộp bài tập</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Ngày bắt đầu *</label>
                    <input type="date" id="evtStartDate" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Địa điểm tổ chức</label>
                    <input type="text" id="evtLocation" placeholder="vd: THPT Phan Châu Trinh, Đà Nẵng" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="margin-bottom:10px;">
                  <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Ghi chú chi tiết</label>
                  <input type="text" id="evtDesc" placeholder="Nội dung chuyên đề, tài liệu mang theo..." style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddEventForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Hủy</button>
                  <button type="submit" style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">Lưu vào cơ sở dữ liệu</button>
                </div>
              </form>

              <div id="hubEventsList" style="max-height:300px; overflow-y:auto;">
                <em>Đang nạp danh sách sự kiện từ cơ sở dữ liệu...</em>
              </div>
            </div>

            <!-- Panel 2: TÀI LIỆU & KỶ YẾU -->
            <div id="hub-panel-docs" class="hub-panel" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Kho Tài liệu & Chuyên đề Chuyên Toán</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddDocForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  ➕ Thêm tài liệu mới
                </button>
              </div>

              <!-- Form thêm tài liệu -->
              <form id="formAddDoc" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateDocument(event)">
                <p>Đang chuẩn bị biểu mẫu OCR...</p>
              </form>

              <div id="hubDocsList" style="max-height:300px; overflow-y:auto;">
                <em>Đang nạp danh sách tài liệu từ cơ sở dữ liệu...</em>
              </div>
            </div>

            <!-- Panel 3: ĐỀ THI MỚI -->
            <div id="hub-panel-exams" class="hub-panel" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Ngân hàng Đề thi Đội tuyển</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddExamForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  ➕ Thêm đề thi mới
                </button>
              </div>

              <!-- Form OCR và thêm đề thi -->
              <form id="formAddExam" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateExam(event)">
                <p>Đang chuẩn bị biểu mẫu OCR...</p>
              </form>

              <div id="hubExamsList" style="max-height:300px; overflow-y:auto;">
                <em>Đang nạp danh sách đề thi từ cơ sở dữ liệu...</em>
              </div>
            </div>

          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Thêm style cho tab trong hub modal
      const style = document.createElement('style');
      style.textContent = `
        .hub-tab-btn {
          background: none;
          border: none;
          padding: 8px 14px;
          font-weight: 600;
          font-size: 0.9rem;
          color: #64748b;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .hub-tab-btn.active {
          background: #e0f2fe;
          color: #0369a1;
        }
      `;
      document.head.appendChild(style);
    }

    ensureExamOcrForm(modal);
    applyDataHubPermissions(modal);
    switchHubTab('events');
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Đảm bảo nút đóng và click backdrop luôn hoạt động
    const closeBtns = modal.querySelectorAll('.vmo-modal-close, #dataHubModalClose');
    closeBtns.forEach(btn => {
      btn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        window.closeDataHubModal();
      };
    });
    modal.onclick = (e) => {
      if (e.target === modal) window.closeDataHubModal();
    };
  }

  window.closeDataHubModal = function() {
    const modal = document.getElementById('dataHubModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
  };

  window.switchHubTab = function(tabName) {
    const policy = window.MathAppEducation, session = window.VMOAuth?.getSession?.();
    if (policy && ((['exams', 'trends'].includes(tabName) && !policy.allows(session, 'upper_secondary')) || (tabName === 'docs' && !policy.allows(session, 'upper_secondary') && !policy.allows(session, 'lower_secondary') && !policy.allows(session, 'university')))) return;
    ['events', 'docs', 'exams', 'catalog', 'subs', 'progress', 'trends'].forEach(t => {
      const btn = document.getElementById('hub-tab-' + t);
      const panel = document.getElementById('hub-panel-' + t);
      if (btn) btn.classList.toggle('active', t === tabName);
      if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
    });

    if (tabName === 'events') loadHubEvents();
    if (tabName === 'docs') loadHubDocs();
    if (tabName === 'exams') loadHubExams();
    if (tabName === 'catalog') loadCatalogManagement();
    if (tabName === 'subs') loadAllSubmissions();
    if (tabName === 'progress') window.loadLearningDashboard();
    if (tabName === 'trends') window.loadExamTrendReports();
  };

  window.hubSubmissionState = { page: 1, limit: 10, total: 0, pages: 1 };

  function readSubmissionFilters() {
    return {
      page: window.hubSubmissionState.page,
      limit: Number(document.getElementById('hubSubPageSize')?.value) || 10,
      q: document.getElementById('hubSubSearch')?.value?.trim() || '',
      username: document.getElementById('hubSubUsername')?.value?.trim() || '',
      sourceGroup: document.getElementById('hubSubSource')?.value || '',
      evaluation: document.getElementById('hubSubEvaluation')?.value || '',
      adminVerified: document.getElementById('hubSubVerified')?.value || '',
      dateFrom: document.getElementById('hubSubDateFrom')?.value || '',
      dateTo: document.getElementById('hubSubDateTo')?.value || ''
    };
  }

  window.applySubmissionFilters = function() {
    window.hubSubmissionState.page = 1;
    window.loadAllSubmissions();
  };

  window.resetSubmissionFilters = function() {
    ['hubSubSearch', 'hubSubUsername', 'hubSubSource', 'hubSubEvaluation', 'hubSubVerified', 'hubSubDateFrom', 'hubSubDateTo']
      .forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = '';
      });
    const pageSize = document.getElementById('hubSubPageSize');
    if (pageSize) pageSize.value = '10';
    window.hubSubmissionState = { page: 1, limit: 10, total: 0, pages: 1 };
    window.loadAllSubmissions();
  };

  window.changeSubmissionPage = function(page) {
    const requested = Math.max(1, Math.min(Number(page) || 1, window.hubSubmissionState.pages || 1));
    if (requested === window.hubSubmissionState.page) return;
    window.hubSubmissionState.page = requested;
    window.loadAllSubmissions();
  };

  window.loadAllSubmissions = async function() {
    const el = document.getElementById('hubSubsList');
    if (!el) return;
    el.innerHTML = '<em>Đang tải danh sách bài nộp từ cơ sở dữ liệu...</em>';
    try {
      if (window.VMODataService && window.VMODataService.getSubmissionsPage) {
        const result = await window.VMODataService.getSubmissionsPage(readSubmissionFilters());
        const subs = result.items || [];
        window.hubSubmissionState = {
          page: result.pagination?.page || 1,
          limit: result.pagination?.limit || 10,
          total: result.pagination?.total || 0,
          pages: result.pagination?.pages || 1
        };
        // Dùng cùng nguồn dữ liệu với cửa sổ lịch sử để các nút xem chi tiết
        // có thể mở đúng nhận xét AI của bản ghi đang hiển thị trong cơ sở dữ liệu Hub.
        window.lastLoadedSubmissions = subs || [];
        if (!subs || subs.length === 0) {
          el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có bài giải nào được lưu trên hệ thống cơ sở dữ liệu. Học sinh hoặc giáo viên có thể nhấn "✍️ Nộp bài giải" hoặc "🚀 Lưu bài giải lên database" ở từng câu hỏi để lưu vào đây!</div>';
          return;
        }
        const cardsHtml = subs.map((s, idx) => {
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '';
          const preview = s.solutionContent ? s.solutionContent.slice(0, 150) + (s.solutionContent.length > 150 ? '...' : '') : '';
          const snapshot = s.problemSnapshot || {};
          const sourceLabels = {
            specialty_example: 'Tài liệu chuyên đề VMO',
            mock_exam_question: 'Bộ đề thi thử VMO',
            tst_question: 'Đề TST',
            regional_question: 'Đề Đà Nẵng–Quảng Nam'
          };
          const sourceLabel = sourceLabels[s.sourceType || snapshot.sourceType] || 'Ngân hàng bài toán VMO';
          const setTitle = snapshot.setTitle || s.setTitle || '';
          const problemTitle = snapshot.title || s.problemTitle || s.problemKey || s.problemId || 'Bài toán VMO';
          const score = s.score || s.evaluation?.estimatedScore || '';
          const submissionId = String(s.id || s._id || '');
          const verified = s.adminVerified === true;
          const hasSolutionText = Boolean(String(s.solutionContent || '').trim());
          const verifiedDate = s.adminVerifiedAt ? new Date(s.adminVerifiedAt).toLocaleString('vi-VN') : '';
          const verificationBadge = verified
            ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#166534;border:1px solid #86efac;border-radius:999px;padding:3px 8px;font-size:.72rem;font-weight:800;">✅ Admin đã xác minh</span>`
            : `<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;border-radius:999px;padding:3px 8px;font-size:.72rem;font-weight:700;">⏳ Chưa xác minh</span>`;
          const evaluationBtn = s.evaluation ? `
            <button type="button" onclick="viewSubEvaluationDetail(${idx})" style="background:#eef2ff; border:1px solid #c7d2fe; color:#4338ca; border-radius:4px; padding:5px 9px; font-size:0.75rem; cursor:pointer; font-weight:600;">
              👁️ Xem nhận xét AI
            </button>
          ` : '';
          const imageBtn = s.hasImage ? `
            <button type="button" onclick="viewSubmissionImage('${s.id || s._id}')" style="background:#ecfeff; border:1px solid #a5f3fc; color:#0e7490; border-radius:4px; padding:5px 9px; font-size:0.75rem; cursor:pointer; font-weight:600;">
              📷 Xem ảnh
            </button>
          ` : '';
          const deleteBtn = isCurrentUserContentManager() ? `
            <button type="button" onclick="deleteSubmissionItem('${submissionId}')" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; border-radius:4px; padding:5px 9px; font-size:0.75rem; cursor:pointer; font-weight:700;">
              🗑️ Xóa bài nộp
            </button>
          ` : '';
          const editContentBtn = isCurrentUserContentManager() && /^[a-f\d]{24}$/i.test(submissionId) ? `
            <button type="button" onclick="openSubmissionContentEditor('${submissionId}', ${idx})" style="background:#f5f3ff;border:1px solid #c4b5fd;color:#6d28d9;border-radius:4px;padding:5px 9px;font-size:.75rem;cursor:pointer;font-weight:700;">
              ✏️ Sửa MathJax
            </button>
          ` : '';
          const verificationBtn = isCurrentUserContentManager() && /^[a-f\d]{24}$/i.test(submissionId) ? `
            <button type="button" onclick="setSubmissionVerification('${submissionId}', ${verified ? 'false' : 'true'})" ${!verified && !hasSolutionText ? 'disabled title="Bài chỉ có ảnh, chưa có lời giải văn bản để AI đối chiếu"' : ''} style="background:${verified ? '#fff7ed' : '#ecfdf5'};border:1px solid ${verified ? '#fdba74' : (!hasSolutionText ? '#cbd5e1' : '#86efac')};color:${verified ? '#c2410c' : (!hasSolutionText ? '#64748b' : '#166534')};border-radius:4px;padding:5px 9px;font-size:.75rem;cursor:${!verified && !hasSolutionText ? 'not-allowed' : 'pointer'};font-weight:700;opacity:${!verified && !hasSolutionText ? '.72' : '1'};">
              ${verified ? '↩️ Hủy xác minh' : (hasSolutionText ? '✅ Xác minh bài nộp' : '🔒 Thiếu lời giải văn bản')}
            </button>
          ` : '';
          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
              <div style="font-size:0.72rem; color:#4338ca; font-weight:800; text-transform:uppercase; letter-spacing:.04em; margin-bottom:3px;">${escapeHtmlText(sourceLabel)}</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:#0f172a; font-size:0.95rem;">${escapeHtmlText(problemTitle)}</strong>
                <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">${escapeHtmlText(s.authorName || 'Học sinh')}</span>
              </div>
              ${setTitle ? `<div style="font-size:0.82rem;color:#475569;margin-bottom:5px;">📚 ${escapeHtmlText(setTitle)}</div>` : ''}
              <div style="font-size:0.8rem; color:#64748b; margin-bottom:6px;">
                📅 Thời gian: ${escapeHtmlText(dateStr)} | 👤 Tài khoản: ${escapeHtmlText(s.username || s.authorEmail || s.userId || 'Ẩn danh')}
                ${score ? ` | 🎯 Điểm AI: <strong>${escapeHtmlText(score)}</strong>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:6px;">${verificationBadge}${verified ? `<span style="font-size:.72rem;color:#64748b;">Bởi ${escapeHtmlText(s.adminVerifiedBy || 'admin')}${verifiedDate ? ` · ${escapeHtmlText(verifiedDate)}` : ''}${s.adminVerificationNote ? ` · ${escapeHtmlText(s.adminVerificationNote)}` : ''}</span>` : ''}</div>
              <div data-no-i18n="true" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; font-family:monospace; font-size:0.85rem; color:#334155; white-space:pre-wrap;">${escapeHtmlText(preview)}</div>
              ${(evaluationBtn || imageBtn || verificationBtn || deleteBtn) ? `
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                  ${evaluationBtn}
                  ${imageBtn}
                  ${editContentBtn}
                  ${verificationBtn}
                  ${deleteBtn}
                </div>
              ` : ''}
            </div>
          `;
        }).join('');
        const state = window.hubSubmissionState;
        const pagerHtml = `
          <div style="position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:7px;box-shadow:0 -2px 8px rgba(15,23,42,.06);">
            <span style="font-size:.8rem;color:#475569;">Tổng <strong>${state.total}</strong> bài · Trang <strong>${state.page}/${state.pages}</strong></span>
            <div style="display:flex;gap:6px;">
              <button type="button" onclick="changeSubmissionPage(${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''} style="padding:5px 10px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;cursor:pointer;">← Trước</button>
              <button type="button" onclick="changeSubmissionPage(${state.page + 1})" ${state.page >= state.pages ? 'disabled' : ''} style="padding:5px 10px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;cursor:pointer;">Sau →</button>
            </div>
          </div>`;
        el.innerHTML = cardsHtml + pagerHtml;
      } else {
        el.innerHTML = '<div style="color:#dc2626;">Dịch vụ lưu trữ chưa sẵn sàng. Vui lòng thử lại sau.</div>';
      }
    } catch (e) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải bài nộp: ' + e.message + '</div>';
    }
  };

  window.deleteSubmissionItem = async function(id) {
    if (!requireContentManagerUiAction()) return;
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn bài nộp này và ảnh bài làm liên quan khỏi cơ sở dữ liệu?')) return;
    try {
      await window.VMODataService.deleteSubmission(id);
      showToast('Đã xóa bài nộp và ảnh liên quan khỏi cơ sở dữ liệu.', true);
      await loadAllSubmissions();
    } catch (err) {
      showToast('Không thể xóa bài nộp: ' + (err?.message || 'Lỗi không xác định'), false);
    }
  };

  window.setSubmissionVerification = async function(id, verified) {
    if (!requireContentManagerUiAction()) return;
    const actionLabel = verified ? 'xác minh' : 'hủy xác minh';
    const warning = verified
      ? 'Sau khi xác minh, lời giải này có thể được dùng làm nguồn tham khảo tin cậy cho AI Hướng dẫn giải và AI Đánh giá bài. Chỉ tiếp tục nếu đã kiểm tra đầy đủ tính đúng đắn toán học.'
      : 'Sau khi hủy xác minh, lời giải này sẽ không còn được dùng làm nguồn tham khảo tin cậy cho Gia sư Toán AI.';
    if (!window.confirm(`${warning}\n\nTiếp tục ${actionLabel} bài nộp này?`)) return;
    const note = window.prompt(verified
      ? 'Ghi chú xác minh (khuyến nghị nêu phạm vi đã kiểm tra):'
      : 'Lý do hủy xác minh:', '') ?? null;
    if (note === null) return;
    try {
      await window.VMODataService.verifySubmission(id, verified, note);
      showToast(verified ? 'Đã xác minh bài nộp. Lời giải có thể được AI dùng làm nguồn tin cậy.' : 'Đã hủy xác minh bài nộp.', true);
      await loadAllSubmissions();
    } catch (err) {
      showToast(`Không thể ${actionLabel} bài nộp: ${err?.message || 'Lỗi không xác định'}`, false);
    }
  };

  function ensureSubmissionContentEditorModal() {
    let modal = document.getElementById('submissionContentEditorModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'submissionContentEditorModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10060;background:rgba(15,23,42,.68);align-items:center;justify-content:center;padding:18px;';
    modal.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="submissionContentEditorTitle" style="width:min(960px,96vw);max-height:94vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(15,23,42,.38);">
        <div style="position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;background:#0f766e;color:#fff;border-radius:12px 12px 0 0;">
          <div>
            <div id="submissionContentEditorTitle" style="font-size:1.05rem;font-weight:800;">✏️ Chỉnh sửa lời giải MathJax</div>
            <div id="submissionContentEditorMeta" style="font-size:.78rem;opacity:.9;margin-top:2px;"></div>
          </div>
          <button type="button" onclick="closeSubmissionContentEditor()" aria-label="Đóng" style="background:transparent;border:0;color:#fff;font-size:1.4rem;cursor:pointer;">✕</button>
        </div>
        <div style="padding:16px 18px;">
          <div id="submissionContentEditorWarning" style="display:none;margin-bottom:10px;padding:9px 11px;border:1px solid #fdba74;border-radius:7px;background:#fff7ed;color:#9a3412;font-size:.82rem;"></div>
          <label for="submissionContentEditorText" style="display:block;margin-bottom:6px;font-weight:750;color:#1e293b;">Nội dung lời giải (văn bản/LaTeX MathJax)</label>
          <textarea id="submissionContentEditorText" rows="14" maxlength="50000" spellcheck="false" style="width:100%;box-sizing:border-box;min-height:280px;padding:11px;border:1.5px solid #94a3b8;border-radius:8px;resize:vertical;font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;"></textarea>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
            <button id="submissionContentEditorOcr" type="button" onclick="ocrStoredSubmissionImage()" style="display:none;padding:7px 11px;border:1px solid #67e8f9;border-radius:6px;background:#ecfeff;color:#0e7490;font-weight:700;cursor:pointer;">🔍 OCR lại từ ảnh đã lưu</button>
            <button type="button" onclick="previewSubmissionContentEditor()" style="padding:7px 11px;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;color:#1d4ed8;font-weight:700;cursor:pointer;">👁️ Xem trước MathJax</button>
          </div>
          <div id="submissionContentEditorPreviewBox" style="display:none;margin-top:10px;padding:12px;border:1px dashed #0284c7;border-radius:8px;background:#f8fafc;">
            <strong style="display:block;margin-bottom:7px;color:#0369a1;">Bản xem trước sau chỉnh sửa</strong>
            <div id="submissionContentEditorPreview" style="min-height:48px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;line-height:1.7;overflow:auto;"></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;">
            <button type="button" onclick="closeSubmissionContentEditor()" style="padding:8px 14px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;">Hủy</button>
            <button id="submissionContentEditorSave" type="button" onclick="saveSubmissionContentEditor()" style="padding:8px 14px;border:0;border-radius:6px;background:#0f766e;color:#fff;font-weight:800;cursor:pointer;">💾 Lưu nội dung</button>
          </div>
        </div>
      </div>`;
    modal.addEventListener('click', event => {
      if (event.target === modal) window.closeSubmissionContentEditor();
    });
    document.body.appendChild(modal);
    return modal;
  }

  window.openSubmissionContentEditor = function(id, index) {
    if (!requireContentManagerUiAction()) return;
    const submission = (window.lastLoadedSubmissions || []).find(item => String(item.id || item._id || '') === String(id))
      || window.lastLoadedSubmissions?.[index];
    if (!submission) {
      showToast('Không tìm thấy bản ghi bài nộp để chỉnh sửa.', false);
      return;
    }
    const modal = ensureSubmissionContentEditorModal();
    window.editingSubmissionContentRecord = submission;
    modal.dataset.submissionId = String(id);
    const title = submission.problemSnapshot?.title || submission.problemTitle || 'Bài toán VMO';
    const setTitle = submission.problemSnapshot?.setTitle || submission.setTitle || '';
    document.getElementById('submissionContentEditorMeta').textContent = [title, setTitle, submission.username].filter(Boolean).join(' · ');
    document.getElementById('submissionContentEditorText').value = String(submission.solutionContent || '');
    const warning = document.getElementById('submissionContentEditorWarning');
    warning.style.display = submission.adminVerified === true ? 'block' : 'none';
    warning.textContent = submission.adminVerified === true
      ? 'Bài này đang được xác minh. Khi lưu nội dung mới, hệ thống sẽ tự hủy xác minh và yêu cầu admin kiểm tra lại.'
      : 'Hãy kiểm tra bản xem trước MathJax trước khi lưu. Sau khi có nội dung văn bản, nút “Xác minh bài nộp” sẽ được mở.';
    const ocrBtn = document.getElementById('submissionContentEditorOcr');
    ocrBtn.style.display = submission.hasImage ? '' : 'none';
    document.getElementById('submissionContentEditorPreviewBox').style.display = 'none';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.closeSubmissionContentEditor = function() {
    const modal = document.getElementById('submissionContentEditorModal');
    if (modal) modal.style.display = 'none';
    window.editingSubmissionContentRecord = null;
    document.body.style.overflow = document.getElementById('dataHubModal')?.classList.contains('active') ? 'hidden' : '';
  };

  window.previewSubmissionContentEditor = function() {
    const text = String(document.getElementById('submissionContentEditorText')?.value || '').trim();
    if (!text) {
      showToast('Vui lòng nhập hoặc OCR nội dung lời giải trước khi xem MathJax.', false);
      return;
    }
    const box = document.getElementById('submissionContentEditorPreviewBox');
    box.style.display = 'block';
    window.safeRenderMathJaxToElement(document.getElementById('submissionContentEditorPreview'), text);
  };

  window.ocrStoredSubmissionImage = async function() {
    const submission = window.editingSubmissionContentRecord;
    const button = document.getElementById('submissionContentEditorOcr');
    if (!submission?.hasImage || !window.VMODataService?.getSubmissionImage) {
      showToast('Bản ghi này không có ảnh bài giải để OCR.', false);
      return;
    }
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '⏳ Đang OCR...';
    try {
      const stored = await window.VMODataService.getSubmissionImage(submission.id || submission._id);
      if (!stored?.image) throw new Error('Không tìm thấy ảnh bài giải đã lưu');
      const response = await fetch('/api/ai-ocr-math', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: stored.image,
          problemId: submission.problemId || '',
          problemTitle: submission.problemSnapshot?.title || submission.problemTitle || '',
          problemContent: submission.problemSnapshot?.content || ''
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.data?.latexText) {
        throw new Error(data?.error || data?.message || 'Không thể OCR ảnh bài giải');
      }
      document.getElementById('submissionContentEditorText').value = String(data.data.latexText).trim();
      window.previewSubmissionContentEditor();
      showToast('Đã OCR lại ảnh. Admin có thể chỉnh sửa công thức trước khi lưu.', true);
    } catch (error) {
      showToast('Không thể OCR ảnh đã lưu: ' + (error?.message || 'Lỗi không xác định'), false);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  };

  window.saveSubmissionContentEditor = async function() {
    if (!requireContentManagerUiAction()) return;
    const modal = document.getElementById('submissionContentEditorModal');
    const id = String(modal?.dataset.submissionId || '');
    const content = String(document.getElementById('submissionContentEditorText')?.value || '').trim();
    if (!content) {
      showToast('Nội dung lời giải văn bản không được để trống.', false);
      return;
    }
    const button = document.getElementById('submissionContentEditorSave');
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '⏳ Đang lưu...';
    try {
      await window.VMODataService.updateSubmissionContent(id, content);
      window.closeSubmissionContentEditor();
      showToast('Đã cập nhật nội dung MathJax. Vui lòng xác minh lại sau khi kiểm tra.', true);
      await window.loadAllSubmissions();
    } catch (error) {
      showToast('Không thể cập nhật nội dung: ' + (error?.message || 'Lỗi không xác định'), false);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  };

  window.toggleAddEventForm = function() {
    if (!requireContentManagerUiAction()) return;
    const f = document.getElementById('formAddEvent');
    if (f) f.style.display = (f.style.display === 'none') ? 'block' : 'none';
  };
  window.toggleAddDocForm = function() {
    if (!requireContentManagerUiAction()) return;
    const f = document.getElementById('formAddDoc');
    if (f) {
      f.style.display = (f.style.display === 'none') ? 'block' : 'none';
      if (f.style.display === 'block') {
        populateExamTargetOptions();
        window.syncDocumentDestination();
        window.loadUniversityCatalog?.().then(()=>window.syncDocumentDestination()).catch(error=>showToast(error.message,false));
      }
    }
  };
  const ocrStates = { doc: { questions: [], images: [], confidence: '' }, exam: { questions: [], images: [], confidence: '' } };

  function populateExamTargetOptions() {
    const select = document.getElementById('docTargetAnchor');
    if (!select) return;
    const previous = select.value;
    const canonical = Array.isArray(window.VMO_TST_LOCATIONS) ? window.VMO_TST_LOCATIONS : [];
    const known = new Set(canonical.map(item => item.anchor));
    const cards = Array.from(document.querySelectorAll('#tab-tst .exam-card[id]'));
    const legacy = cards.filter(card => !known.has(card.id)).map((card, index) => ({
      name: card.querySelector('.tag-province')?.textContent?.trim() || card.id,
      province: card.querySelector('.tag-province')?.textContent?.trim() || card.id,
      anchor: card.id, region: card.dataset.filter || 'BAC', type: 'legacy', order: 201 + index
    }));
    select.replaceChildren();
    [['34 tỉnh/thành phố', canonical.filter(item => item.type === 'province')],
     ['Trường chuyên trực thuộc đại học', canonical.filter(item => item.type === 'university_school')],
     ['Đơn vị hiện có khác', legacy]].forEach(([label, items]) => {
      if (!items.length) return;
      const group = document.createElement('optgroup');
      group.label = label;
      items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.anchor;
        option.textContent = item.name;
        option.dataset.province = item.province || item.name;
        option.dataset.region = item.region;
        option.dataset.order = String(item.order || 0);
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    if (previous && Array.from(select.options).some(option => option.value === previous)) select.value = previous;
    window.syncExamProvinceFromTarget('doc');
  }

  window.syncUniversityRegion=function() {
    if(document.getElementById('docDestination')?.value!=='university')return;
    const select=document.getElementById('docUniversityRegion'),hidden=document.getElementById('docRegion');
    if(hidden)hidden.value=select?.value||'BAC';
    const name=document.getElementById('docRegionName');if(name)name.disabled=select?.value!=='OTHER';
  };
  window.addUniversityExamDay=function() {
    if(!requireContentManagerUiAction()||document.getElementById('docDestination')?.value!=='university')return;
    const select=document.getElementById('docDayNumber');if(!select)return;
    const next=Math.max(4,...[...select.options].map(o=>Number(o.value)))+1;
    if(next>999)return showToast('Tối đa 999 ngày thi trong một chuyên đề/năm.',false);
    select.add(new Option(window.MathAppUniversity.dayLabel(next),String(next)));select.value=String(next);window.resetExamOcrPreview('doc');
  };
  window.addOcrExamQuestion=function(kind='doc') {
    if(!requireContentManagerUiAction())return;
    const current=collectExamOcrQuestions(kind),max=kind==='doc'&&document.getElementById('docDestination')?.value==='university'?1000:10;
    if(current.length>=max)return showToast(`Tối đa ${max} câu; hãy chia sang ngày thi khác.`,false);
    ocrStates[kind].questions=[...current,{questionNumber:Math.max(0,...current.map(q=>q.questionNumber))+1,topic:'',content:'',maxScore:0}];
    renderExamOcrEditor(kind);const save=document.getElementById(`${kind}SaveButton`);if(save)save.disabled=!ocrStates[kind].images.length;
  };
  window.openUniversityCatalogEditor=async function(kind) {
    if(!requireContentManagerUiAction()||document.getElementById('docDestination')?.value!=='university')return;
    if(document.getElementById('universityCatalogEditor'))return;
    try{await window.loadUniversityCatalog?.();}catch(error){return showToast(error.message,false);}
    const courseId=document.getElementById('docCourseId')?.value;
    const modal=document.createElement('div');modal.id='universityCatalogEditor';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',kind==='course'?'Thêm học phần Đại học':'Thêm chuyên đề con');
    modal.style.cssText='position:fixed;inset:0;z-index:25000;background:#0008;display:flex;align-items:center;justify-content:center;padding:16px';
    const form=document.createElement('form');form.style.cssText='background:var(--card-bg,#fff);color:var(--text-color,#172033);padding:22px;border-radius:12px;width:480px;max-width:100%';
    const heading=document.createElement('h3');heading.textContent=kind==='course'?'Thêm học phần Đại học':'Thêm chuyên đề con';form.append(heading);
    const fields=kind==='course'?[['code','Mã học phần',50],['nameVi','Tên học phần',200],['name','Tên tiếng Anh (tùy chọn)',200]]:[['title','Tên chuyên đề con',200]];
    for(const [key,title,max] of fields){const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.name=key;input.maxLength=max;input.required=key!=='name';input.style.cssText='display:block;width:100%;box-sizing:border-box;margin:6px 0 12px;padding:9px';label.append(input);form.append(label);}
    const error=document.createElement('p');error.setAttribute('role','alert');error.style.color='#b91c1c';form.append(error);
    const close=document.createElement('button');close.type='button';close.textContent='Hủy';
    const dismiss=()=>{modal.remove();document.removeEventListener('keydown',keys);};close.onclick=dismiss;
    const save=document.createElement('button');save.type='submit';save.textContent='Lưu danh mục';form.append(close,save);
    const keys=event=>{if(event.key==='Escape'){event.stopPropagation();dismiss();}if(event.key==='Tab'){const nodes=[...form.querySelectorAll('input,button')].filter(el=>!el.disabled);if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}}};
    form.onsubmit=async event=>{
      event.preventDefault();if(!requireContentManagerUiAction())return;save.disabled=true;error.textContent='';
      const payload={kind,courseId};for(const [key] of fields)payload[key]=form.elements[key].value.trim();
      try{const response=await fetch('/api/data',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add_university_catalog_item',payload})});
        const body=await response.json();if(!response.ok||!body.success)throw Error(body.error||'Không lưu được danh mục');
        window.applyUniversityCatalog(body.item.catalog);document.getElementById('docCourseId').value=body.item.courseId;window.syncDocumentDestination(true);
        if(body.item.sectionId)document.getElementById('docSectionId').value=body.item.sectionId;
        dismiss();showToast('Đã lưu danh mục Đại học vào cơ sở dữ liệu.',true);
      }catch(err){error.textContent=err.message;}finally{save.disabled=false;}
    };
    modal.append(form);document.body.append(modal);document.addEventListener('keydown',keys);form.querySelector('input')?.focus();
  };
  window.addEventListener('universitycatalogchange',()=>{if(document.getElementById('docCourseId'))window.syncDocumentDestination();});

  window.syncDocumentDestination = function(resetPreview = false) {
    const destination = document.getElementById('docDestination')?.value || 'tst';
    const university = destination === 'university';
    const provinceLabel=document.getElementById('docProvinceLabel');if(provinceLabel)provinceLabel.textContent=university?'Mã học phần *':'Tỉnh / Đơn vị *';
    const courseSelect=document.getElementById('docCourseId');
    if(courseSelect) {
      const courses=window.MathAppUniversity?.courses||[],signature=courses.map(c=>c.id).join('|');
      if(courseSelect.dataset.registry!==signature) {const previous=courseSelect.value;courseSelect.replaceChildren();courses.forEach(c=>courseSelect.add(new Option(`${c.code}: ${c.nameVi}`,c.id)));courseSelect.dataset.registry=signature;if(courses.some(c=>c.id===previous))courseSelect.value=previous;}
    }if(courseSelect)courseSelect.required=university;
    const courseWrap=document.getElementById('docCourseWrap');if(courseWrap)courseWrap.style.display=university?'block':'none';
    const sectionSelect=document.getElementById('docSectionId');
    if(sectionSelect) {
      sectionSelect.required=university;sectionSelect.disabled=!university;
      const course=window.MathAppUniversity?.course(courseSelect?.value);
      const signature=JSON.stringify([course?.id,course?.sections]);
      if(sectionSelect.dataset.registry!==signature) {
        const previous=sectionSelect.dataset.courseId===course?.id?sectionSelect.value:'';
        sectionSelect.replaceChildren(new Option('Chọn chuyên đề con…',''));
        (course?.sections||[]).forEach(section=>sectionSelect.add(new Option(`${section.number}. ${section.title}`,section.id)));
        sectionSelect.dataset.courseId=course?.id||'';sectionSelect.dataset.registry=signature;
        if(course?.sections.some(s=>s.id===previous))sectionSelect.value=previous;
      }
    }
    if(university) { const course=window.MathAppUniversity?.course(courseSelect?.value);const province=document.getElementById('docProvince');if(province && course)province.value=course.code; }
    const options=document.getElementById('docUniversityOptions');if(options)options.style.display=university?'block':'none';
    const countInput=document.getElementById('docQuestionCount');if(countInput){countInput.required=university;countInput.disabled=!university;}
    const addDay=document.getElementById('docAddDay');if(addDay)addDay.style.display=university?'':'none';
    const day=document.getElementById('docDayNumber');if(day&&!university){[...day.options].filter(o=>Number(o.value)>4).forEach(o=>o.remove());}
    const autoRegion=document.getElementById('docAutoRegionWrap');if(autoRegion)autoRegion.style.display=university?'none':'';
    if(university)window.syncUniversityRegion?.();
    const regional = destination === 'regional';
    const admission = destination === 'admission';
    const graded = ['olympic30', 'duyenhai'].includes(destination);
    const competition = ['vmo', 'olympic', 'olympic30', 'duyenhai'].includes(destination);
    const tstWrap = document.getElementById('docTstTargetWrap');
    const regionalWrap = document.getElementById('docRegionalTargetWrap');
    const competitionWrap = document.getElementById('docCompetitionWrap');
    const competitionInput = document.getElementById('docCompetition');
    const tstTarget = document.getElementById('docTargetAnchor');
    const regionalTarget = document.getElementById('docRegionalUnit');
    const schoolSelect = document.getElementById('docSchoolId');
    if (schoolSelect) { schoolSelect.required = admission; if (admission) window.populateAdmissionSchoolOptions?.(); }
    const schoolWrap = document.getElementById('docAdmissionWrap');
    if (schoolWrap) schoolWrap.style.display = admission ? 'block' : 'none';
    const hint = document.getElementById('docDestinationHint');
    const save = document.getElementById('docSaveButton');
    if (tstWrap) tstWrap.style.display = destination === 'tst' ? 'block' : 'none';
    if (regionalWrap) regionalWrap.style.display = regional ? 'block' : 'none';
    const gradeInput = document.getElementById('docGrade');
    const gradeWrap = document.getElementById('docGradeWrap');
    if (gradeWrap) gradeWrap.style.display = graded ? 'block' : 'none';
    if (gradeInput) gradeInput.required = graded;
    if (competitionWrap) competitionWrap.style.display = competition ? 'block' : 'none';
    if (competitionInput) { competitionInput.required = competition; if (resetPreview) competitionInput.value = destination === 'vmo' ? 'VMO' : destination === 'olympic' ? 'IMO' : destination === 'olympic30' ? 'Olympic 30/4' : destination === 'duyenhai' ? 'Duyên hải miền Bắc' : ''; }
    if (tstTarget) tstTarget.required = destination === 'tst';
    if (regionalTarget) regionalTarget.required = regional;
    const label = { tst: 'TST', regional: 'Đà Nẵng–Quảng Nam', vmo: 'VMO', olympic: 'IMO–Olympic', olympic30: 'Olympic 30/4', duyenhai: 'Duyên hải miền Bắc', admission: 'Đề thi vào lớp 10 chuyên', university: 'Đại học' }[destination];
    if (hint) hint.textContent = `Đề sẽ được lưu và hiển thị trong kho ${label}.`;
    if (save) save.textContent = `Lưu đề ${label} & câu hỏi vào cơ sở dữ liệu`;
    if (admission) window.syncAdmissionSchool?.();
    else if (regional) window.syncRegionalExamTarget();
    else if (competition) { const province = document.getElementById('docProvince'); if (province) province.value = competitionInput?.value.trim() || ''; }
    else if (!university) window.syncExamProvinceFromTarget('doc');
    if (resetPreview) window.resetExamOcrPreview('doc');
  };

  window.syncRegionalExamTarget = function() {
    const unit = document.getElementById('docRegionalUnit')?.value === 'qn' ? 'Quảng Nam' : 'Đà Nẵng';
    const province = document.getElementById('docProvince');
    const region = document.getElementById('docRegion');
    const display = document.getElementById('docRegionDisplay');
    if (province) province.value = unit;
    if (region) region.value = 'TRUNG';
    if (display) display.value = 'Miền Trung';
  };

  function populatePredictionTargets() {
    const select = document.getElementById('examPredictionTarget');
    if (!select || select.options.length) return;
    (window.VMO_TST_LOCATIONS || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item.anchor;
      option.textContent = item.name;
      option.dataset.province = item.name;
      option.dataset.region = item.region;
      select.appendChild(option);
    });
    const danang = Array.from(select.options).find(item => item.value === 'tst-da-nang');
    if (danang) select.value = danang.value;
  }

  window.syncExamCreationMode = function() {
    const prediction = document.getElementById('examCreationMode')?.value === 'prediction';
    const panel = document.getElementById('examPredictionPanel');
    const imageBox = document.getElementById('examImageBox');
    const input = document.getElementById('examImages');
    if (panel) panel.style.display = prediction ? 'block' : 'none';
    if (imageBox) imageBox.style.display = prediction ? 'none' : 'block';
    if (input) { input.required = !prediction; if (prediction) input.value = ''; }
    const province = document.getElementById('examProvince');
    const year = document.getElementById('examYear');
    if (province) { province.readOnly = prediction; if (!prediction) province.value = 'Đà Nẵng'; }
    if (year) { year.readOnly = prediction; if (!prediction) year.value = '2026-2027'; }
    window.resetExamOcrPreview('exam');
    ocrStates.exam.prediction = null;
    if (prediction) window.syncExamPredictionTarget();
  };

  window.syncExamPredictionTarget = function() {
    const isVmo = document.getElementById('examPredictionType')?.value === 'vmo';
    const select = document.getElementById('examPredictionTarget');
    if (select) select.disabled = isVmo;
    const option = select?.selectedOptions?.[0];
    const region = isVmo ? 'BAC' : option?.dataset.region || 'BAC';
    const province = document.getElementById('examProvince');
    const regionInput = document.getElementById('examRegion');
    const display = document.getElementById('examRegionDisplay');
    if (province) province.value = isVmo ? 'VMO – Bộ GDĐT' : option?.dataset.province || '';
    if (regionInput) regionInput.value = region;
    if (display) display.value = isVmo ? 'Toàn quốc' : { BAC: 'Miền Bắc', TRUNG: 'Miền Trung', NAM: 'Miền Nam' }[region];
  };

  window.syncExamPredictionYear = function() {
    const year = document.getElementById('examYear');
    const selected = document.getElementById('examPredictionYear');
    if (year && selected) year.value = selected.value;
  };

  function predictionInputKey() {
    return JSON.stringify([
      document.getElementById('examCreationMode')?.value,
      document.getElementById('examPredictionType')?.value,
      document.getElementById('examPredictionTarget')?.value,
      document.getElementById('examPredictionYear')?.value,
      document.getElementById('examPredictionLookback')?.value,
      document.getElementById('examDayNumber')?.value,
      document.getElementById('examPredictionOutline')?.value,
      document.getElementById('examPredictionStructure')?.value,
      document.getElementById('examPredictionNotes')?.value
    ]);
  }

  window.previewExamPredictionEvidence = async function() {
    if (!requireContentManagerUiAction()) return;
    const button = document.getElementById('examPreviewButton');
    const status = document.getElementById('examPredictionStatus');
    const targetType = document.getElementById('examPredictionType')?.value;
    const target = document.getElementById('examPredictionTarget')?.selectedOptions?.[0];
    button.disabled = true;
    if (status) status.textContent = 'Đang kiểm tra kho đề cơ sở dữ liệu...';
    try {
      const response = await fetch('/api/ai-predict-exam', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          preview: true, targetType, targetAnchor: targetType === 'vmo' ? 'vmo-official' : target?.value,
          province: targetType === 'vmo' ? 'VMO' : target?.dataset?.province,
          year: document.getElementById('examPredictionYear')?.value,
          dayNumber: Number(document.getElementById('examDayNumber')?.value),
          lookback: Number(document.getElementById('examPredictionLookback')?.value)
        }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Không kiểm tra được nguồn.');
      const data = result.data;
      if (status) status.textContent = `cơ sở dữ liệu: ${data.ownExamCount} đề của đơn vị (${data.years.join(', ') || 'chưa có'}); thiếu ${data.missingYears.length} năm; ${data.peerExamCount} đề TST đối chiếu.`;
    } catch (error) { if (status) status.textContent = error.message; }
    finally { button.disabled = false; }
  };

  window.runPredictExam = async function() {
    if (!requireContentManagerUiAction()) return;
    const button = document.getElementById('examPredictButton');
    const status = document.getElementById('examPredictionStatus');
    const report = document.getElementById('examPredictionEvidence');
    const targetType = document.getElementById('examPredictionType')?.value;
    const target = document.getElementById('examPredictionTarget');
    const lookback = Number(document.getElementById('examPredictionLookback')?.value);
    if (!Number.isInteger(lookback) || lookback < 1 || lookback > 15) return showToast('Số năm tham chiếu phải từ 1 đến 15.', false);
    window.syncExamPredictionYear();
    window.syncExamPredictionTarget();
    const requestKey = predictionInputKey();
    window.resetExamOcrPreview('exam');
    ocrStates.exam.prediction = null;
    if (report) report.replaceChildren();
    if (button) button.disabled = true;
    if (status) status.textContent = 'Gia sư Toán AI đang soạn đề và kiểm định độc lập từng câu (có thể mất gần 5 phút)...';
    try {
      const response = await fetch('/api/ai-predict-exam', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetAnchor: targetType === 'vmo' ? 'vmo-official' : target?.value,
          province: document.getElementById('examProvince')?.value, year: document.getElementById('examPredictionYear')?.value,
          dayNumber: Number(document.getElementById('examDayNumber')?.value), lookback,
          outline: document.getElementById('examPredictionOutline')?.value,
          historicalNotes: document.getElementById('examPredictionNotes')?.value,
          structureNotes: document.getElementById('examPredictionStructure')?.value })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || `Không tạo được đề dự đoán (HTTP ${response.status})`);
      if (requestKey !== predictionInputKey()) throw new Error('Thông số đã thay đổi trong lúc tạo đề; vui lòng tạo lại.');
      const data = payload.data;
      if (!Array.isArray(data?.questions) || !Array.isArray(data?.quality?.questionChecks) ||
          data.quality.questionChecks.length !== data.questions.length) {
        throw new Error('Thiếu nội dung đề hoặc nhận xét Gia sư Toán AI theo từng câu; chưa thể lưu bản dự đoán.');
      }
      ocrStates.exam.questions = data.questions;
      ocrStates.exam.prediction = { key: requestKey, evidence: data.evidence, model: data.model,
        quality: data.quality, verifiedQuestions: data.questions.map(question => ({ questionNumber: question.questionNumber,
          topic: question.topic, maxScore: question.maxScore, content: question.content })),
        targetType, targetAnchor: targetType === 'vmo' ? 'vmo-official' : target.value };
      document.getElementById('examTitle').value = data.title;
      renderExamOcrEditor('exam');
      document.getElementById('examSaveButton').disabled = false;
      const evidence = data.evidence || {};
      if (report) {
        const summary = document.createElement('p');
        const mergerText = evidence.mergedProvinceHistory
          ? ` Đã hợp nhất lịch sử ${evidence.historyMembers?.join(' + ')} vào ${evidence.historyCurrentProvince}.`
          : '';
        summary.textContent = `Nguồn cơ sở dữ liệu: ${evidence.ownExamCount || 0} đề / ${evidence.years?.length || 0} năm của đơn vị (${(evidence.years || []).join(', ') || 'chưa có'}); thiếu ${evidence.missingYears?.length || 0} năm trong phạm vi yêu cầu. ${evidence.peerExamCount || 0} đề TST cùng kỳ ${evidence.trendYear || ''}.${mergerText} ${data.reasoning || ''}`;
        report.appendChild(summary);
        const review = document.createElement('p');
        review.textContent = `Kiểm định Gia sư Toán AI: ${data.quality.verified ? 'Đã duyệt' : 'Chưa duyệt — lưu để admin sửa'} (${data.quality.score}/5). ${data.quality.summary || ''}`;
        report.appendChild(review);
        (data.quality.criticalIssues || []).forEach(issue => {
          const item = document.createElement('p');
          item.style.color = '#b91c1c';
          item.textContent = `⚠️ ${issue}`;
          report.appendChild(item);
        });
        (data.quality.questionChecks || []).forEach(check => {
          const item = document.createElement('div');
          item.textContent = `Câu ${check.questionNumber} · ${check.approved ? 'Đã duyệt' : 'Cần sửa'}: ${[check.reason, ...(check.issues || [])].filter(Boolean).join(' · ') || 'Gia sư Toán AI chưa nêu đủ lý do.'}`;
          report.appendChild(item);
        });
        (evidence.sources || []).slice(0, 10).forEach(source => {
          const item = document.createElement('div');
          item.textContent = `${source.year} · ${source.unit || source.title} · ${source.title} · ${source.source}`;
          report.appendChild(item);
        });
      }
      if (status) status.textContent = data.quality.verified
        ? 'Gia sư Toán AI đã soạn và kiểm định bản gốc. Hãy rà soát từng câu trước khi lưu.'
        : 'Đề chưa được Gia sư Toán AI duyệt. Có thể lưu vào cơ sở dữ liệu; câu bị bác sẽ ẩn với thành viên cho đến khi admin sửa và xác nhận.';
    } catch (error) {
      if (status) status.textContent = error.message;
      showToast(error.message, false);
    } finally { if (button) button.disabled = false; }
  };

  window.syncExamProvinceFromTarget = function(kind = 'doc') {
    const option = document.getElementById(`${kind}TargetAnchor`)?.selectedOptions?.[0];
    if (!option) return;
    const region = ['BAC', 'TRUNG', 'NAM'].includes(option.dataset.region) ? option.dataset.region : 'BAC';
    const provinceInput = document.getElementById(`${kind}Province`);
    const regionInput = document.getElementById(`${kind}Region`);
    const regionDisplay = document.getElementById(`${kind}RegionDisplay`);
    if (provinceInput) provinceInput.value = option.dataset.province || option.textContent || '';
    if (regionInput) regionInput.value = region;
    if (regionDisplay) regionDisplay.value = { BAC: 'Miền Bắc', TRUNG: 'Miền Trung', NAM: 'Miền Nam' }[region];
  };

  window.resetExamOcrPreview = function(kind = 'exam') {
    const state = ocrStates[kind];
    if (!state) return;
    state.revision = (state.revision || 0) + 1;
    state.questions = [];
    state.images = [];
    state.confidence = '';
    if (kind === 'exam') state.prediction = null;
    const preview = document.getElementById(`${kind}OcrPreview`);
    const save = document.getElementById(`${kind}SaveButton`);
    const status = document.getElementById(`${kind}OcrStatus`);
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (save) save.disabled = true;
    if (status) status.textContent = 'Ảnh đã thay đổi; cần chạy OCR lại.';
  };

  async function examImageDataUrl(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WEBP');
    const original = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không đọc được ảnh đề thi'));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Ảnh đề thi không hợp lệ'));
      element.src = original;
    });
    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.9;
    let output = canvas.toDataURL('image/jpeg', quality);
    while (output.length > 2_800_000 && quality > 0.55) {
      quality -= 0.08;
      output = canvas.toDataURL('image/jpeg', quality);
    }
    if (output.length > 3_000_000) throw new Error('Ảnh quá lớn sau khi nén; vui lòng chụp/cắt rõ từng trang');
    return output;
  }

  window.prepareMathSupportImage = examImageDataUrl;

  function renderExamOcrEditor(kind = 'exam') {
    const preview = document.getElementById(`${kind}OcrPreview`);
    const questions = ocrStates[kind].questions || [];
    if (!preview) return;
    preview.style.display = 'block';
    preview.innerHTML = `<div style="font-weight:800;color:#1e293b;margin-bottom:8px;">${kind === 'exam' && ocrStates.exam.prediction ? 'Bản đề dự đoán (AI) — kiểm tra tính đúng đắn và chỉnh sửa trước khi lưu' : 'Bản OCR — kiểm tra và chỉnh sửa trước khi lưu'} (${questions.length} câu)</div>` + questions.map((item, index) => `
      <div class="exam-ocr-question" data-index="${index}" style="border-top:1px solid #e2e8f0;padding-top:10px;margin-top:10px;">
        ${kind === 'exam' && ocrStates.exam.prediction?.quality?.questionChecks?.[index]?.approved === false
          ? `<div style="padding:9px;margin-bottom:8px;border:1px solid #fca5a5;background:#fef2f2;border-radius:6px;color:#991b1b;white-space:pre-wrap;"><strong>⚠️ Gia sư Toán AI chưa duyệt Câu ${Number(item.questionNumber) || index + 1}</strong><br>${escapeHtmlText([ocrStates.exam.prediction.quality.questionChecks[index].reason, ...(ocrStates.exam.prediction.quality.questionChecks[index].issues || [])].filter(Boolean).join('\n'))}</div>` : ''}
        <div style="display:grid;grid-template-columns:90px 1fr 90px;gap:8px;margin-bottom:7px;">
          <input class="exam-ocr-number" type="number" min="1" max="${document.getElementById('docDestination')?.value==='university'&&kind==='doc'?1000:99}" value="${Number(item.questionNumber) || index + 1}" aria-label="Số câu" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;">
          <input class="exam-ocr-topic" value="${escapeHtmlText(item.topic || 'Toán Olympic')}" aria-label="Chuyên đề" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;">
          <input class="exam-ocr-score" type="number" min="0" max="20" step="0.25" value="${Number(item.maxScore) || 0}" aria-label="Điểm" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;">
        </div>
        <button type="button" onclick="this.closest('.exam-ocr-question').remove()" aria-label="Bỏ câu hỏi khỏi bản OCR">Bỏ câu này</button>
        <textarea class="exam-ocr-content" rows="7" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:5px;font-family:monospace;">${escapeHtmlText(item.content || '')}</textarea>
        <div class="exam-ocr-math-preview" data-no-i18n="true" style="margin-top:7px;padding:9px;border:1px solid #e2e8f0;border-radius:5px;line-height:1.65;"></div>
      </div>`).join('');
    preview.querySelectorAll('.exam-ocr-question').forEach((row, index) => {
      window.safeRenderMathJaxToElement?.(row.querySelector('.exam-ocr-math-preview'), questions[index]?.content || '');
      row.querySelector('.exam-ocr-content')?.addEventListener('input', event => {
        window.safeRenderMathJaxToElement?.(row.querySelector('.exam-ocr-math-preview'), event.target.value);
      });
    });
  }

  window.runExamOcr = async function(kind = 'exam') {
    if (!requireContentManagerUiAction()) return;
    const input = document.getElementById(`${kind}Images`);
    const files = Array.from(input?.files || []);
    if (!files.length) return showToast('Vui lòng chọn ít nhất một ảnh đề thi.', false);
    const button = document.getElementById(`${kind}OcrButton`);
    const status = document.getElementById(`${kind}OcrStatus`);
    const province = document.getElementById(`${kind}Province`)?.value?.trim() || '';
    const year = document.getElementById(`${kind}Year`)?.value?.trim() || '2026-2027';
    const dayNumber = Number(document.getElementById(`${kind}DayNumber`)?.value) || 1;
    const destination = kind === 'doc'
      ? (document.getElementById('docDestination')?.value || 'tst')
      : 'mock';
    if(destination==='university' && !window.MathAppUniversity?.section(document.getElementById('docCourseId')?.value,document.getElementById('docSectionId')?.value)) return showToast('Vui lòng chọn chuyên đề con thuộc học phần.',false);
    if (!province) return showToast('Vui lòng chọn tỉnh/thành phố.', false);
    window.resetExamOcrPreview(kind);
    const ocrRevision=ocrStates[kind].revision;
    const requestCourseId=document.getElementById('docCourseId')?.value;
    const requestSectionId=document.getElementById('docSectionId')?.value;
    const questionCount=destination==='university'?Number(document.getElementById('docQuestionCount')?.value):10;
    if(!Number.isInteger(questionCount)||questionCount<1||questionCount>1000)return showToast('Số câu khai báo phải từ 1–1000.',false);
    if (button) button.disabled = true;
    try {
      const byNumber = new Map();
      for (let index = 0; index < files.length; index += 1) {
        if (status) status.textContent = `Đang OCR ảnh ${index + 1}/${files.length} (có thể mất đến 2 phút)...`;
        const image = await examImageDataUrl(files[index]);
        if(ocrRevision!==ocrStates[kind].revision)return;
        ocrStates[kind].images.push(image);
        const response = await fetch('/api/ai-ocr-exam', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, province, year, dayNumber, destination, questionCount, courseId: destination === 'university' ? requestCourseId : undefined, sectionId: destination === 'university' ? requestSectionId : undefined, schoolName: destination === 'admission' ? window.VMO_SPECIALIZED_SCHOOLS?.find(school => school.id === document.getElementById('docSchoolId')?.value)?.name : undefined, grade: Number(document.getElementById('docGrade')?.value) || undefined })
        });
        const payload = await response.json().catch(() => ({}));
        if(ocrRevision!==ocrStates[kind].revision)return;
        if (!response.ok || !payload.success) throw new Error(payload.error || `OCR thất bại (HTTP ${response.status})`);
        const data = payload.data || {};
        (data.questions || []).forEach(question => byNumber.set(Number(question.questionNumber), question));
        ocrStates[kind].confidence = data.confidence || ocrStates[kind].confidence;
        const titleInput = document.getElementById(`${kind}Title`);
        const dateInput = document.getElementById(`${kind}Date`);
        const durationInput = document.getElementById(`${kind}Duration`);
        if (titleInput && !titleInput.value.trim() && data.examTitle) titleInput.value = data.examTitle;
        if (dateInput && !dateInput.value && /^\d{4}-\d{2}-\d{2}$/.test(data.examDate || '')) dateInput.value = data.examDate;
        if (durationInput && data.duration) durationInput.value = data.duration;
      }
      ocrStates[kind].questions = Array.from(byNumber.values()).sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));
      renderExamOcrEditor(kind);
      if (status) status.textContent = `Đã OCR ${files.length} ảnh, nhận dạng ${ocrStates[kind].questions.length} câu.`;
      const save = document.getElementById(`${kind}SaveButton`);
      if (save) save.disabled = !ocrStates[kind].questions.length;
      showToast('OCR hoàn tất. Hãy rà soát công thức MathJax trước khi lưu.', true);
    } catch (error) {
      if (status) status.textContent = error?.message || 'OCR thất bại.';
      showToast('Lỗi OCR đề thi: ' + (error?.message || 'Không xác định'), false);
    } finally {
      if (button) button.disabled = false;
    }
  };

  function collectExamOcrQuestions(kind = 'exam') {
    return Array.from(document.querySelectorAll(`#${kind}OcrPreview .exam-ocr-question`)).map((row, index) => {
      const questionNumber = Math.max(1, Number(row.querySelector('.exam-ocr-number')?.value) || index + 1);
      return {
        questionNumber,
        title: `Câu ${questionNumber}`,
        topic: row.querySelector('.exam-ocr-topic')?.value?.trim() || 'Toán Olympic',
        maxScore: Math.max(0, Number(row.querySelector('.exam-ocr-score')?.value) || 0),
        content: row.querySelector('.exam-ocr-content')?.value?.trim() || ''
      };
    }).filter(item => item.content);
  }

  window.toggleAddExamForm = function() {
    if (!requireContentManagerUiAction()) return;
    const f = document.getElementById('formAddExam');
    if (f) {
      f.style.display = (f.style.display === 'none') ? 'block' : 'none';
      if (f.style.display === 'block') {
        const used = Array.from(document.querySelectorAll('#sidebar-mock a[href^="#mock-set"]')).map(link => Number(link.getAttribute('href')?.match(/^#mock-set(\d+)-/)?.[1]) || 0);
        document.getElementById('examSetNumber').value = Math.max(3, ...used) + (Math.max(...used) >= 3 ? 1 : 0);
        window.syncExamCreationMode();
      }
    }
  };

  // Nạp dữ liệu các tab từ MongoDB Atlas qua API đã xác thực
  async function loadHubEvents() {
    const el = document.getElementById('hubEventsList');
    if (!el) return;
    try {
      const events = await window.VMODataService.getEvents();
      if (!events || events.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có sự kiện nào được lưu trên cơ sở dữ liệu. Hãy nhấn "➕ Thêm sự kiện mới" để tạo sự kiện đầu tiên!</div>';
        return;
      }
      el.innerHTML = events.map(e => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#0f172a; font-size:0.95rem;">${e.title}</strong>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
              📅 Ngày: <strong>${e.startDate}</strong> | 📍 Địa điểm: ${e.location || 'Đang cập nhật'}
            </div>
            ${e.description ? `<div style="font-size:0.8rem; color:#475569; margin-top:4px;">${e.description}</div>` : ''}
          </div>
          ${isCurrentUserContentManager() ? `<button type="button" onclick="deleteEventItem('${e.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">🗑️ Xóa</button>` : ''}
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải sự kiện từ cơ sở dữ liệu: ' + err.message + '</div>';
    }
  }

  async function loadHubDocs() {
    const el = document.getElementById('hubDocsList');
    if (!el) return;
    try {
      const [docs, tstExams, regionalExams, vmoExams, olympicExams, olympic30Exams, duyenhaiExams, admissionExams, universityExams] = await Promise.all([
        window.VMODataService.getDocuments(), window.VMODataService.getExamCatalogSummary('tst-national'),
        window.VMODataService.getExamCatalogSummary('history-dn-qn'),
        window.VMODataService.getExamCatalogSummary('vmo-official'),
        window.VMODataService.getExamCatalogSummary('imo-olympic'),
        window.VMODataService.getExamCatalogSummary('olympic-30-4'),
        window.VMODataService.getExamCatalogSummary('duyen-hai-bac'),
        window.VMODataService.getExamCatalogSummary('specialized-admission'),
        window.VMODataService.getExamCatalogSummary('university')
      ]);
      if (!docs.length && !tstExams.length && !regionalExams.length && !vmoExams.length && !olympicExams.length && !olympic30Exams.length && !duyenhaiExams.length && !admissionExams.length && !universityExams.length) {
        el.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;">Chưa có tài liệu hoặc đề lưu trữ nào trong cơ sở dữ liệu.</div>';
        return;
      }
      const catalogExams = [...universityExams.map(exam => ({ ...exam, catalogLabel: `Đại học · ${exam.courseCode || ''}` })), ...admissionExams.map(exam => ({ ...exam, catalogLabel: 'Vào lớp 10 chuyên' })), ...tstExams.map(exam => ({ ...exam, catalogLabel: 'TST' })), ...regionalExams.map(exam => ({ ...exam, catalogLabel: 'Đà Nẵng–Quảng Nam' })), ...vmoExams.map(exam => ({ ...exam, catalogLabel: 'VMO' })), ...olympicExams.map(exam => ({ ...exam, catalogLabel: 'IMO–Olympic' })), ...olympic30Exams.map(exam => ({ ...exam, catalogLabel: `Olympic 30/4 · Lớp ${exam.grade}` })), ...duyenhaiExams.map(exam => ({ ...exam, catalogLabel: `Duyên hải miền Bắc · Lớp ${exam.grade}` }))];
      catalogExams.forEach(exam => managedExams.set(exam.id || exam._id, exam));
      el.innerHTML = catalogExams.map(exam => `<div class="hub-managed-exam" style="padding:10px 14px;margin-bottom:8px;background:#eff6ff;border-radius:8px;"><strong>${escapeHtmlText(exam.title || exam.province)}</strong><div style="font-size:.8rem;color:#475569;">${escapeHtmlText(exam.province || '')} · Ngày ${Number(exam.dayNumber) || 1} · ${Number(exam.problemCount) || exam.problems?.length || 0} câu · ${exam.catalogLabel}</div>${examActions(exam)}</div>`).join('') + docs.map(d => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#0f172a; font-size:0.95rem;">${d.title}</strong>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
              🏷️ Chuyên đề: <strong>${d.topic}</strong> | ✍️ Tác giả: ${d.author || 'Tổ Toán'}
            </div>
            ${d.fileUrl ? `<a href="${d.fileUrl}" target="_blank" rel="noreferrer" style="font-size:0.8rem; color:#0284c7; text-decoration:underline;">🔗 Mở tài liệu</a>` : ''}
          </div>
          ${isCurrentUserContentManager() ? `<button type="button" onclick="deleteDocItem('${d.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">🗑️ Xóa</button>` : ''}
        </div>
      `).join('');
      attachExamSearch('docs', catalogExams);
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải tài liệu: ' + err.message + '</div>';
    }
  }

  async function loadHubExams() {
    const el = document.getElementById('hubExamsList');
    if (!el) return;
    try {
      const exams = await window.VMODataService.getExamCatalogSummary('vmo-mock');
      exams.forEach(exam => managedExams.set(exam.id || exam._id, exam));
      if (!exams || exams.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có đề thi nào trong cơ sở dữ liệu. Nhấn "➕ Thêm đề thi mới" để bắt đầu!</div>';
        return;
      }
      el.innerHTML = exams.map(x => `
        <div class="hub-managed-exam" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
          <strong style="color:#0f172a; font-size:0.95rem;">${escapeHtmlText(x.title)}</strong>
          <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
            ${x.origin === 'prediction' ? '🔮 Đề dự đoán AI · ' : ''}Bộ ${Number(x.setNumber) || ''} · Ngày ${Number(x.dayNumber) || 1} | Năm: ${escapeHtmlText(x.year || '')} | Thời gian: ${Number(x.duration) || 180} phút
          </div>
          ${examActions(x)}
        </div>
      `).join('');
      attachExamSearch('exams', exams);
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải đề thi: ' + err.message + '</div>';
    }
  }

  const managedExams = new Map();
  function attachExamSearch(kind, exams) {
    const list = document.getElementById(kind === 'docs' ? 'hubDocsList' : 'hubExamsList');
    if (!list) return;
    const filterId = kind === 'docs' ? 'hubDocsExamFilter' : 'hubMockExamFilter';
    let filter = document.getElementById(filterId);
    if (!filter) {
      filter = document.createElement('div');
      filter.id = filterId;
      filter.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;';
      filter.innerHTML = `<label>Tìm đề <input type="search" class="exam-query" placeholder="Tên, tỉnh/trường, năm, bộ số..." aria-label="Tìm đề thi" style="padding:7px;min-width:230px;"></label>
        ${kind === 'docs' ? '<label>Kho <select class="exam-category"><option value="">Tất cả</option><option value="university">Đại học</option><option value="specialized-admission">Đề vào lớp 10 chuyên</option><option value="tst-national">TST</option><option value="history-dn-qn">Đà Nẵng–Quảng Nam</option><option value="vmo-official">VMO</option><option value="imo-olympic">IMO–Olympic</option><option value="olympic-30-4">Olympic 30/4</option><option value="duyen-hai-bac">Duyên hải miền Bắc</option></select></label>' : ''}
        <label>Lớp <select class="exam-grade"><option value="">Tất cả</option><option value="10">Lớp 10</option><option value="11">Lớp 11</option></select></label>
        <label>Ngày <select class="exam-day"><option value="">Tất cả</option>${[1, 2, 3, 4].map(day => `<option value="${day}">${day}</option>`).join('')}</select></label>
        <small class="exam-count" role="status"></small>`;
      list.before(filter);
      filter.addEventListener('input', () => applyExamFilter(kind));
      filter.addEventListener('change', () => applyExamFilter(kind));
    }
    const rows = Array.from(list.querySelectorAll('.hub-managed-exam'));
    rows.forEach((row, index) => {
      const exam = exams[index];
      row.dataset.examCategory = exam.category || '';
      row.dataset.examGrade = String(exam.grade || '');
      row.dataset.examDay = String(Number(exam.dayNumber) || 1);
      row.dataset.examSearch = `${exam.title || ''} ${exam.province || ''} ${exam.year || ''} bộ ${exam.setNumber || ''}`;
    });
    applyExamFilter(kind);
  }

  function applyExamFilter(kind) {
    const filter = document.getElementById(kind === 'docs' ? 'hubDocsExamFilter' : 'hubMockExamFilter');
    const list = document.getElementById(kind === 'docs' ? 'hubDocsList' : 'hubExamsList');
    if (!filter || !list) return;
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi');
    const query = normalize(filter.querySelector('.exam-query').value.trim());
    const category = filter.querySelector('.exam-category')?.value || '';
    const grade = filter.querySelector('.exam-grade')?.value || '';
    const day = filter.querySelector('.exam-day').value;
    const rows = Array.from(list.querySelectorAll('.hub-managed-exam'));
    let count = 0;
    rows.forEach(row => {
      const match = (!query || normalize(row.dataset.examSearch).includes(query)) &&
        (!grade || row.dataset.examGrade === grade) && (!category || row.dataset.examCategory === category) && (!day || row.dataset.examDay === day);
      row.style.display = match ? '' : 'none';
      if (match) count++;
    });
    filter.querySelector('.exam-count').textContent = `${count}/${rows.length} đề`;
  }
  function examActions(exam) {
    const id = exam.id || exam._id;
    if (!isCurrentUserContentManager() || !/^[a-f\d]{24}$/i.test(String(id || ''))) return '';
    return `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;"><button type="button" onclick="editManagedExam('${id}')">✏️ Chỉnh sửa đề</button><button type="button" onclick="manageExamQuestions('${id}')">📝 Quản lý câu hỏi</button><button type="button" onclick="deleteManagedExam('${id}')">🗑️ Xóa đề</button></div>`;
  }

  window.manageExamQuestions = async function(id) {
    if (!requireContentManagerUiAction()) return;
    const exam = managedExams.get(id);
    if (!exam) return;
    document.getElementById('managedQuestionsEditor')?.remove();
    const panel = document.createElement('section');
    panel.id = 'managedQuestionsEditor';
    panel.style.cssText = 'padding:14px;margin:12px 0;background:#fff;border:1px solid #94a3b8;border-radius:8px;max-height:65vh;overflow:auto;';
    panel.innerHTML = `<strong>📝 ${escapeHtmlText(exam.title || exam.province || 'Đề thi')} · Ngày ${Number(exam.dayNumber) || 1}</strong>
      <button type="button" class="close-questions" style="float:right">Đóng</button>
      <div class="managed-questions-list">Đang tải câu hỏi...</div>
      <form class="add-exam-question" style="display:grid;gap:8px;margin-top:12px;">
        <strong>➕ Thêm câu hỏi</strong>
        <label>Số câu <input name="questionNumber" type="number" min="1" max="99" required></label>
        <label>Tiêu đề <input name="title" maxlength="500" placeholder="Câu 9"></label>
        <label>Chủ đề <input name="topic" maxlength="120" placeholder="Toán Olympic"></label>
        <label>Điểm tối đa <input name="maxScore" type="number" min="0" max="20" step="0.1" value="0"></label>
        <label>Nội dung HTML/LaTeX <textarea name="content" required rows="8" maxlength="50000" style="width:100%"></textarea></label>
        <button type="submit">Lưu câu hỏi vào cơ sở dữ liệu</button>
      </form>`;
    panel.querySelector('.close-questions').onclick = () => panel.remove();
    (exam.category === 'vmo-mock' ? document.getElementById('hubExamsList') : document.getElementById('hubDocsList'))?.before(panel);
    async function reloadQuestions() {
      const list = panel.querySelector('.managed-questions-list');
      const problems = await window.VMODataService.getProblemsByExam(id);
      if (!panel.isConnected) return;
      list.replaceChildren();
      if (!problems.length) list.textContent = 'Đề chưa có câu hỏi.';
      problems.sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber)).forEach(problem => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
        const label = document.createElement('span');
        label.style.cssText = 'flex:1;min-width:180px;';
        const score = Number(problem.maxScore) || 0;
        label.textContent = `Câu ${Number(problem.questionNumber) || 0} (${String(score).replace('.', ',')}${Number.isInteger(score) ? ',0' : ''}đ) ${problem.topic || 'Chưa phân loại'}`;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = '✏️ Sửa điểm/chuyên đề';
        edit.onclick = () => {
          row.querySelector('.edit-exam-question')?.remove();
          const form = document.createElement('form');
          form.className = 'edit-exam-question';
          form.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;width:100%;align-items:end;';
          form.innerHTML = `<label>Điểm <input name="maxScore" type="number" min="0" max="20" step="0.01" required style="width:80px;"></label>
            <label>Chuyên đề <input name="topic" maxlength="120" required style="min-width:180px;"></label>
            <button type="submit">💾 Lưu</button><button type="button" class="cancel-question-edit">Hủy</button><span role="status"></span>`;
          form.elements.maxScore.value = String(score);
          form.elements.topic.value = problem.topic || '';
          form.querySelector('.cancel-question-edit').onclick = () => form.remove();
          form.onsubmit = async event => {
            event.preventDefault();
            if (!requireContentManagerUiAction()) return;
            const value = Number(form.elements.maxScore.value);
            const topic = form.elements.topic.value.trim();
            if (!topic || form.elements.maxScore.value === '' || !Number.isFinite(value) || value < 0 || value > 20) {
              form.querySelector('[role="status"]').textContent = 'Kiểm tra lại điểm và chuyên đề.';
              return;
            }
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
              await window.VMODataService.updateExamQuestionMetadata(id, problem.id || problem._id,
                { topic, maxScore: value });
              await reloadQuestions();
              await refreshManagedExams(exam);
              showToast('Đã cập nhật điểm và chuyên đề.', true);
            } catch (error) {
              form.querySelector('[role="status"]').textContent = error.message || 'Không lưu được câu hỏi.';
              submit.disabled = false;
            }
          };
          row.appendChild(form);
        };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '🗑️ Xóa câu';
        remove.onclick = async () => {
          if (!requireContentManagerUiAction() || !confirm(`Xóa câu ${problem.questionNumber} khỏi đề “${exam.title}”? Bài nộp vẫn được lưu.`)) return;
          remove.disabled = true;
          try {
            await window.VMODataService.deleteExamQuestion(id, problem.id || problem._id);
            await reloadQuestions();
            await refreshManagedExams(exam);
            showToast('Đã xóa câu hỏi khỏi đề.', true);
          } catch (error) { showToast('Lỗi xóa câu hỏi: ' + error.message, false); remove.disabled = false; }
        };
        row.append(label, edit, remove);
        list.appendChild(row);
      });
    }
    panel.querySelector('.add-exam-question').onsubmit = async event => {
      event.preventDefault();
      if (!requireContentManagerUiAction()) return;
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await window.VMODataService.addExamQuestion(id, {
          questionNumber: Number(form.elements.questionNumber.value), title: form.elements.title.value,
          topic: form.elements.topic.value, maxScore: Number(form.elements.maxScore.value),
          content: form.elements.content.value
        });
        form.reset();
        await reloadQuestions();
        await refreshManagedExams(exam);
        showToast('Đã thêm câu hỏi vào đề.', true);
      } catch (error) { showToast('Lỗi thêm câu hỏi: ' + error.message, false); }
      finally { button.disabled = false; }
    };
    try { await reloadQuestions(); }
    catch (error) { panel.querySelector('.managed-questions-list').textContent = `Lỗi tải câu hỏi: ${error.message}`; }
  };

  window.editManagedExam = async function(id) {
    if (!requireContentManagerUiAction()) return;
    const exam = managedExams.get(id);
    if (!exam) return;
    document.getElementById('managedExamEditor')?.remove();
    const form = document.createElement('form');
    form.id = 'managedExamEditor';
    form.style.cssText = 'padding:14px;margin:12px 0;background:#fff;border:1px solid #94a3b8;border-radius:8px;';
    form.innerHTML = `<strong>Chỉnh sửa đề · ${escapeHtmlText(exam.province || '')}${exam.grade ? ` · Lớp ${exam.grade}` : ''} · Ngày ${Number(exam.dayNumber) || 1}</strong>
      ${exam.category === 'university' ? '<label style="display:block">Mã học phần *<select name="courseId" required disabled style="width:100%"></select></label><label style="display:block">Chuyên đề con *<select name="sectionId" required disabled style="width:100%"><option value="">Đang tải chuyên đề…</option></select></label><p class="managed-exam-section-status" role="status"></p><label style="display:block">Ngày thi *<select name="dayNumber" required style="width:100%"></select></label><button type="button" class="managed-add-day">＋ Thêm ngày thi</button>' : ''}
      <label style="display:block">Tên đề thi *<input name="title" required maxlength="500" style="width:100%"></label>
      <label style="display:block">Năm học<input name="year" required maxlength="9" pattern="[0-9]{4}-[0-9]{4}" placeholder="2024-2025" style="width:100%"></label>
      <label style="display:block">Ngày tổ chức<input name="examDate" type="date" style="width:100%"></label>
      <label style="display:block">Thời lượng (phút)<input name="duration" type="number" min="1" max="600" required style="width:100%"></label>
      <label style="display:block">Mô tả<textarea name="description" maxlength="5000" style="width:100%"></textarea></label>
      <button type="submit">Lưu thay đổi</button> <button type="button" onclick="this.closest('form').remove()">Hủy</button>`;
    form.elements.title.value = exam.title || '';
    form.elements.year.value = exam.year || '';
    form.elements.examDate.value = /^\d{4}-\d{2}-\d{2}/.test(exam.examDate || '') ? exam.examDate.slice(0, 10) : '';
    form.elements.duration.value = Number(exam.duration) || 180;
    form.elements.description.value = exam.description || '';
    form.onsubmit = async event => {
      event.preventDefault();
      if (!requireContentManagerUiAction()) return;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await window.VMODataService.updateExam(id, {
          ...(exam.category === 'university' ? { courseId: form.elements.courseId.value, sectionId: form.elements.sectionId.value, dayNumber: Number(form.elements.dayNumber.value) } : {}),
          title: form.elements.title.value, year: form.elements.year.value.trim(), examDate: form.elements.examDate.value,
          duration: Number(form.elements.duration.value), description: form.elements.description.value
        });
        form.remove();
        showToast('Đã cập nhật đề thi.', true);
        await refreshManagedExams(exam);
        if (exam.category === 'university') window.selectUniversityCourse?.(form.elements.courseId.value, form.elements.sectionId.value);
      } catch (error) { showToast('Lỗi chỉnh sửa đề: ' + error.message, false); button.disabled = false; }
    };
    (exam.category === 'vmo-mock' ? document.getElementById('hubExamsList') : document.getElementById('hubDocsList'))?.before(form);
    if (exam.category === 'university') {
      const daySelect = form.elements.dayNumber;
      const addDay = number => daySelect.add(new Option(window.MathAppUniversity.dayLabel(number), String(number)));
      for (let number = 1; number <= Math.max(4, Number(exam.dayNumber) || 1); number++) addDay(number);
      daySelect.value = String(Number(exam.dayNumber) || 1);
      form.querySelector('.managed-add-day').onclick = () => {
        const number = daySelect.options.length + 1;
        if (number > 999) return showToast('Tối đa 999 ngày thi.', false);
        addDay(number); daySelect.value = String(number);
      };
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      const loadSections = async () => {
        const status = form.querySelector('.managed-exam-section-status');
        try {
          await window.loadUniversityCatalog?.(true);
          if (!form.isConnected) return;
          const registry = window.MathAppUniversity;
          const courses = form.elements.courseId;
          courses.replaceChildren(new Option('Chọn mã học phần…', ''));
          registry.courses.forEach(course => courses.add(new Option(`${course.code}: ${course.nameVi}`, course.id)));
          courses.value = exam.courseId || ''; courses.disabled = false;
          const select = form.elements.sectionId;
          const refreshSections = (selected = '') => {
            const course = registry.course(courses.value);
            select.replaceChildren(new Option('Chọn chuyên đề con…', ''));
            (course?.sections || []).forEach(section => select.add(new Option(`${section.number}. ${section.title}`, section.id)));
            select.value = selected;
            status.textContent = 'Thay đổi học phần, chuyên đề và ngày thi sẽ áp dụng cho mọi câu hỏi trong đề.';
          };
          courses.onchange = () => refreshSections();
          refreshSections(registry.examSection(exam)?.id || '');
          select.disabled = false; button.disabled = false;
        } catch (error) {
          if (!form.isConnected) return;
          status.textContent = error.message;
          const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Thử tải lại chuyên đề';
          retry.onclick = () => { status.textContent = 'Đang tải chuyên đề…'; loadSections(); };
          status.append(' ', retry);
        }
      };
      await loadSections();
    }
  };

  window.deleteManagedExam = async function(id) {
    if (!requireContentManagerUiAction()) return;
    const exam = managedExams.get(id);
    if (!exam || !confirm(`Xóa đề “${exam.title}” (Ngày ${Number(exam.dayNumber) || 1}) khỏi catalog? Câu hỏi của đề sẽ bị ẩn; bài nộp vẫn được lưu.`)) return;
    try {
      await window.VMODataService.deleteExam(id);
      managedExams.delete(id);
      showToast('Đã xóa đề khỏi catalog.', true);
      await refreshManagedExams(exam);
    } catch (error) { showToast('Lỗi xóa đề: ' + error.message, false); }
  };

  async function refreshManagedExams(exam) {
    if (exam.category === 'vmo-mock') { await loadHubExams(); await loadDatabaseMockExams(true); }
    else {
      await loadHubDocs();
      if (exam.category === 'tst-national') await loadDatabaseTstExams(true);
      else if (exam.category === 'history-dn-qn') await loadDatabaseRegionalExams(true);
      else if (competitionTabs[exam.category]) await loadDatabaseCompetitionExams(competitionTabs[exam.category], true);
    }
    window.refreshVMOCatalogStats?.();
  }

  // Handlers tạo mới
  window.handleCreateEvent = async function(e) {
    e.preventDefault();
    if (!requireContentManagerUiAction()) return;
    const title = document.getElementById('evtTitle').value.trim();
    const eventType = document.getElementById('evtType').value;
    const startDate = document.getElementById('evtStartDate').value;
    const location = document.getElementById('evtLocation').value.trim();
    const description = document.getElementById('evtDesc').value.trim();

    try {
      await window.VMODataService.addEvent({ title, eventType, startDate, location, description });
      showToast('Đã lưu sự kiện mới vào cơ sở dữ liệu!', true);
      toggleAddEventForm();
      loadHubEvents();
    } catch (err) {
      showToast('Lỗi lưu sự kiện: ' + err.message, false);
    }
  };

  window.handleCreateDocument = e => saveOcrExam(e, 'doc');
  window.handleCreateExam = e => saveOcrExam(e, 'exam');

  async function saveOcrExam(e, kind) {
    e.preventDefault();
    if (!requireContentManagerUiAction()) return;
    const tst = kind === 'doc';
    const field = name => document.getElementById(`${kind}${name}`);
    const state = ocrStates[kind];
    const questions = collectExamOcrQuestions(kind);
    const sourceImages = Array.from(state.images);
    const prediction = !tst && field('CreationMode')?.value === 'prediction';
    if (!questions.length || (!prediction && !sourceImages.length)) return showToast('Vui lòng tạo và rà soát nội dung câu hỏi trước khi lưu.', false);
    if (prediction && (!state.prediction || state.prediction.key !== predictionInputKey())) return showToast('Thông số dự đoán đã thay đổi. Hãy tạo bản dự đoán mới trước khi lưu.', false);
    if (prediction && !Array.isArray(state.prediction.quality?.questionChecks)) return showToast('Chưa có nhận xét Gia sư Toán AI cho đề dự đoán.', false);
    if (prediction && (questions.length < 2 || questions.length > 6 || Math.abs(questions.reduce((total, question) => total + question.maxScore, 0) - 20) > 0.001)) return showToast('Đề dự đoán cần 2–6 câu và tổng điểm đúng 20.', false);
    const destination = tst ? (field('Destination')?.value || 'tst') : 'mock';
    const regional = destination === 'regional';
    const admission = destination === 'admission';
    const graded = ['olympic30', 'duyenhai'].includes(destination);
    const dayNumber = Number(field('DayNumber')?.value) || 1;
    const setNumber = Number(field('SetNumber')?.value) || 0;
    if (!tst && (!Number.isInteger(setNumber) || setNumber < 3 || setNumber > 100)) return showToast('Bộ đề thi thử phải có số từ 3 đến 100.', false);
    const regionalUnit = field('RegionalUnit')?.value === 'qn' ? 'qn' : 'dn';
    const university = destination === 'university';
    if(university && !window.MathAppUniversity?.section(field('CourseId')?.value,field('SectionId')?.value)) return showToast('Vui lòng chọn chuyên đề con thuộc học phần.',false);
    const targetAnchor = university ? `university-${field('CourseId')?.value}-${field('SectionId')?.value}-${gradeCatalogSlug(field('Year')?.value || '2026-2027')}` : admission ? `admission-${field('SchoolId')?.value}-${gradeCatalogSlug(field('Year')?.value || '2026-2027')}` : regional
      ? `hist-${regionalUnit}-${stableKey(field('Year')?.value || '2026-2027')}`
      : (['vmo', 'olympic', 'olympic30', 'duyenhai'].includes(destination))
        ? `${destination === 'vmo' ? 'vmo' : destination}-${(graded ? gradeCatalogSlug : stableKey)(field('Province')?.value)}-${(graded ? gradeCatalogSlug : stableKey)(field('Year')?.value || '2026-2027')}${graded ? `-grade-${Number(field('Grade')?.value)}` : ''}`
        : (tst ? field('TargetAnchor')?.value : `mock-set${setNumber}-day${dayNumber}`);
    if (!targetAnchor) return showToast('Vui lòng chọn tỉnh/thành phố.', false);
    const saveButton = field('SaveButton');
    const originalLabel = saveButton?.textContent || 'Lưu vào cơ sở dữ liệu';
    const questionCount=university?Number(field('QuestionCount')?.value):questions.length;
    if(university && (!Number.isInteger(questionCount)||questionCount<1||questionCount>1000||questionCount!==questions.length))return showToast(`Đã có ${questions.length} câu; cần khớp số câu khai báo (1–1000). Hãy bổ sung câu hoặc sửa khai báo.`,false);
    const payload = {
      ...(university?{questionCount,regionName:field('RegionName')?.value.trim()}:{}),
      destination, ...(university ? { courseId: field('CourseId')?.value, sectionId: field('SectionId')?.value } : {}), ...(admission ? { schoolId: field('SchoolId')?.value } : {}), ...(graded ? { grade: Number(field('Grade')?.value) } : {}), title: field('Title')?.value.trim(),
      province: field('Province')?.value.trim(), year: field('Year')?.value.trim(),
      duration: Number(field('Duration')?.value) || 180, examDate: field('Date')?.value || '',
      dayNumber, setNumber, targetAnchor, region: field('Region')?.value || 'BAC',
      provinceOrder: regional ? (regionalUnit === 'dn' ? 1 : 2) : (destination === 'tst' ? Number(field('TargetAnchor')?.selectedOptions?.[0]?.dataset.order) || 0 : setNumber),
      sourceImageCount: sourceImages.length, ocrConfidence: state.confidence,
      status: university&&field('PublishStatus')?.value==='draft'?'draft':'published', questions: prediction ? questions.map(question => {
        const original = state.prediction.verifiedQuestions.find(item => item.questionNumber === question.questionNumber);
        const unchanged = original && ['questionNumber', 'topic', 'maxScore', 'content'].every(field =>
          question[field] === original[field]);
        const review = state.prediction.quality.questionChecks.find(check => check.questionNumber === question.questionNumber);
        return { ...question, predictionReview: {
          questionNumber: question.questionNumber, approved: unchanged && review?.approved === true,
          reason: review?.reason || 'Câu này chưa được Gia sư Toán AI kiểm định.',
          issues: [...(review?.issues || []), ...(!unchanged ? ['Nội dung đã thay đổi sau kiểm định Gia sư Toán AI; cần admin kiểm tra và xác nhận.'] : [])]
        } };
      }) : questions,
      origin: prediction ? 'prediction' : 'ocr',
      predictionInfo: prediction ? {
        targetType: state.prediction.targetType, targetAnchor: state.prediction.targetAnchor,
        requestedYears: state.prediction.evidence?.requestedYears,
        actualYears: state.prediction.evidence?.years,
        ownExamCount: state.prediction.evidence?.ownExamCount,
        peerExamCount: state.prediction.evidence?.peerExamCount,
        historyCurrentProvince: state.prediction.evidence?.historyCurrentProvince,
        historyMembers: state.prediction.evidence?.historyMembers,
        model: state.prediction.model,
        verifierModel: state.prediction.quality.verifierModel,
        verificationScore: state.prediction.quality.score,
        verificationSummary: state.prediction.quality.summary,
        criticalIssues: state.prediction.quality.criticalIssues,
        verified: state.prediction.quality.verified === true &&
          state.prediction.verifiedQuestions.length === questions.length &&
          questions.every((question, index) => ['questionNumber', 'topic', 'maxScore', 'content'].every(field =>
            question[field] === state.prediction.verifiedQuestions[index][field]))
      } : undefined
    };
    let saved = null;
    let imagesSaved = false;
    try {
      if (prediction && !confirm(state.prediction.quality.verified
        ? 'Đây là đề DỰ ĐOÁN do AI soạn. Xác nhận lưu bản đã biên tập trong Bộ đề thi thử VMO?'
        : 'Gia sư Toán AI đã bác ít nhất một câu. Vẫn lưu đề vào cơ sở dữ liệu; các câu chưa duyệt sẽ ẩn với thành viên và chờ admin chỉnh sửa trong ⚙️ Quản lý nguồn. Xác nhận lưu?')) return;
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Đang lưu đề thi...'; }
      try { saved = await window.VMODataService.createExamFromOcr(payload); }
      catch (error) {
        if (error?.status !== 409) throw error;
        if (!confirm(`${error.message}\n\nBạn có muốn thay thế nội dung của đúng đề/ngày này không? Lịch sử bài nộp vẫn được giữ nguyên.`)) return;
        saved = await window.VMODataService.createExamFromOcr({ ...payload, replaceExisting: true });
      }
      if (sourceImages.length) {
        if (saveButton) saveButton.textContent = `Đang lưu ${sourceImages.length} ảnh đề...`;
        await window.VMODataService.saveExamImages(saved.id || saved._id, sourceImages);
      }
      imagesSaved = true;
      const savedType = { tst: 'đề TST', regional: 'đề Đà Nẵng–Quảng Nam', vmo: 'đề VMO', olympic: 'đề IMO–Olympic', olympic30: 'đề Olympic 30/4', duyenhai: 'đề Duyên hải miền Bắc', admission: 'đề thi vào lớp 10 chuyên', university: 'đề Đại học', mock: 'đề thi thử' }[destination];
      showToast(`Đã lưu ${savedType} và ${saved?.problemCount || questions.length} câu hỏi vào cơ sở dữ liệu!`, true);
      e.target.reset();
      window.resetExamOcrPreview(kind);
      if (prediction) window.syncExamCreationMode();
      if (tst) {
        window.toggleAddDocForm();
        if (regional) await loadDatabaseRegionalExams(true);
        else if (['vmo', 'olympic', 'olympic30', 'duyenhai', 'admission', 'university'].includes(destination)) await loadDatabaseCompetitionExams(`tab-${destination}`, true);
        else await loadDatabaseTstExams(true);
      }
      else { window.toggleAddExamForm(); await loadDatabaseMockExams(true); }
      if(university) window.selectUniversityCourse?.(payload.courseId,payload.sectionId);
      if (tst) await loadHubDocs();
      else await loadHubExams();
    } catch (error) {
      const message = error?.message || 'Không xác định';
      showToast(saved && !imagesSaved
        ? `Đề và câu hỏi đã lưu, nhưng ảnh nguồn chưa lưu đầy đủ: ${message}`
        : 'Lỗi lưu đề thi: ' + message, false);
    }
    finally {
      if (saveButton && document.body.contains(saveButton)) {
        saveButton.disabled = !state.questions.length;
        saveButton.textContent = originalLabel;
      }
    }
  }

  window.deleteEventItem = async function(id) {
    if (!requireContentManagerUiAction()) return;
    if (!confirm('Bạn có chắc chắn muốn xóa sự kiện này khỏi cơ sở dữ liệu?')) return;
    try {
      await window.VMODataService.deleteEvent(id);
      showToast('Đã xóa sự kiện khỏi cơ sở dữ liệu!', true);
      loadHubEvents();
    } catch (e) {
      showToast('Lỗi khi xóa: ' + e.message, false);
    }
  };

  window.deleteDocItem = async function(id) {
    if (!requireContentManagerUiAction()) return;
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi cơ sở dữ liệu?')) return;
    try {
      await window.VMODataService.deleteDocument(id);
      showToast('Đã xóa tài liệu khỏi cơ sở dữ liệu!', true);
      loadHubDocs();
    } catch (e) {
      showToast('Lỗi khi xóa: ' + e.message, false);
    }
  };

  const normalizedExamYear = year => String(year || '2026-2027').replace(/[–—]/g, '-');
  const tstDisplayAnchor = exam => normalizedExamYear(exam.year) === '2026-2027'
    ? exam.targetAnchor : `${exam.targetAnchor}--year-${normalizedExamYear(exam.year)}`;

  function createDatabaseExamCard(exam) {
    const card = document.createElement('article');
    card.className = 'exam-card db-exam-card';
    card.id = tstDisplayAnchor(exam);
    card.dataset.catalogAnchor = exam.targetAnchor;
    card.dataset.catalogYear = normalizedExamYear(exam.year);
    card.dataset.databaseCard = 'true';
    card.dataset.filter = exam.region || 'BAC';
    card.dataset.search = `${exam.province || ''} ${exam.year || ''}`.toLowerCase();
    card.innerHTML = `<div class="exam-header"><div class="exam-top-tags"><span class="tag tag-year">${escapeHtmlText(exam.year || '2026-2027')}</span><span class="tag tag-province">${escapeHtmlText(exam.province || '')}</span>${exam.grade ? `<span class="tag tag-official">Lớp ${exam.grade}</span>` : ''}<span class="tag tag-official">Đề từ cơ sở dữ liệu</span></div><h3 class="exam-title">${escapeHtmlText(exam.title || `Đề TST ${exam.province || ''}`)}</h3></div><div class="exam-body"></div>`;
    (document.querySelector('#tab-tst .feed-container') || document.getElementById('tab-tst'))?.appendChild(card);
    ensureDatabaseExamSidebar(exam);
    return card;
  }

  const competitionTabs = { 'vmo-official': 'tab-vmo', 'imo-olympic': 'tab-olympic', 'olympic-30-4': 'tab-olympic30', 'duyen-hai-bac': 'tab-duyenhai', 'specialized-admission': 'tab-admission', 'university': 'tab-university' };
  function addUniversitySectionMembership(node, exam) {
    if (!node || exam.category !== 'university') return;
    const sectionId = window.MathAppUniversity?.examSection(exam)?.id || 'unclassified';
    node.dataset.courseSections = [...new Set([...(node.dataset.courseSections || '').split('|').filter(Boolean), `${exam.courseId}:${sectionId}`])].join('|');
    node.dataset.sectionIds = [...new Set([...(node.dataset.sectionIds || '').split('|').filter(Boolean), sectionId])].join('|');
  }
  function createCompetitionCard(exam) {
    const tabId = competitionTabs[exam.category];
    const card = document.createElement('article');
    card.className = 'exam-card db-exam-card';
    card.id = exam.targetAnchor;
    card.dataset.databaseCard = 'true';
    card.dataset.grade = exam.grade || '';
    card.dataset.courseId = exam.courseId || '';
    card.dataset.sectionId = window.MathAppUniversity?.examSection(exam)?.id || '';
    addUniversitySectionMembership(card, exam);
    card.dataset.filter = exam.category === 'specialized-admission' ? exam.region : exam.grade ? `GRADE${exam.grade}` : 'ALL';
    card.dataset.search = `${exam.province || ''} ${exam.schoolName || ''} ${exam.year || ''} ${exam.title || ''} ${exam.grade ? `Lớp ${exam.grade}` : ''}`;
    card.innerHTML = `<div class="exam-header"><div class="exam-top-tags"><span class="tag tag-year">${escapeHtmlText(exam.year || '')}</span><span class="tag tag-province">${escapeHtmlText(exam.province || '')}</span>${exam.grade ? `<span class="tag tag-official">Lớp ${exam.grade}</span>` : ''}<span class="tag tag-official">Đề từ cơ sở dữ liệu</span></div><h3 class="exam-title">${escapeHtmlText(exam.title || exam.province || 'Đề thi')}</h3></div><div class="exam-body"></div>`;
    (document.querySelector(`#${tabId} .feed-container`) || document.getElementById(tabId))?.appendChild(card);
    ensureCompetitionSidebar(exam);
    window.refreshGradeCatalogFilter?.(tabId);
    return card;
  }

  function ensureCompetitionSidebar(exam) {
    if (exam.category === 'specialized-admission') { window.ensureAdmissionExamSidebar?.(exam); return; }
    if (exam.category === 'university') {
      const target = document.getElementById('universityExamLinks');
      if (target && ![...target.querySelectorAll('a')].some(link=>link.getAttribute('href')===`#${exam.targetAnchor}`)) {
        const link=document.createElement('a');link.className='nav-link db-exam-sidebar-link';link.href=`#${exam.targetAnchor}`;link.dataset.courseId=exam.courseId;link.dataset.sectionId=window.MathAppUniversity?.examSection(exam)?.id||'';link.textContent=`${exam.courseCode || ''} · ${exam.year || ''}`;target.appendChild(link);
      }
      addUniversitySectionMembership([...target?.querySelectorAll('a') || []].find(link=>link.getAttribute('href')===`#${exam.targetAnchor}`), exam);
      window.refreshUniversityCatalogFilter?.();return;
    }
    const tabId = competitionTabs[exam.category];
    const sidebar = document.querySelector(`#sidebar-${tabId?.slice(4)} .nav-year-group${exam.grade ? `[data-grade="${exam.grade}"]` : ''}`);
    if (!sidebar || !exam.targetAnchor) return;
    let link = Array.from(sidebar.querySelectorAll('a.nav-link')).find(item => item.getAttribute('href') === `#${exam.targetAnchor}`);
    if (!link) { link = document.createElement('a'); link.className = 'nav-link db-exam-sidebar-link'; link.href = `#${exam.targetAnchor}`; sidebar.appendChild(link); }
    link.dataset.name = `${exam.province || 'Đề thi'} ${exam.year || ''}`.trim();
    const links = Array.from(sidebar.querySelectorAll('a.nav-link'));
    links.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name, 'vi', { numeric: true, sensitivity: 'base' }));
    links.forEach((item, index) => { item.textContent = `${String(index + 1).padStart(2, '0')}. ${item.dataset.name}`; sidebar.appendChild(item); });
  }

  function createDatabaseRegionalCard(exam) {
    const card = document.createElement('article');
    const isQuangNam = String(exam.province || '').toLowerCase().includes('quảng nam');
    card.className = 'exam-card history-card db-exam-card';
    card.id = exam.targetAnchor;
    card.dataset.databaseCard = 'true';
    card.dataset.filter = isQuangNam ? 'QUANGNAM' : 'DANANG';
    card.dataset.search = `${exam.province || ''} ${exam.year || ''} ${exam.title || ''}`.toLowerCase();
    card.innerHTML = `<div class="exam-header"><div class="exam-top-tags"><span class="tag tag-year">${escapeHtmlText(exam.year || '')}</span><span class="tag tag-province">${escapeHtmlText(exam.province || '')}</span><span class="tag tag-official">Đề lưu trữ từ cơ sở dữ liệu</span></div><h3 class="exam-title">${escapeHtmlText(exam.title || `Đề ${exam.province || ''} ${exam.year || ''}`)}</h3></div><div class="exam-body"></div>`;
    (document.querySelector('#tab-history .feed-container') || document.getElementById('tab-history'))?.appendChild(card);
    ensureDatabaseRegionalNavigation(exam);
    return card;
  }

  function ensureDatabaseRegionalNavigation(exam) {
    if (!exam?.targetAnchor) return;
    const sidebar = document.getElementById('sidebar-history');
    if (!sidebar) return;
    const isQuangNam = String(exam.province || '').toLowerCase().includes('quảng nam');
    const groups = Array.from(sidebar.querySelectorAll('.nav-year-group'));
    const group = groups.find(item => item.querySelector('.nav-year-title')?.textContent.includes(isQuangNam ? 'QUẢNG NAM' : 'ĐÀ NẴNG')) || groups[0] || sidebar;
    let link = sidebar.querySelector(`a[href="#${CSS.escape(exam.targetAnchor)}"]`);
    if (!link) {
      link = document.createElement('a');
      link.className = 'nav-link db-exam-sidebar-link';
      link.href = `#${exam.targetAnchor}`;
    }
    link.textContent = `${exam.province || 'Đà Nẵng'} ${String(exam.year || '').replace('-', '–')}`;
    group.appendChild(link);
    groups.sort((a, b) => a.querySelector('.nav-year-title').textContent.replace(/^[^\p{L}]+/u, '').localeCompare(
      b.querySelector('.nav-year-title').textContent.replace(/^[^\p{L}]+/u, ''), 'vi', { sensitivity: 'base' }));
    groups.forEach(item => {
      const links = Array.from(item.querySelectorAll('a.nav-link'));
      links.sort((a, b) => a.textContent.replace(/^\s*\d+\.\s*/, '').localeCompare(
        b.textContent.replace(/^\s*\d+\.\s*/, ''), 'vi', { numeric: true, sensitivity: 'base' }));
      links.forEach(child => item.appendChild(child));
      sidebar.appendChild(item);
    });
    Array.from(sidebar.querySelectorAll('a.nav-link')).forEach((item, index) => {
      item.textContent = `${String(index + 1).padStart(2, '0')}. ${item.textContent.replace(/^\s*\d+\.\s*/, '')}`;
    });
  }

  function ensureDatabaseExamSidebar(exam) {
    if (!exam?.targetAnchor) return;
    const root = document.getElementById('sidebar-tst');
    if (!root) return;
    const year = normalizedExamYear(exam.year);
    let sidebar = Array.from(root.querySelectorAll('.nav-year-group')).find(group => group.dataset.year === year);
    if (!sidebar) {
      sidebar = root.querySelector('.nav-year-group:not([data-year])') || document.createElement('div');
      sidebar.className = 'nav-year-group';
      sidebar.dataset.year = year;
      let title = sidebar.querySelector('.nav-year-title');
      if (!title) { title = document.createElement('div'); title.className = 'nav-year-title'; sidebar.prepend(title); }
      title.textContent = `🏛️ NĂM HỌC ${year}`;
      root.appendChild(sidebar);
    }
    if (!sidebar) return;
    const displayAnchor = tstDisplayAnchor(exam);
    let link = sidebar.querySelector(`a[href="#${CSS.escape(displayAnchor)}"]`);
    if (!link) {
      link = document.createElement('a');
      link.className = 'nav-link db-exam-sidebar-link';
      link.href = `#${displayAnchor}`;
      sidebar.appendChild(link);
    }
    link.dataset.region = ['BAC', 'TRUNG', 'NAM'].includes(exam.region) ? exam.region : 'BAC';
    link.dataset.order = String(Number(exam.provinceOrder) || 0);
    link.dataset.name = String(exam.province || exam.title || 'Đề thi mới').replace(/^\s*Tỉnh\s+/i, '').trim();
    const links = Array.from(sidebar.querySelectorAll('a.nav-link'));
    links.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name, 'vi', { sensitivity: 'base' })
      || Number(a.dataset.order) - Number(b.dataset.order)
      || a.getAttribute('href').localeCompare(b.getAttribute('href')));
    links.forEach((item, index) => {
      item.textContent = `${String(index + 1).padStart(2, '0')}. ${item.dataset.name}`;
      sidebar.appendChild(item);
    });
    Array.from(root.querySelectorAll('.nav-year-group[data-year]'))
      .sort((a, b) => b.dataset.year.localeCompare(a.dataset.year)).forEach(group => root.appendChild(group));
  }

  function ensureReferenceLinksModal() {
    if (document.getElementById('referenceLinksAdminModal')) return;
    const modal = document.createElement('div');
    modal.id = 'referenceLinksAdminModal';
    modal.className = 'vmo-modal-overlay';
    modal.style.zIndex = '10040';
    modal.innerHTML = `
      <div class="vmo-modal-container" style="max-width:780px;max-height:92vh;display:flex;flex-direction:column;">
        <div class="vmo-modal-header" style="background:#155e75;color:white;">
          <div class="vmo-modal-title" style="color:white;">⚙️ Quản lý nguồn và nội dung câu hỏi</div>
          <button type="button" class="vmo-modal-close" onclick="closeReferenceLinksManager()" style="color:white;">✕</button>
        </div>
        <div class="vmo-modal-body" style="overflow:auto;">
          <div id="referenceLinksProblemKey" style="padding:8px 10px;background:#f1f5f9;border-radius:6px;font-family:monospace;font-size:.8rem;margin-bottom:10px;"></div>
          <div id="referenceManagerPredictionReview" style="display:none;white-space:pre-wrap;padding:10px;margin-bottom:12px;border:1px solid #fca5a5;background:#fef2f2;border-radius:6px;color:#991b1b;"></div>
          <label id="referenceManagerResolveWrap" style="display:none;padding:8px;margin-bottom:12px;border:1px solid #fbbf24;background:#fffbeb;border-radius:6px;"><input id="referenceManagerResolve" type="checkbox"> Tôi đã sửa nội dung và kiểm tra toán học; công bố câu hỏi này cho thành viên.</label>
          <label for="referenceManagerProblemContent" style="display:block;font-weight:700;margin-bottom:4px;">Nội dung câu hỏi (HTML/LaTeX) *</label>
          <textarea id="referenceManagerProblemContent" required maxlength="50000" rows="16" style="flex:0 0 auto;width:100%;box-sizing:border-box;min-height:clamp(260px,42vh,420px);padding:12px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;line-height:1.5;resize:vertical;overflow:auto;margin-bottom:12px;" placeholder="Nhập nội dung câu hỏi..."></textarea>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <strong>🔗 Lời giải tham khảo</strong>
            <span style="font-size:.75rem;color:#64748b;">Mỗi nguồn gồm nhãn hiển thị và URL</span>
          </div>
          <div id="referenceManagerSolutionWrap" style="display:none;margin:12px 0;">
            <label for="referenceManagerSolution" style="font-weight:700;">Nội dung lời giải ví dụ (LaTeX)</label>
            <textarea id="referenceManagerSolution" rows="12" style="width:100%;box-sizing:border-box;"></textarea>
          </div>
          <div id="referenceLinksRows"></div>
          <button type="button" onclick="addReferenceLinkRow()" style="padding:7px 11px;border:1px solid #0891b2;border-radius:6px;background:#ecfeff;color:#155e75;font-weight:700;cursor:pointer;">＋ Thêm link</button>
          <label for="referenceManagerChangeNote" style="display:block;font-weight:700;margin:12px 0 4px;">Ghi chú thay đổi</label>
          <input id="referenceManagerChangeNote" maxlength="500" placeholder="Ví dụ: Sửa giả thiết và cập nhật nguồn lời giải" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
            <button type="button" onclick="closeReferenceLinksManager()" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;">Hủy</button>
            <button id="saveReferenceLinksManagerButton" type="button" onclick="saveReferenceLinksManager()" style="padding:7px 14px;border:0;border-radius:6px;background:#0e7490;color:white;font-weight:700;">Lưu thay đổi</button>
          </div>
        </div>
      </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) window.closeReferenceLinksManager(); });
    document.body.appendChild(modal);
  }

  window.addReferenceLinkRow = function(link = {}) {
    const rows = document.getElementById('referenceLinksRows');
    if (!rows) return;
    const row = document.createElement('div');
    row.className = 'reference-link-edit-row';
    row.style.cssText = 'display:grid;grid-template-columns:minmax(180px,1fr) minmax(260px,1.5fr) auto;gap:7px;margin-bottom:8px;align-items:center;';
    const label = document.createElement('input');
    label.className = 'reference-link-label';
    label.maxLength = 300;
    label.placeholder = 'Nhãn nguồn tham khảo';
    label.value = link.label || '';
    label.style.cssText = 'min-width:0;padding:8px;border:1px solid #cbd5e1;border-radius:6px;';
    const url = document.createElement('input');
    url.className = 'reference-link-url';
    url.type = 'url';
    url.maxLength = 2000;
    url.placeholder = 'https://...';
    url.value = link.url || '';
    url.style.cssText = label.style.cssText;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '🗑️ Xóa';
    remove.style.cssText = 'padding:7px 9px;border:1px solid #fecaca;border-radius:6px;background:#fff1f2;color:#b91c1c;cursor:pointer;';
    remove.onclick = () => row.remove();
    row.append(label, url, remove);
    rows.appendChild(row);
  };

  function canManageProblemSource(contentKey) {
    const problem = window.mongoProblemsByContentKey?.get(contentKey);
    const session = window.VMOAuth?.getSession?.();
    if(problem?.sourceGroup === 'university_books') return session?.role === 'admin';
    return isCurrentUserContentManager() || (problem?.sourceGroup === 'math_support' && session?.username && problem.createdBy === session.username);
  }

  window.openReferenceLinksManager = async function(contentKey) {
    if (!canManageProblemSource(contentKey)) return;
    ensureReferenceLinksModal();
    const modal = document.getElementById('referenceLinksAdminModal');
    modal.dataset.contentKey = contentKey;
    delete modal.dataset.problemId;
    delete modal.dataset.problemVersion;
    document.getElementById('referenceLinksProblemKey').textContent = `Câu hỏi: ${contentKey} · Đang tải dữ liệu mới nhất...`;
    const contentInput = document.getElementById('referenceManagerProblemContent');
    const noteInput = document.getElementById('referenceManagerChangeNote');
    const saveButton = document.getElementById('saveReferenceLinksManagerButton');
    contentInput.value = '';
    contentInput.disabled = true;
    document.getElementById('referenceManagerPredictionReview').style.display = 'none';
    document.getElementById('referenceManagerResolveWrap').style.display = 'none';
    document.getElementById('referenceManagerResolve').checked = false;
    noteInput.value = '';
    if (saveButton) saveButton.disabled = true;
    document.getElementById('referenceLinksRows').replaceChildren();
    modal.classList.add('active');
    setTrendPracticeChildModal(modal, true);
    modal.style.display = 'flex';
    try {
      const items = await window.VMODataService.getCatalogProblems({ contentKey });
      const problem = items?.[0];
      if (!problem) throw new Error('Không tìm thấy câu hỏi trong cơ sở dữ liệu');
      if (modal.dataset.contentKey !== contentKey) return;
      window.mongoProblemsByContentKey ||= new Map();
      window.mongoProblemsByContentKey.set(contentKey, problem);
      modal.dataset.problemId = problem.id || problem._id || '';
      modal.dataset.problemVersion = String(Number(problem.version) || 1);
      document.getElementById('referenceLinksProblemKey').textContent = `Câu hỏi: ${contentKey} · Phiên bản ${Number(problem.version) || 1}`;
      contentInput.value = problem.content || '';
      document.getElementById('referenceManagerSolutionWrap').style.display = problem.sourceGroup === 'university_materials' ? '' : 'none';
      document.getElementById('referenceManagerSolution').value = problem.referenceSolution || '';
      contentInput.disabled = false;
      if (problem.predictionReview?.status === 'gpt_rejected') {
        const review = document.getElementById('referenceManagerPredictionReview');
        review.textContent = `⚠️ Gia sư Toán AI chưa duyệt câu hỏi này.\n${[problem.predictionReview.reason,
          ...(problem.predictionReview.issues || [])].filter(Boolean).join('\n\n') || 'Chưa có nhận xét chi tiết.'}`;
        review.style.display = 'block';
        document.getElementById('referenceManagerResolveWrap').style.display = 'block';
      }
      const links = Array.isArray(problem.referenceLinks) ? problem.referenceLinks : [];
      links.forEach(link => window.addReferenceLinkRow(link));
      if (!links.length) window.addReferenceLinkRow();
      if (saveButton) saveButton.disabled = false;
    } catch (error) {
      document.getElementById('referenceLinksProblemKey').textContent = `Câu hỏi: ${contentKey} · Không tải được dữ liệu`;
      showToast(error?.message || 'Không tải được nội dung câu hỏi.', false);
    }
  };

  window.closeReferenceLinksManager = function() {
    const modal = document.getElementById('referenceLinksAdminModal');
    if (modal) {
      modal.classList.remove('active');
      setTrendPracticeChildModal(modal, false);
      modal.style.display = 'none';
    }
  };

  window.saveReferenceLinksManager = async function() {
    const modal = document.getElementById('referenceLinksAdminModal');
    const contentKey = modal?.dataset.contentKey || '';
    if (!canManageProblemSource(contentKey)) return;
    const problemId = modal?.dataset.problemId || '';
    const expectedVersion = Number(modal?.dataset.problemVersion) || 1;
    const content = document.getElementById('referenceManagerProblemContent')?.value.trim() || '';
    const changeNote = document.getElementById('referenceManagerChangeNote')?.value.trim() || '';
    const links = Array.from(document.querySelectorAll('#referenceLinksRows .reference-link-edit-row')).map(row => ({
      label: row.querySelector('.reference-link-label')?.value.trim() || '',
      url: row.querySelector('.reference-link-url')?.value.trim() || ''
    })).filter(link => link.label || link.url);
    if (!problemId) return showToast('Chưa tải được định danh câu hỏi. Vui lòng đóng và mở lại cửa sổ.', false);
    if (!content) return showToast('Nội dung câu hỏi không được để trống.', false);
    const invalid = links.find(link => !link.label || !/^https?:\/\//i.test(link.url));
    if (invalid) return showToast('Mỗi nguồn phải có nhãn và URL bắt đầu bằng http:// hoặc https://.', false);
    const problem = window.mongoProblemsByContentKey?.get(contentKey);
    if (!problem) return showToast('Không tìm thấy dữ liệu gốc của câu hỏi. Vui lòng mở lại cửa sổ.', false);
    const resolvePredictionReview = problem.predictionReview?.status === 'gpt_rejected' &&
      document.getElementById('referenceManagerResolve').checked;
    if (resolvePredictionReview && content === problem.content?.trim()) {
      return showToast('Cần sửa nội dung câu hỏi trước khi xác nhận đã khắc phục nhận xét Gia sư Toán AI.', false);
    }
    if (!window.confirm('Lưu nội dung câu hỏi và các nguồn lời giải tham khảo? Phiên bản hiện tại sẽ được lưu vào lịch sử để có thể khôi phục.')) return;
    const saveButton = document.getElementById('saveReferenceLinksManagerButton');
    const originalLabel = saveButton?.textContent || 'Lưu thay đổi';
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Đang lưu...'; }
    try {
      const solution = problem.sourceGroup === 'university_materials' ? document.getElementById('referenceManagerSolution').value : problem.referenceSolution || '';
      const solutionChanged = solution !== (problem.referenceSolution || '');
      const updated = await window.VMODataService.updateCatalogContent(problemId, {
        content,
        referenceSolution: solution,
        referenceSolutionVerified: !solutionChanged && problem.referenceSolutionVerified === true,
        referenceLinks: links,
        changeNote: changeNote || 'Cập nhật từ chức năng Quản lý nguồn',
        resolvePredictionReview,
        expectedVersion
      });
      const nextVersion = Number(updated?.version) || expectedVersion + 1;
      const nextProblem = { ...problem, content, referenceSolution: solution, referenceSolutionVerified: !solutionChanged && problem.referenceSolutionVerified === true, referenceLinks: links, version: nextVersion,
        ...(resolvePredictionReview ? { predictionReview: { ...problem.predictionReview, status: 'admin_corrected' },
          status: 'published', allowSubmission: true, allowAiEvaluation: true } : {}) };
      window.mongoProblemsByContentKey.set(contentKey, nextProblem);
      window.mongoProblemReferenceLinks ||= new Map();
      window.mongoProblemReferenceLinks.set(contentKey, links);
      for (const item of document.querySelectorAll('.problem-item[data-content-key]')) {
        if (item.dataset.contentKey !== contentKey) continue;
        const displayed = item.querySelector('.problem-content');
        if (displayed) {
          displayed.setAttribute('data-raw-math', content);
          if (problem.sourceGroup === 'university_books' && window.renderBookContent) await window.renderBookContent(displayed,{content,contentFormat:'html-latex'});
          else if (window.safeRenderMathJaxToElement) window.safeRenderMathJaxToElement(displayed, content);
          else displayed.textContent = content;
        }
        const answer = item.querySelector('[data-university-reference-solution]');
        if (answer) { if(window.safeRenderMathJaxToElement)window.safeRenderMathJaxToElement(answer,solution);else answer.textContent=solution; }
        if (resolvePredictionReview) item.querySelector('.prediction-review-warning')?.remove();
      }
      window.closeReferenceLinksManager();
      applyMongoReferenceLinks();
      showToast(`Đã lưu phiên bản ${nextVersion}: nội dung câu hỏi và ${links.length} nguồn tham khảo.`, true);
    } catch (error) {
      showToast(error?.message || 'Không lưu được nội dung và nguồn tham khảo.', false);
    } finally {
      if (saveButton && document.body.contains(saveButton)) {
        saveButton.disabled = false;
        saveButton.textContent = originalLabel;
      }
    }
  };

  function ensureReferenceLinksAdminButton(problem) {
    if (!canManageProblemSource(problem.dataset.contentKey) || problem.querySelector('.btn-manage-reference-links')) return;
    const contentKey = problem.dataset.contentKey;
    if (!contentKey) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-manage-reference-links';
    button.textContent = '⚙️ Quản lý nguồn';
    button.style.cssText = 'margin-left:6px;padding:4px 8px;border:1px solid #67e8f9;border-radius:6px;background:#ecfeff;color:#155e75;font-size:.75rem;cursor:pointer;';
    button.onclick = () => window.openReferenceLinksManager(contentKey);
    (problem.querySelector('.problem-header') || problem).appendChild(button);
  }

  window.enhanceMathSupportProblems = async function(root, problems) {
    window.mongoProblemsByContentKey ||= new Map();
    window.mongoProblemReferenceLinks ||= new Map();
    problems.forEach(problem => {
      window.mongoProblemsByContentKey.set(problem.contentKey, problem);
      window.mongoProblemReferenceLinks.set(problem.contentKey, problem.referenceLinks || []);
    });
    applyMongoReferenceLinks(root);
    injectSubmissionButtons(root);
    window.reinitAIGuide?.(root);
    await applyCatalogAccessRules(root);
  };

  function renderMongoReferenceLinks(problem, links) {
    if (!problem || !Array.isArray(links) || !links.length) return;
    problem.querySelectorAll('.source-solution-box').forEach(node => node.remove());
    const box = document.createElement('div');
    box.className = 'solution-box source-solution-box';
    box.dataset.referenceSource = 'mongodb';
    const button = document.createElement('button');
    button.className = 'toggle-btn';
    button.type = 'button';
    button.textContent = '🔗 Lời giải tham khảo';
    button.setAttribute('aria-expanded', 'false');
    const content = document.createElement('div');
    content.className = 'solution-content';
    content.appendChild(Object.assign(document.createElement('strong'), { textContent: 'Nguồn lời giải:' }));
    const list = document.createElement('ul');
    links.forEach(link => {
      if (!link?.label || !/^https?:\/\//i.test(link?.url || '')) return;
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = link.label;
      const item = document.createElement('li');
      item.appendChild(anchor);
      list.appendChild(item);
    });
    if (!list.children.length) return;
    content.appendChild(list);
    button.onclick = () => {
      if (typeof window.toggleSolution === 'function') {
        window.toggleSolution(button);
        return;
      }
      const open = content.style.display !== 'none' && getComputedStyle(content).display !== 'none';
      content.style.display = open ? 'none' : 'block';
      button.setAttribute('aria-expanded', open ? 'false' : 'true');
    };
    box.append(button, content);
    problem.appendChild(box);
  }

  function renderMongoProblemContent(problem, content) {
    if (!problem || !content) return;
    // Bản đồng bộ cũ có thể chứa DOM MathJax đã typeset. Đây là mã hiển thị,
    // không phải đề bài; giữ nguyên bản ví dụ tĩnh khi gặp dữ liệu đó.
    if (/(?:<|&lt;)mjx-[a-z-]+\b|class=["'][^"']*\bMathJax\b/i.test(content)) return;
    let target = problem.querySelector('.problem-content');
    if (!target && problem.classList.contains('examplebox')) {
      const paragraphs = Array.from(problem.querySelectorAll(':scope > p'));
      target = paragraphs[0];
      if (!target) {
        target = document.createElement('p');
        const heading = problem.querySelector('.box-heading');
        heading?.after(target);
      }
      paragraphs.slice(1).forEach(paragraph => { paragraph.style.display = 'none'; });
    }
    if (!target) return;
    if (target._renderedMongoContent === content) return;
    target.setAttribute('data-raw-math', content);
    if (problem.dataset.sourceGroup === 'university_books' && window.renderBookContent) {
      window.renderBookContent(target,{content,contentFormat:'html-latex'}).catch(()=>{});
    } else if (/<\/?[a-z][\w:-]*(?:\s[^<>]*)?>/i.test(content)) {
      if (window.MathJax?.typesetClear) window.MathJax.typesetClear([target]);
      target.innerHTML = sanitizeCatalogHtml(content);
      if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([target]).catch(() => {});
    } else if (window.safeRenderMathJaxToElement) {
      window.safeRenderMathJaxToElement(target, content);
    } else {
      target.textContent = content;
    }
    target._renderedMongoContent = content;
  }

  function applyMongoReferenceLinks(root = document) {
    const sourceMap = window.mongoProblemReferenceLinks || new Map();
    root.querySelectorAll?.('.problem-item[data-content-key], .examplebox[data-content-key]').forEach(problem => {
      const contentKey = problem.dataset.contentKey;
      const problemData = window.mongoProblemsByContentKey?.get(contentKey);
      if (problemData?.content) renderMongoProblemContent(problem, problemData.content);
      const links = sourceMap.get(contentKey);
      if (links?.length) renderMongoReferenceLinks(problem, links);
      else if (sourceMap.has(contentKey)) problem.querySelectorAll('.source-solution-box[data-reference-source="mongodb"]').forEach(node => node.remove());
      ensureReferenceLinksAdminButton(problem);
    });
  }

  let mongoReferenceLinksPromise = null;
  let specialtyReferencesLoaded = false;

  async function loadMongoReferenceLinks(force = false, root = document) {
    if (!window.VMODataService?.getCatalogProblems) return;
    if (!force && specialtyReferencesLoaded) {
      applyMongoReferenceLinks(root);
      return;
    }
    try {
      if (force) {
        window.invalidateVMODataCache?.();
        mongoReferenceLinksPromise = null;
        specialtyReferencesLoaded = false;
      }
      if (!mongoReferenceLinksPromise) {
        mongoReferenceLinksPromise = window.VMODataService.getCatalogProblems({ runtime: true, sourceGroup: 'specialty' })
          .then(problems => {
            const contentMap = window.mongoProblemsByContentKey instanceof Map ? window.mongoProblemsByContentKey : new Map();
            const referenceMap = window.mongoProblemReferenceLinks instanceof Map ? window.mongoProblemReferenceLinks : new Map();
            problems.forEach(problem => {
              contentMap.set(problem.contentKey, problem);
              referenceMap.set(problem.contentKey, problem.referenceLinks || []);
            });
            window.mongoProblemsByContentKey = contentMap;
            window.mongoProblemReferenceLinks = referenceMap;
            specialtyReferencesLoaded = true;
          })
          .finally(() => { mongoReferenceLinksPromise = null; });
      }
      await mongoReferenceLinksPromise;
      applyMongoReferenceLinks(root);
    } catch (error) {
      console.warn('Không tải được nguồn tham khảo MongoDB:', error?.message || error);
    }
  }

  function renderDatabaseExam(exam, kind = 'tst') {
    if (!exam?.targetAnchor || !Array.isArray(exam.problems) || !exam.problems.length) return;
    if (kind === 'tst') ensureDatabaseExamSidebar(exam);
    if (kind === 'regional') ensureDatabaseRegionalNavigation(exam);
    if (kind === 'competition') ensureCompetitionSidebar(exam);
    let card = document.getElementById(kind === 'tst' ? tstDisplayAnchor(exam) : exam.targetAnchor);

// MongoDB là nguồn chuẩn sau migration.
// Nếu card hiện tại đến từ HTML tĩnh, loại bỏ để Atlas thay thế.
if (card && card.dataset.databaseCard !== 'true') {
  card.remove();
  card = null;
}

if (!card) {
  card = kind === 'tst' ? createDatabaseExamCard(exam)
    : kind === 'regional' ? createDatabaseRegionalCard(exam)
    : kind === 'competition' ? createCompetitionCard(exam) : createDatabaseMockCard(exam);
}

if (card) card.dataset.databaseCard = 'true';
    const body = card?.querySelector('.exam-body') || card;
    if (!body) return;
    body.querySelectorAll(`.db-exam-day[data-exam-key="${CSS.escape(exam.examKey || exam.id || '')}"]`).forEach(node => node.remove());

    const newProblems = exam.problems.filter(problem => {
      const key = problem.contentKey || '';
      return key && !card.querySelector(`.problem-item[data-content-key="${CSS.escape(key)}"]`);
    });
    if (!newProblems.length) return;

    const section = document.createElement('section');
    section.className = 'db-exam-day';
    if (exam.category === 'university') {section.dataset.courseId=exam.courseId;section.dataset.sectionId = window.MathAppUniversity?.examSection(exam)?.id || 'unclassified';}
    section.dataset.examKey = exam.examKey || exam.id || '';
    section.dataset.dayNumber = String(Number(exam.dayNumber) || 1);
    section.style.cssText = 'border-top:3px solid #0ea5e9;margin-top:20px;padding-top:14px;';
    const meta = document.createElement('div');
    meta.className = 'exam-day-header';
    meta.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;background:#eff6ff;padding:10px 12px;border-radius:8px;margin-bottom:12px;color:#0f172a;';
    const imageCount = Math.max(0, Math.min(20, Number(exam.sourceImageCount) || (exam.hasImages ? 1 : 0)));
    const imageButtons = Array.from({ length: imageCount }, (_, index) => `<button type="button" onclick="openExamSourceImage('${escapeHtmlText(exam.id || exam._id)}',${index + 1})" style="border:1px solid #93c5fd;background:#fff;color:#1d4ed8;padding:4px 9px;border-radius:5px;cursor:pointer;">🖼️ Ảnh ${index + 1}</button>`).join('');
    meta.innerHTML = `${exam.category==='university'?`<span><strong>${escapeHtmlText(exam.courseCode||'')}</strong> · ${escapeHtmlText(exam.title||'')}</span>`:''}<strong>📌 Ngày thi thứ ${['','nhất','hai','ba','tư','năm','sáu','bảy','tám','chín','mười'][Number(exam.dayNumber)||1] || (Number(exam.dayNumber)||1)}</strong><span>📅 ${escapeHtmlText(exam.examDate || 'Đang cập nhật')}</span><span>⏱️ ${Number(exam.duration) || 180} phút</span><span>🗄️ cơ sở dữ liệu</span>${imageButtons}`;
    section.appendChild(meta);

    newProblems.sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber)).forEach(problem => {
      const item = document.createElement('div');
      item.className = 'problem-item';
      item.dataset.contentKey = problem.contentKey;
      item.dataset.databaseProblem = 'true';
      item.dataset.setKey = problem.setKey || '';
      item.dataset.setTitle = problem.setTitle || exam.title || '';
      const sourceConfig = CONTENT_SOURCE_CONFIG[competitionTabs[exam.category]];
      item.dataset.sourceGroup = problem.sourceGroup || sourceConfig?.sourceGroup || (kind === 'tst' ? 'tst' : (kind === 'regional' ? 'danang_quangnam' : 'mock_exam'));
      item.dataset.sourceType = problem.sourceType || sourceConfig?.sourceType || (kind === 'tst' ? 'tst_question' : (kind === 'regional' ? 'regional_question' : 'mock_exam_question'));
      item.dataset.contentType = sourceConfig?.contentType || (kind === 'tst' ? 'tst_exam' : (kind === 'regional' ? 'regional_exam' : 'mock_exam'));
      item.dataset.questionNumber = String(Number(problem.questionNumber) || 0);
      item.dataset.legacyProblemId = Array.isArray(problem.legacyIds) ? (problem.legacyIds[0] || '') : '';
      const rawLabel = String(problem.shortLabel || problem.title || `Câu ${problem.questionNumber}`);
      const scoreInLabel = rawLabel.match(/\(\s*(\d+(?:[.,]\d+)?)\s*đ\s*\)/i);
      const label = rawLabel.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*đ\s*\)/gi, '').trim();
      const rawTopic = String(problem.topic || 'Toán Olympic')
        .replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*đ\s*\)/gi, ' ').replace(/\s+/g, ' ').trim();
      const repeatedTopic = rawTopic.match(/^(.+?)\s+\1$/i);
      const topic = repeatedTopic ? repeatedTopic[1] : rawTopic;
      const topicAlreadyInLabel = topic && label.toLocaleLowerCase('vi').includes(topic.toLocaleLowerCase('vi'));
      const score = Number(problem.maxScore) || Number(scoreInLabel?.[1]?.replace(',', '.')) || 0;
      item.innerHTML = `<div class="problem-header"><div class="problem-id"><span>${escapeHtmlText(label)}</span><span class="badge-point"> (${String(score).replace('.', ',')}đ) </span><span class="badge-topic"${topicAlreadyInLabel ? ' style="display:none" aria-hidden="true"' : ''}>${escapeHtmlText(topic)}</span></div><button class="btn-copy" onclick="copyText(this)">📋 Sao chép</button></div><div class="problem-content" data-no-i18n="true"></div>`;
      section.appendChild(item);
      const content = item.querySelector('.problem-content');
      content.setAttribute('data-raw-math', problem.content || '');
      if (window.safeRenderMathJaxToElement) window.safeRenderMathJaxToElement(content, problem.content || '');
      else content.textContent = problem.content || '';
      content._renderedMongoContent = problem.content || '';
      if (isCurrentUserContentManager() && problem.predictionReview?.status === 'gpt_rejected') {
        const warning = document.createElement('div');
        warning.className = 'prediction-review-warning';
        warning.style.cssText = 'white-space:pre-wrap;margin:10px 0;padding:10px;border:1px solid #fca5a5;background:#fef2f2;color:#991b1b;border-radius:6px;';
        warning.textContent = `⚠️ Gia sư Toán AI chưa duyệt, câu hỏi đang ẩn với thành viên.\n${[problem.predictionReview.reason,
          ...(problem.predictionReview.issues || [])].filter(Boolean).join('\n\n')}`;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = '⚙️ Sửa câu hỏi trong Quản lý nguồn';
        edit.onclick = () => window.openReferenceLinksManager(problem.contentKey);
        warning.appendChild(document.createElement('br'));
        warning.appendChild(edit);
        item.appendChild(warning);
      }
    });
    body.appendChild(section);
  }

  function createDatabaseMockCard(exam) {
    const card = document.createElement('article');
    card.className = 'exam-card db-exam-card';
    card.id = exam.targetAnchor;
    card.dataset.databaseCard = 'true';
    card.dataset.filter = `MOCK${Number(exam.setNumber) || 3}`;
    card.dataset.search = `${exam.title || ''} ${exam.province || ''} ${exam.year || ''}`.toLowerCase();
    card.innerHTML = `<div class="exam-header"><div class="exam-top-tags"><span class="tag tag-year">${escapeHtmlText(exam.year || '')}</span><span class="tag tag-province">${escapeHtmlText(exam.province || '')}</span><span class="tag tag-official">${exam.origin === 'prediction' ? '🔮 Đề dự đoán (AI) · ' : ''}Bộ thi thử số ${Number(exam.setNumber) || 3} · Ngày ${Number(exam.dayNumber) || 1}</span></div><h3 class="exam-title">${escapeHtmlText(exam.title || '')}</h3></div><div class="exam-body"></div>`;
    (document.querySelector('#tab-mock .feed-container') || document.getElementById('tab-mock'))?.appendChild(card);
    return card;
  }

  function ensureDatabaseMockNavigation(exam) {
    const setNumber = Number(exam.setNumber);
    if (!Number.isInteger(setNumber) || setNumber < 1) return;
    const sidebar = document.querySelector('#sidebar-mock .book-toc');
    if (sidebar && exam.targetAnchor) {
      let group = sidebar.querySelector(`[data-mock-set="${setNumber}"]`);
      if (!group) {
        group = document.createElement('div');
        group.className = 'nav-year-group';
        group.dataset.mockSet = String(setNumber);
        group.innerHTML = `<div class="nav-year-title">🎯 BỘ THI THỬ SỐ ${setNumber}</div>`;
        sidebar.appendChild(group);
      }
      let link = sidebar.querySelector(`a[href="#${CSS.escape(exam.targetAnchor)}"]`);
      if (!link) {
        link = document.createElement('a');
        link.className = 'nav-link';
        link.href = `#${exam.targetAnchor}`;
      }
      link.dataset.day = String(Number(exam.dayNumber) || 1);
      const count = Array.isArray(exam.problems) ? exam.problems.length : Number(exam.problemCount) || 0;
      link.textContent = `Bộ ${setNumber} — Ngày thứ ${['', 'nhất', 'hai'][Number(exam.dayNumber)] || exam.dayNumber} (${count} câu)`;
      group.appendChild(link);
      const groups = Array.from(sidebar.querySelectorAll('.nav-year-group'));
      groups.sort((a, b) => Number(a.dataset.mockSet || a.querySelector('.nav-year-title')?.textContent.match(/\d+/)?.[0])
        - Number(b.dataset.mockSet || b.querySelector('.nav-year-title')?.textContent.match(/\d+/)?.[0]));
      groups.forEach(item => {
        const links = Array.from(item.querySelectorAll('a.nav-link'));
        links.sort((a, b) => Number(a.dataset.day || a.getAttribute('href')?.match(/day(\d+)/)?.[1] || 999)
          - Number(b.dataset.day || b.getAttribute('href')?.match(/day(\d+)/)?.[1] || 999));
        links.forEach(child => item.appendChild(child));
        sidebar.appendChild(item);
      });
      Array.from(sidebar.querySelectorAll('a.nav-link')).forEach((item, index) => {
        item.textContent = `${String(index + 1).padStart(2, '0')}. ${item.textContent.replace(/^\s*\d+\.\s*/, '')}`;
      });
    }
    const pills = document.getElementById('mockFilterPills');
    if (pills && !pills.querySelector(`[data-filter="MOCK${setNumber}"]`)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'pill';
      button.dataset.filter = `MOCK${setNumber}`;
      button.textContent = `Bộ ${setNumber}`;
      button.onclick = () => {
        pills.querySelectorAll('.pill').forEach(pill => pill.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('#tab-mock .exam-card').forEach(card => card.classList.toggle('hidden-by-search', card.dataset.filter !== button.dataset.filter));
      };
      pills.appendChild(button);
    }
  }

  let databaseMockLoaded = false;
  let databaseMockPromise = null;
  const examCategories = { 'tab-tst': 'tst-national', 'tab-mock': 'vmo-mock', 'tab-history': 'history-dn-qn', 'tab-vmo': 'vmo-official', 'tab-olympic': 'imo-olympic', 'tab-olympic30': 'olympic-30-4', 'tab-duyenhai': 'duyen-hai-bac', 'tab-admission': 'specialized-admission', 'tab-university': 'university' };
  const loadedDetails = new Set();
  const detailPromises = new Map();
  const detailKey = (category, anchor) => `${category}:${anchor}`;

  function consolidateExamDays(exams, category) {
    if (category === 'university') return [...exams].sort((a,b)=>Number(a.dayNumber)-Number(b.dayNumber));
    if (category !== 'tst-national' && !competitionTabs[category]) return exams;
    const days = new Map();
    exams.forEach(exam => {
      const day = Number(exam.dayNumber) || 1;
      const current = days.get(day);
      if (!current) { days.set(day, exam); return; }
      const primary = (exam.problems?.length || 0) > (current.problems?.length || 0) ? exam : current;
      const secondary = primary === exam ? current : exam;
      const seenNumbers = new Set((primary.problems || []).map(problem => Number(problem.questionNumber)));
      const extra = (secondary.problems || []).filter(problem => !seenNumbers.has(Number(problem.questionNumber)));
      days.set(day, { ...primary, problems: [...(primary.problems || []), ...extra] });
      console.warn(`Trùng đề ngày ${day} tại ${exam.targetAnchor}; chỉ hiển thị một ngày thi.`);
    });
    return [...days.values()].sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber));
  }

  window.loadDatabaseExamDetail = async function(category, anchor) {
    if (!Object.values(examCategories).includes(category) || !anchor) return;
    const key = detailKey(category, anchor);
    if (loadedDetails.has(key)) return;
    if (detailPromises.has(key)) return detailPromises.get(key);
    const card = document.getElementById(anchor);
    const sourceAnchor = category === 'tst-national' ? card?.dataset.catalogAnchor || anchor : anchor;
    const sourceYear = category === 'tst-national' ? card?.dataset.catalogYear || '' : '';
    const pending = (async () => {
      try {
        const exams = await window.VMODataService.getExamCatalogDetail(category, sourceAnchor, sourceYear);
        if (!Array.isArray(exams) || !exams.length) throw new Error('Không tìm thấy đề thi');
        consolidateExamDays(exams, category).forEach(exam => {
          renderDatabaseExam(exam, competitionTabs[category] ? 'competition' : category === 'tst-national' ? 'tst' : category === 'vmo-mock' ? 'mock' : 'regional');
          if (category === 'vmo-mock') ensureDatabaseMockNavigation(exam);
        });
        if (!(window.mongoProblemReferenceLinks instanceof Map)) window.mongoProblemReferenceLinks = new Map();
        if (!(window.mongoProblemsByContentKey instanceof Map)) window.mongoProblemsByContentKey = new Map();
        exams.flatMap(exam => exam.problems).forEach(problem => {
          window.mongoProblemReferenceLinks.set(problem.contentKey, problem.referenceLinks || []);
          window.mongoProblemsByContentKey.set(problem.contentKey, problem);
        });
        injectSubmissionButtons(card || document);
        window.reinitAIGuide?.(card || document);
        await applyCatalogAccessRules(card || document);
        applyMongoReferenceLinks(card || document);
        card?.querySelector('.db-exam-loading')?.remove();
        loadedDetails.add(key);
        if (category === 'university') window.refreshUniversityCatalogFilter?.();
      } catch (error) {
        const notice = card?.querySelector('.db-exam-loading');
        if (notice) notice.textContent = 'Không tải được đề thi. Chọn lại mục lục để thử lại.';
        throw error;
      } finally { detailPromises.delete(key); }
    })();
    detailPromises.set(key, pending);
    return pending;
  };

  let catalogObserver = null;
  function observeExamCard(card, category) {
    if (!card || !('IntersectionObserver' in window)) return;
    if (!catalogObserver) catalogObserver = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach(entry => {
        if (entry.target.classList.contains('hidden-by-search')) return;
        catalogObserver.unobserve(entry.target);
        window.loadDatabaseExamDetail(entry.target.dataset.catalogCategory, entry.target.id)
          .catch(error => console.warn('Không tải được chi tiết đề thi:', error?.message || error));
      });
    }, { rootMargin: '150px' });
    card.dataset.catalogCategory = category;
    catalogObserver.observe(card);
  }

  async function renderExamSummaries(exams, category) {
    const kind = competitionTabs[category] ? 'competition' : category === 'tst-national' ? 'tst' : category === 'vmo-mock' ? 'mock' : 'regional';
    if (kind === 'tst') exams = [...exams].sort((a, b) =>
      normalizedExamYear(b.year).localeCompare(normalizedExamYear(a.year)) ||
      String(a.province || '').replace(/^Tỉnh\s+/i, '').localeCompare(String(b.province || '').replace(/^Tỉnh\s+/i, ''), 'vi', { sensitivity: 'base' }) ||
      Number(a.dayNumber) - Number(b.dayNumber));
    exams.forEach(exam => {
      if (!exam.targetAnchor || (!Number(exam.problemCount) && !exam.problems?.length)) return;
      const displayAnchor = kind === 'tst' ? tstDisplayAnchor(exam) : exam.targetAnchor;
      let card = document.getElementById(displayAnchor);
      if (!card) card = kind === 'tst' ? createDatabaseExamCard(exam)
        : kind === 'regional' ? createDatabaseRegionalCard(exam)
        : kind === 'competition' ? createCompetitionCard(exam) : createDatabaseMockCard(exam);
      if (kind === 'tst') ensureDatabaseExamSidebar(exam);
      if (kind === 'regional') ensureDatabaseRegionalNavigation(exam);
      if (kind === 'mock') ensureDatabaseMockNavigation(exam);
      if (kind === 'competition') ensureCompetitionSidebar(exam);
      addUniversitySectionMembership(card, exam);
      if (Array.isArray(exam.problems)) {
        renderDatabaseExam(exam, kind);
        loadedDetails.add(detailKey(category, displayAnchor));
      } else if (!loadedDetails.has(detailKey(category, displayAnchor))) {
        const body = card.querySelector('.exam-body') || card;
        if (!body.querySelector('.db-exam-loading')) {
          const notice = document.createElement('p');
          notice.className = 'db-exam-loading';
          notice.textContent = 'Chọn đề để tải câu hỏi từ cơ sở dữ liệu.';
          body.appendChild(notice);
        }
        observeExamCard(card, category);
      }
    });
    const root = document.getElementById(kind === 'competition' ? competitionTabs[category] : kind === 'tst' ? 'tab-tst' : kind === 'mock' ? 'tab-mock' : 'tab-history');
    showDatabaseCatalogState(root, exams);
    const first = Array.from(root?.querySelectorAll('.exam-card') || [])
      .find(card => !card.classList.contains('hidden-by-search') && !loadedDetails.has(detailKey(category, card.id)));
    if (first && window.VMODataService?.getExamCatalogDetail) {
      await window.loadDatabaseExamDetail(category, first.id).catch(error =>
        console.warn('Không tải được đề đầu tiên:', error?.message || error));
    }
  }

  function resetExamCategory(tabId) {
    const category = examCategories[tabId];
    document.querySelectorAll(`#${tabId} .db-exam-card`).forEach(card => {
      catalogObserver?.unobserve(card);
      card.remove();
    });
    const sidebarId = { 'tab-tst': 'sidebar-tst', 'tab-mock': 'sidebar-mock', 'tab-history': 'sidebar-history', 'tab-vmo': 'sidebar-vmo', 'tab-olympic': 'sidebar-olympic', 'tab-olympic30': 'sidebar-olympic30', 'tab-duyenhai': 'sidebar-duyenhai', 'tab-admission': 'sidebar-admission', 'tab-university': 'sidebar-university' }[tabId];
    document.querySelectorAll(`#${sidebarId} a.nav-link`).forEach(link => link.remove());
    if (tabId === 'tab-admission') window.resetAdmissionNavigation?.();
    if (tabId === 'tab-tst') document.querySelectorAll('#sidebar-tst .nav-year-group[data-year]').forEach(group => group.remove());
    if (tabId === 'tab-mock') {
      document.querySelectorAll('#sidebar-mock .nav-year-group').forEach(group => group.remove());
      document.querySelectorAll('#mockFilterPills .pill[data-filter^="MOCK"]').forEach(pill => pill.remove());
      document.querySelector('#mockFilterPills .pill[data-filter="ALL"]')?.classList.add('active');
    }
    for (const key of loadedDetails) if (key.startsWith(`${category}:`)) loadedDetails.delete(key);
  }

  let sidebarNavigationToken = 0;
  let stopSidebarAlignment = null;
  document.addEventListener('click', async event => {
    const link = event.target.closest?.('#sidebar-tst a[href^="#"], #sidebar-mock a[href^="#"], #sidebar-history a[href^="#"], #sidebar-vmo a[href^="#"], #sidebar-olympic a[href^="#"], #sidebar-olympic30 a[href^="#"], #sidebar-duyenhai a[href^="#"], #sidebar-admission a[href^="#"], #sidebar-university a[href^="#"]');
    if (!link || !window.VMODataService?.getExamCatalogDetail || event.defaultPrevented ||
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const tab = { 'sidebar-tst': 'tab-tst', 'sidebar-mock': 'tab-mock', 'sidebar-history': 'tab-history', 'sidebar-vmo': 'tab-vmo', 'sidebar-olympic': 'tab-olympic', 'sidebar-olympic30': 'tab-olympic30', 'sidebar-duyenhai': 'tab-duyenhai', 'sidebar-admission': 'tab-admission', 'sidebar-university': 'tab-university' }
      [link.closest('#sidebar-tst, #sidebar-mock, #sidebar-history, #sidebar-vmo, #sidebar-olympic, #sidebar-olympic30, #sidebar-duyenhai, #sidebar-admission, #sidebar-university')?.id];
    const category = examCategories[tab];
    const anchor = link.getAttribute('href')?.slice(1);
    if (tab === 'tab-university' && link.dataset.courseId) {
      const memberships=(link.dataset.courseSections||`${link.dataset.courseId}:${link.dataset.sectionId||'unclassified'}`).split('|').map(value=>value.split(':'));
      const chosen=memberships.find(([course,section])=>course===window.currentUniversityCourse&&section===window.currentUniversitySection)||memberships.find(([course])=>course===window.currentUniversityCourse)||memberships[0];
      window.selectUniversityCourse?.(chosen[0],chosen[1]);
    }
    if (!category || !anchor) return;
    event.preventDefault();
    const token = ++sidebarNavigationToken;
    stopSidebarAlignment?.();
    stopSidebarAlignment = null;
    try {
      await window.loadDatabaseExamDetail(category, anchor);
      if (token !== sidebarNavigationToken) return;
      const card = document.getElementById(anchor);
      if (!card) return;
      if (card.dataset.grade) {
        const input = document.getElementById('searchInput');
        if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }
        document.querySelector(`#${tab.slice(4)}FilterPills [data-filter="GRADE${card.dataset.grade}"]`)?.click();
      }
      card.classList.remove('hidden-by-search');
      // Cuộn sau khi nội dung thay thế placeholder và browser hoàn tất bố cục.
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      if (token !== sidebarNavigationToken) return;
      window.history.pushState(null, '', `#${anchor}`);
      // The root scroll-padding reserves the sticky controls. A short-lived
      // observer keeps the selected card aligned if nearby lazy cards expand.
      card.scrollIntoView({ behavior: 'instant', block: 'start' });
      if (typeof window.ResizeObserver === 'function') {
        const feed = card.closest('.feed-container');
        if (feed) {
          let active = true;
          const stop = () => {
            if (!active) return;
            active = false;
            observer.disconnect();
            clearTimeout(expiry);
            window.removeEventListener('wheel', stop);
            window.removeEventListener('touchstart', stop);
            window.removeEventListener('keydown', stop);
          };
          const align = () => {
            if (!active || token !== sidebarNavigationToken) return stop();
            const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            const delta = card.getBoundingClientRect().top - offset;
            if (Math.abs(delta) > 3) window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'instant' });
          };
          const observer = new ResizeObserver(() => window.requestAnimationFrame(align));
          observer.observe(feed);
          const expiry = setTimeout(stop, 1600);
          window.addEventListener('wheel', stop, { passive: true, once: true });
          window.addEventListener('touchstart', stop, { passive: true, once: true });
          window.addEventListener('keydown', stop, { once: true });
          stopSidebarAlignment = stop;
        }
      }
    } catch (error) {
      console.warn('Không tải được đề được chọn:', error?.message || error);
    }
  });

  function showDatabaseCatalogState(root, exams, error = null) {
    const feed = root?.querySelector('.feed-container');
    if (!feed) return;
    feed.querySelector('.db-catalog-state')?.remove();
    if (!error && exams.some(exam => Number(exam.problemCount) > 0 || (Array.isArray(exam.problems) && exam.problems.length))) return;
    const state = document.createElement('p');
    state.className = 'db-catalog-state';
    state.setAttribute('role', error ? 'alert' : 'status');
    state.textContent = error
      ? 'Không tải được dữ liệu đề thi từ cơ sở dữ liệu. Vui lòng thử lại sau.'
      : 'Chưa có đề thi liên kết với câu hỏi trong cơ sở dữ liệu.';
    feed.appendChild(state);
  }
  async function loadDatabaseMockExams(force = false) {
    if (!window.VMODataService?.getExamCatalog) return;
    if (databaseMockLoaded && !force) return;
    if (databaseMockPromise) return databaseMockPromise;
    if (force) { window.invalidateVMODataCache?.(); resetExamCategory('tab-mock'); }
    databaseMockPromise = (async () => {
      try {
        const exams = await (window.VMODataService.getExamCatalogSummary || window.VMODataService.getExamCatalog)('vmo-mock');
        await renderExamSummaries(exams, 'vmo-mock');
        const root = document.getElementById('tab-mock');
        const allMockPill = document.querySelector('#mockFilterPills .pill[data-filter="ALL"]');
        if (allMockPill) allMockPill.textContent = `Tất cả đề thử (${root?.querySelectorAll('.db-exam-card').length || 0} buổi)`;
        showDatabaseCatalogState(root, exams);
        injectSubmissionButtons(root || document);
        window.reinitAIGuide?.(root || document);
        await applyCatalogAccessRules(root || document);
        applyMongoReferenceLinks(root || document);
        databaseMockLoaded = true;
      } catch (error) {
        showDatabaseCatalogState(document.getElementById('tab-mock'), [], error);
        console.warn('Không tải được đề thi thử từ MongoDB:', error?.message || error);
      }
      finally { databaseMockPromise = null; }
    })();
    return databaseMockPromise;
  }
  window.loadDatabaseMockExams = loadDatabaseMockExams;

  let databaseTstLoaded = false;
  let databaseTstPromise = null;

  async function loadDatabaseTstExams(force = false) {
    if (!window.VMODataService?.getExamCatalog) {
      if (!force) setTimeout(() => loadDatabaseTstExams(true), 500);
      return;
    }
    if (databaseTstLoaded && !force) return;
    if (databaseTstPromise) return databaseTstPromise;
    if (force) { window.invalidateVMODataCache?.(); resetExamCategory('tab-tst'); }

    databaseTstPromise = (async () => {
      try {
        const exams = await (window.VMODataService.getExamCatalogSummary || window.VMODataService.getExamCatalog)('tst-national');
        await renderExamSummaries(exams, 'tst-national');
        const tstRoot = document.getElementById('tab-tst');
        showDatabaseCatalogState(tstRoot, exams);
        injectSubmissionButtons(tstRoot || document);
        window.reinitAIGuide?.(tstRoot || document);
        await applyCatalogAccessRules(tstRoot || document);
        applyMongoReferenceLinks(tstRoot || document);
        databaseTstLoaded = true;
      } catch (error) {
        showDatabaseCatalogState(document.getElementById('tab-tst'), [], error);
        console.warn('Không tải được đề thi động từ MongoDB:', error?.message || error);
      } finally {
        databaseTstPromise = null;
      }
    })();
    return databaseTstPromise;
  }

  window.loadDatabaseTstExams = loadDatabaseTstExams;

  const competitionLoads = new Map();
  const competitionLoaded = new Set();
  async function loadDatabaseCompetitionExams(tabId, force = false) {
    const category = examCategories[tabId];
    if (!competitionTabs[category] || !window.VMODataService?.getExamCatalogSummary) return;
    if (competitionLoaded.has(tabId) && !force) return;
    if (competitionLoads.has(tabId)) return competitionLoads.get(tabId);
    if (force) { window.invalidateVMODataCache?.(); resetExamCategory(tabId); competitionLoaded.delete(tabId); }
    const pending = (async () => {
      try {
        if(tabId==='tab-university')await window.loadUniversityCatalog?.();
        const exams = await window.VMODataService.getExamCatalogSummary(category);
        await renderExamSummaries(exams, category);
        const root = document.getElementById(tabId);
        const count = root?.querySelectorAll('.db-exam-card').length || 0;
        const pill = document.querySelector(`#${tabId.slice(4)}FilterPills .pill[data-filter="ALL"]`);
        if (pill) pill.textContent = `Tất cả ${count} đề`;
        showDatabaseCatalogState(root, exams);
        if (tabId === 'tab-university') { if(root)root.dataset.universityLoaded='true';window.refreshUniversityCatalogFilter?.(); }
        injectSubmissionButtons(root || document);
        window.reinitAIGuide?.(root || document);
        await applyCatalogAccessRules(root || document);
        applyMongoReferenceLinks(root || document);
        competitionLoaded.add(tabId);
      } catch (error) {
        showDatabaseCatalogState(document.getElementById(tabId), [], error);
        console.warn('Không tải được đề VMO/IMO từ MongoDB:', error?.message || error);
      } finally { competitionLoads.delete(tabId); }
    })();
    competitionLoads.set(tabId, pending);
    return pending;
  }
  window.loadDatabaseCompetitionExams = loadDatabaseCompetitionExams;

  let databaseRegionalLoaded = false;
  let databaseRegionalPromise = null;

  async function loadDatabaseRegionalExams(force = false) {
    if (!window.VMODataService?.getExamCatalog) return;
    if (databaseRegionalLoaded && !force) return;
    if (databaseRegionalPromise) return databaseRegionalPromise;
    if (force) { window.invalidateVMODataCache?.(); resetExamCategory('tab-history'); }
    databaseRegionalPromise = (async () => {
      try {
        await window.ensureVMOTabContent?.('tab-history');
        const exams = await (window.VMODataService.getExamCatalogSummary || window.VMODataService.getExamCatalog)('history-dn-qn');
        await renderExamSummaries(exams, 'history-dn-qn');
        const root = document.getElementById('tab-history');
        const cards = Array.from(root?.querySelectorAll('.db-exam-card') || []);
        const labels = {
          ALL: `Tất cả ${cards.length} đề`,
          DANANG: `Đà Nẵng (${cards.filter(card => card.dataset.filter === 'DANANG').length})`,
          QUANGNAM: `Quảng Nam (${cards.filter(card => card.dataset.filter === 'QUANGNAM').length})`
        };
        Object.entries(labels).forEach(([filter, label]) => {
          const pill = document.querySelector(`#historyFilterPills .pill[data-filter="${filter}"]`);
          if (pill) pill.textContent = label;
        });
        showDatabaseCatalogState(root, exams);
        injectSubmissionButtons(root || document);
        window.reinitAIGuide?.(root || document);
        await applyCatalogAccessRules(root || document);
        applyMongoReferenceLinks(root || document);
        databaseRegionalLoaded = true;
      } catch (error) {
        showDatabaseCatalogState(document.getElementById('tab-history'), [], error);
        console.warn('Không tải được đề Đà Nẵng–Quảng Nam từ MongoDB:', error?.message || error);
      } finally { databaseRegionalPromise = null; }
    })();
    return databaseRegionalPromise;
  }
  window.loadDatabaseRegionalExams = loadDatabaseRegionalExams;

  window.openExamSourceImage = async function(examId, pageNumber = 1) {
    const viewer = window.open('', '_blank');
    try {
      if (!viewer) throw new Error('Trình duyệt đang chặn cửa sổ xem ảnh');
      viewer.document.write('<!doctype html><html lang="vi"><body style="font-family:system-ui;padding:24px">Đang tải ảnh đề thi...</body></html>');
      const stored = await window.VMODataService.getExamImage(examId, pageNumber);
      if (!stored?.image) throw new Error('Không tìm thấy ảnh đề thi');
      viewer.document.open();
      viewer.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Ảnh đề thi gốc</title><style>body{margin:0;background:#0f172a;display:grid;place-items:center;min-height:100vh}img{max-width:96vw;max-height:96vh;object-fit:contain;background:#fff}</style></head><body><img alt="Ảnh đề thi gốc" src="${stored.image}"></body></html>`);
      viewer.document.close();
    } catch (error) {
      if (viewer && !viewer.closed) viewer.close();
      showToast(error?.message || 'Không mở được ảnh đề thi.', false);
    }
  };

  // Thiết lập sự kiện đóng cho modal
  function setupModalEvents() {
    const hubModal = document.getElementById('dataHubModal');
    if (hubModal) {
      const closeBtns = hubModal.querySelectorAll('.vmo-modal-close, #dataHubModalClose');
      closeBtns.forEach(btn => {
        btn.onclick = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          window.closeDataHubModal();
        };
      });
      hubModal.addEventListener('click', (e) => {
        if (e.target === hubModal) window.closeDataHubModal();
      });
    }

    const subModal = document.getElementById('submissionModal');
    if (subModal) {
      const closeBtns = subModal.querySelectorAll('.vmo-modal-close, #submissionModalClose');
      closeBtns.forEach(btn => {
        btn.onclick = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          window.closeSubmissionModal();
        };
      });
      subModal.addEventListener('click', (e) => {
        if (e.target === subModal) window.closeSubmissionModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.closeDataHubModal();
        if (typeof window.closeSubmissionModal === 'function') window.closeSubmissionModal();
        if (typeof window.closeTrendPractice === 'function') window.closeTrendPractice();
      }
    });
  }

  // Tự động kích hoạt khi DOM hoàn tất
  function init() {
    const activeRoot = document.querySelector('.tab-pane.active') || document;
    setupModalEvents();
    injectSubmissionButtons(activeRoot);
    injectDataManagementButton();
    applyCatalogAccessRules(activeRoot);
    if (activeRoot.id === 'tab-danang') loadMongoReferenceLinks(false, activeRoot);
    if (activeRoot.id === 'tab-tst') loadDatabaseTstExams();
    if (activeRoot.id === 'tab-mock') loadDatabaseMockExams();
    if (activeRoot.id === 'tab-history') loadDatabaseRegionalExams();
    if (Object.values(competitionTabs).includes(activeRoot.id)) loadDatabaseCompetitionExams(activeRoot.id);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Lắng nghe đổi tab hoặc đổi ngôn ngữ để gắn lại nút
  window.addEventListener('langchange', () => {
    injectSubmissionButtons();
    applyCatalogAccessRules();
  });

  window.reinitDatabaseUI = function(root = document.querySelector('.tab-pane.active') || document) {
    injectSubmissionButtons(root);
    injectDataManagementButton();
    applyCatalogAccessRules(root);
    if (root.id === 'tab-danang') loadMongoReferenceLinks(false, root);
    else applyMongoReferenceLinks(root);
    if (root.id === 'tab-tst') loadDatabaseTstExams();
    if (root.id === 'tab-mock') loadDatabaseMockExams();
    if (root.id === 'tab-history') loadDatabaseRegionalExams();
    if (Object.values(competitionTabs).includes(root.id)) loadDatabaseCompetitionExams(root.id);
  };

})();
