(() => {
  const byId = id => document.getElementById(id);
  const state = { image: '', uploadKey: '', confidence: '', busy: false, loaded: false, page: 1, pages: 1, loadToken: 0 };
  const status = (id, message) => { if (byId(id)) byId(id).textContent = message; };
  function busy(value, message = '') {
    state.busy = value;
    for (const id of ['supportImage', 'supportTitle', 'supportTopic', 'supportContent', 'supportOcrButton', 'supportSolveButton', 'supportSaveButton']) {
      if (byId(id)) byId(id).disabled = value;
    }
    if (!value) {
      byId('supportOcrButton').disabled = !state.image;
      byId('supportSolveButton').disabled = !state.image || !byId('supportContent').value.trim();
      byId('supportSaveButton').disabled = !state.image || !byId('supportContent').value.trim();
    }
    if (message) status('supportUploadStatus', message);
  }
  function preview() {
    const target = byId('supportMathPreview'), content = byId('supportContent').value.trim();
    if (window.safeRenderMathJaxToElement) window.safeRenderMathJaxToElement(target, content);
    else target.textContent = content;
  }
  async function ocr() {
    if (!state.image || state.busy) return;
    busy(true, 'Đang OCR bài toán...');
    try {
      const data = await window.VMODataService.ocrMathSupport(state.image);
      const content = String(data?.latexText || '').trim();
      if (!content || content.length > 50000) throw new Error('OCR chưa có nội dung hợp lệ. Vui lòng thử ảnh rõ hơn.');
      state.confidence = String(data.confidence || '');
      const topicSelect = byId('supportTopic');
      topicSelect.value = Array.from(topicSelect.options).some(option => option.value === data.topic) ? data.topic : '';
      status('supportTopicHint', topicSelect.value ? 'Đã tự động phân loại chuyên đề. Bạn có thể điều chỉnh trước khi lưu.' : 'Chưa xác định được chuyên đề trong bảy nhóm. Vui lòng chọn chuyên đề phù hợp trước khi lưu.');
      byId('supportContent').value = content;
      byId('supportOcrEditor').hidden = false;
      byId('supportSolveResult').replaceChildren();
      status('supportSolveStatus', '');
      preview();
      status('supportUploadStatus', 'OCR hoàn tất. Hãy kiểm tra đề bài và công thức, sau đó lưu.');
    } catch (error) { status('supportUploadStatus', error.message || 'Không OCR được ảnh. Vui lòng thử lại.'); }
    finally { busy(false); }
  }
  async function solve() {
    const content = byId('supportContent').value.trim();
    if (!state.image || state.busy || !content) return;
    if (typeof window.openAIGuide !== 'function') {
      status('supportSolveStatus', 'Chức năng giải toán AI chưa sẵn sàng. Vui lòng tải lại trang.');
      return;
    }

    busy(true);
    status('supportSolveStatus', 'Gia sư AI đang phân tích và giải bài toán...');
    const card = document.createElement('article');
    card.className = 'exam-card math-support-card support-draft-solution';

    const heading = document.createElement('h3');
    heading.className = 'exam-title';
    heading.textContent = byId('supportTitle').value.trim() || 'Bài toán từ ảnh';
    const item = document.createElement('div');
    item.className = 'problem-item';
    item.id = `support-draft-${state.uploadKey}`;
    item.dataset.contentKey = `math_support:draft:${state.uploadKey}`;
    item.dataset.sourceGroup = 'math_support';
    item.dataset.sourceType = 'standalone_question';
    item.dataset.setTitle = 'Hỗ trợ giải toán';
    item.dataset.topic = byId('supportTopic').value || 'Toán Olympic';
    const problemHeader = document.createElement('div');
    problemHeader.className = 'problem-header';
    const identity = document.createElement('div');
    identity.className = 'problem-id';
    const label = document.createElement('span');
    label.textContent = heading.textContent;
    const topic = document.createElement('span');
    topic.className = 'badge-topic';
    topic.textContent = item.dataset.topic;
    identity.append(label, topic);
    const contentNode = document.createElement('div');
    contentNode.className = 'problem-content';
    contentNode.dataset.noI18n = 'true';
    contentNode.textContent = content;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-ai-guide';
    button.textContent = '🧠 Giải bài toán bằng AI';
    problemHeader.append(identity, button);
    item.append(problemHeader, contentNode);
    card.append(heading, item);
    byId('supportSolveResult').replaceChildren(card);
    try {
      await window.openAIGuide(button);
      const guidePanel = card.querySelector('.ai-guide-panel');
      const failed = guidePanel?.dataset.guideError === 'true';
      status('supportSolveStatus', failed
        ? guidePanel.querySelector('[data-guide-error-message]')?.textContent.trim() || 'AI chưa tạo được lời giải đạt chuẩn. Bạn có thể bấm nút thử lại trong khung kết quả.'
        : 'Đã tạo lời giải. Hãy đọc và kiểm tra các bước lập luận.');
    } catch (error) {
      status('supportSolveStatus', error.message || 'Chưa giải được bài toán. Vui lòng thử lại.');
    } finally { busy(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (state.busy || !state.image || !byId('supportContent').value.trim() || !byId('mathSupportForm').reportValidity()) return;
    busy(true, 'Đang lưu bài toán...');
    try {
      await window.VMODataService.createMathSupport({ uploadKey: state.uploadKey, image: state.image,
        content: byId('supportContent').value.trim(), title: byId('supportTitle').value.trim(),
        topic: byId('supportTopic').value.trim(), maxScore: Number(byId('supportScore').value), ocrConfidence: state.confidence });
      window.invalidateVMODataCache?.();
      byId('mathSupportForm').reset(); byId('supportOcrEditor').hidden = true;
      byId('supportContent').value = ''; byId('supportMathPreview').replaceChildren();
      byId('supportSolveResult').replaceChildren(); status('supportSolveStatus', '');
      byId('supportImagePreview').hidden = true; byId('supportImagePreview').removeAttribute('src');
      state.image = ''; state.uploadKey = ''; state.confidence = '';
      byId('supportSearch').value = '';
      status('supportUploadStatus', 'Đã lưu bài toán. Bạn có thể sao chép, nộp bài giải và quản lý nguồn bên dưới.');
      await window.loadMathSupportProblems(1, true);
    } catch (error) { status('supportUploadStatus', error.message || 'Chưa lưu được bài toán. Nội dung được giữ lại để thử lại.'); }
    finally { busy(false); }
  }
  function renderProblem(problem) {
    const article = document.createElement('article'); article.className = 'exam-card math-support-card';
    article.id = `support-${problem.id || problem._id}`;
    article.innerHTML = '<div class="exam-header"><h3 class="exam-title"></h3><p class="math-support-meta"></p></div><div class="exam-body"><div class="problem-item"><div class="problem-header"><div class="problem-id"><span></span><span class="badge-point"></span><span class="badge-topic"></span></div><button type="button" class="btn-copy">📋 Sao chép</button></div><div class="problem-content" data-no-i18n="true"></div></div></div>';
    article.querySelector('.exam-title').textContent = problem.title || 'Bài toán riêng lẻ';
    article.querySelector('.math-support-meta').textContent = `${problem.createdBy || ''} · ${problem.createdAt ? new Date(problem.createdAt).toLocaleDateString('vi-VN') : ''}`;
    const item = article.querySelector('.problem-item');
    Object.assign(item.dataset, { contentKey: problem.contentKey, databaseProblem: 'true', setKey: problem.setKey,
      setTitle: problem.setTitle || 'Hỗ trợ giải toán', sourceGroup: 'math_support', sourceType: 'standalone_question', contentType: 'standalone_problem', questionNumber: '1' });
    item.querySelector('.problem-id span').textContent = problem.title || 'Bài toán';
    item.querySelector('.badge-point').textContent = ` (${Number(problem.maxScore) || 5}đ) `;
    item.querySelector('.badge-topic').textContent = problem.topic || 'Toán Olympic';
    item.querySelector('.btn-copy').onclick = event => window.copyText(event.currentTarget);
    const imageButton = document.createElement('button'); imageButton.type = 'button'; imageButton.className = 'btn-secondary'; imageButton.textContent = '🖼️ Xem ảnh nguồn';
    imageButton.onclick = async () => {
      if (article.querySelector('.math-support-source-image')) { article.querySelector('.math-support-source-image').remove(); imageButton.textContent = '🖼️ Xem ảnh nguồn'; return; }
      imageButton.disabled = true;
      try {
        const image = await window.VMODataService.getMathSupportImage(problem.id || problem._id);
        const img = document.createElement('img'); img.className = 'math-support-source-image'; img.alt = 'Ảnh nguồn của bài toán'; img.src = image.image;
        article.querySelector('.exam-body').prepend(img); imageButton.textContent = 'Ẩn ảnh nguồn';
      } catch (error) { status('supportListStatus', error.message || 'Không tải được ảnh nguồn.'); }
      finally { imageButton.disabled = false; }
    };
    article.querySelector('.exam-header').append(imageButton);
    return article;
  }
  window.loadMathSupportProblems = async function(page = state.page, force = false) {
    if (!byId('supportProblems') || (!force && state.loaded && page === state.page)) return;
    const token = ++state.loadToken;
    status('supportListStatus', 'Đang tải bài toán...');
    try {
      const result = await window.VMODataService.getMathSupportProblems(page, byId('supportSearch').value.trim());
      if (token !== state.loadToken) return;
      state.page = result.pagination.page; state.pages = result.pagination.pages; state.loaded = true;
      const root = byId('supportProblems'); root.replaceChildren(...result.items.map(renderProblem));
      await window.enhanceMathSupportProblems(root, result.items);
      status('supportListStatus', result.items.length ? `${result.pagination.total} bài toán đã lưu` : 'Chưa có bài toán phù hợp. Tải ảnh lên để bắt đầu.');
      byId('supportPageLabel').textContent = `Trang ${state.page}/${state.pages}`;
      byId('supportPrevious').disabled = state.page <= 1; byId('supportNext').disabled = state.page >= state.pages;
    } catch (error) { if (token === state.loadToken) status('supportListStatus', error.message || 'Không tải được bài toán. Hãy bấm Tải lại.'); }
  };
  async function loadImage(file) {
    if (state.busy) return;
    if (file && !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      status('supportUploadStatus', 'Vui lòng chọn hoặc dán ảnh JPEG, PNG hoặc WEBP.'); return;
    }
    if (file && file.size > 20 * 1024 * 1024) {
      status('supportUploadStatus', 'Ảnh gốc quá lớn. Vui lòng chọn ảnh dưới 20 MB.'); return;
    }
    // Prepare before replacing the current draft, so a failed image keeps its OCR.
    busy(true, 'Đang chuẩn bị ảnh bài toán...');
    try {
      const image = file ? await window.prepareMathSupportImage(file) : '';
      state.image = image; state.uploadKey = image ? crypto.randomUUID() : ''; state.confidence = '';
      byId('supportTopic').value = '';
      byId('supportContent').value = ''; byId('supportOcrEditor').hidden = true;
      byId('supportMathPreview').replaceChildren();
      byId('supportSolveResult').replaceChildren(); status('supportSolveStatus', '');
      byId('supportImagePreview').hidden = !image;
      if (image) byId('supportImagePreview').src = image;
      else byId('supportImagePreview').removeAttribute('src');
      status('supportUploadStatus', image ? 'Ảnh đã sẵn sàng. Bấm OCR bài toán để nhận diện.' : '');
    } catch (error) { status('supportUploadStatus', error.message || 'Không đọc được ảnh.'); }
    finally { busy(false); }
  }
  function init() {
    if (!byId('mathSupportForm')) return;
    byId('supportImage').addEventListener('change', event => loadImage(event.target.files?.[0]));
    document.addEventListener('paste', event => {
      if (event.defaultPrevented || !byId('tab-support').classList.contains('active') ||
          document.querySelector('.modal.active, .vmo-modal.active, #submissionModal.active, .trend-practice-modal.active')) return;
      const item = Array.from(event.clipboardData?.items || []).find(item => item.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return; // Ordinary text paste remains native, including in the OCR editor.
      event.preventDefault();
      if (state.busy) return;
      byId('supportImage').value = '';
      loadImage(file);
    });
    byId('supportOcrButton').addEventListener('click', ocr);
    byId('supportSolveButton').addEventListener('click', solve);
    byId('mathSupportForm').addEventListener('submit', save);
    byId('supportPreviewButton').addEventListener('click', preview);
    byId('supportContent').addEventListener('input', () => {
      const hasContent = Boolean(byId('supportContent').value.trim());
      byId('supportSolveButton').disabled = state.busy || !state.image || !hasContent;
      byId('supportSaveButton').disabled = state.busy || !state.image || !hasContent;
      if (byId('supportSolveResult').childElementCount) {
        byId('supportSolveResult').replaceChildren();
        status('supportSolveStatus', 'Nội dung đã thay đổi. Hãy giải lại để dùng đề bài mới.');
      }
    });
    byId('supportReload').addEventListener('click', () => window.loadMathSupportProblems(1, true));
    byId('supportPrevious').addEventListener('click', () => window.loadMathSupportProblems(state.page - 1, true));
    byId('supportNext').addEventListener('click', () => window.loadMathSupportProblems(state.page + 1, true));
    let timer;
    byId('supportSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => window.loadMathSupportProblems(1, true), 300); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
