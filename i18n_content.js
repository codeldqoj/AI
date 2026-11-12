/**
 * Full-content VI -> EN translation for mathematical material.
 *
 * Fixed interface labels remain in i18n.js. This module translates long and
 * dynamic content (problems, solutions, MongoDB catalog text and AI panels)
 * through the authenticated backend, while preserving MathJax/LaTeX exactly.
 */
(() => {
  const CACHE_KEY = 'vmo_i18n_math_cache_v4';
  const CACHE_LIMIT = 2500;
  const MAX_BATCH_ITEMS = 6;
  const MAX_BATCH_CHARS = 10_000;
  const nodeState = new WeakMap();
  const trackedNodes = new Set();
  let runId = 0;
  let refreshTimer = 0;
  let cacheDirty = false;
  let isTranslating = false;
  let rerunRequested = false;

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  const cache = loadCache();

  function saveCache() {
    if (!cacheDirty) return;
    cacheDirty = false;
    try {
      const keys = Object.keys(cache);
      if (keys.length > CACHE_LIMIT) {
        keys.slice(0, keys.length - CACHE_LIMIT).forEach(key => delete cache[key]);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('[i18n] Không thể lưu cache bản dịch:', error?.message || error);
    }
  }

  function hashText(value) {
    let hash = 2166136261;
    const input = `v4\n${value}`;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `t${(hash >>> 0).toString(36)}_${input.length}`;
  }

  function containsVietnamese(value) {
    return /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(value)
      || /\b(?:cho|chứng minh|tìm|bài toán|câu|ngày thi|lời giải|thỏa mãn|giả sử|suy ra|do đó|với mọi)\b/i.test(value);
  }

  function hasUntranslatedVietnamese(value) {
    const output = String(value || '');
    return /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(output)
      || /\b(?:cho|chung minh|tim tat ca|tinh gioi han|thoa man|voi moi|suy ra|do do|gia su|bai toan|loi giai|cau hoi|ngay thu|nop bai|xem loi giai|thoi gian|tong diem)\b/i.test(output);
  }

  function protectMath(value) {
    const fragments = [];
    const text = String(value).replace(
      /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g,
      match => {
        const token = `__VMO_MATH_${fragments.length}__`;
        fragments.push(match);
        return token;
      }
    );
    return { text, fragments };
  }

  function restoreMath(value, fragments) {
    let output = String(value || '');
    fragments.forEach((formula, index) => {
      output = output.replace(`__VMO_MATH_${index}__`, formula);
    });
    return output;
  }

  function sameMathTokens(value, count) {
    const tokens = String(value || '').match(/__VMO_MATH_\d+__/g) || [];
    if (tokens.length !== count) return false;
    return tokens.every((token, index) => token === `__VMO_MATH_${index}__`);
  }

  function isExcluded(node) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue?.trim()) return true;
    return !!parent.closest([
      'script', 'style', 'noscript', 'textarea', 'input', 'select', 'option',
      'code', 'pre', 'svg', 'mjx-container', '.MathJax', '.MathJax_Preview',
      '.lang-switch-wrap', '[data-no-i18n]', '.user-info-chip', '.user-name',
      '#subImageMathPreviewContent', '#subMathPreviewContent'
    ].join(','));
  }

  function visibleSidebar() {
    return [...document.querySelectorAll('.sidebar')].find(sidebar => getComputedStyle(sidebar).display !== 'none');
  }

  function translationRoots() {
    const roots = [
      document.querySelector('.tab-pane.active'),
      visibleSidebar(),
      document.querySelector('.hero'),
      document.querySelector('.app-topbar'),
      document.querySelector('.controls-sticky'),
      document.querySelector('footer'),
      ...document.querySelectorAll('.vmo-modal-overlay.active, .ai-guide-panel')
    ].filter(Boolean);
    return [...new Set(roots)];
  }

  function collectNodes() {
    const result = [];
    translationRoots().forEach(root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (isExcluded(node)) continue;
        const existing = nodeState.get(node);
        const original = existing?.original ?? node.nodeValue;
        const core = original.trim();
        if (!core || !containsVietnamese(core)) continue;
        if (!existing) {
          const leading = original.match(/^\s*/)?.[0] || '';
          const trailing = original.match(/\s*$/)?.[0] || '';
          nodeState.set(node, { original, leading, trailing, translated: '' });
          trackedNodes.add(node);
        }
        result.push(node);
      }
    });
    return result;
  }

  function showStatus(message, isError = false) {
    let status = document.getElementById('vmoTranslationStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'vmoTranslationStatus';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('data-no-i18n', 'true');
      status.style.cssText = 'position:fixed;right:18px;bottom:72px;z-index:10050;padding:9px 13px;border-radius:9px;background:#0f172a;color:#fff;font:600 12px/1.4 system-ui;box-shadow:0 8px 24px rgba(15,23,42,.25);max-width:300px;';
      document.body.appendChild(status);
    }
    status.style.background = isError ? '#991b1b' : '#0f172a';
    if (status.textContent !== message) status.textContent = message;
    status.style.display = 'block';
    clearTimeout(status._hideTimer);
    if (!isError) status._hideTimer = setTimeout(() => { status.style.display = 'none'; }, 1400);
  }

  function applyTranslated(node, protectedTranslation, fragments) {
    const state = nodeState.get(node);
    if (!state || !sameMathTokens(protectedTranslation, fragments.length)) return false;
    const translated = restoreMath(protectedTranslation, fragments);
    state.translated = `${state.leading}${translated}${state.trailing}`;
    if (window.currentLang === 'en' && node.nodeValue !== state.translated) {
      node.nodeValue = state.translated;
    }
    return true;
  }

  function restoreVietnamese() {
    runId += 1;
    trackedNodes.forEach(node => {
      const state = nodeState.get(node);
      if (!node.isConnected) {
        trackedNodes.delete(node);
      } else if (state && node.nodeValue !== state.original) {
        node.nodeValue = state.original;
      }
    });
    const status = document.getElementById('vmoTranslationStatus');
    if (status) status.style.display = 'none';
  }

  function createEntries(nodes) {
    const entries = new Map();
    nodes.forEach(node => {
      const state = nodeState.get(node);
      if (!state) return;
      const core = state.original.trim();
      const protectedMath = protectMath(core);
      const key = hashText(protectedMath.text);
      if (!entries.has(key)) entries.set(key, { key, ...protectedMath, nodes: [] });
      entries.get(key).nodes.push(node);
    });
    return [...entries.values()];
  }

  function makeBatches(entries) {
    const batches = [];
    let current = [];
    let chars = 0;
    entries.forEach(entry => {
      if (current.length && (current.length >= MAX_BATCH_ITEMS || chars + entry.text.length > MAX_BATCH_CHARS)) {
        batches.push(current);
        current = [];
        chars = 0;
      }
      current.push(entry);
      chars += entry.text.length;
    });
    if (current.length) batches.push(current);
    return batches;
  }

  async function requestBatch(batch, strict = false) {
    const response = await fetch('/api/translate-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'vi',
        target: 'en',
        strict,
        items: batch.map((entry, index) => ({ id: `item-${index}`, text: entry.text }))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const byId = new Map((payload.translations || []).map(item => [item.id, item.text]));
    const results = batch.map((entry, index) => ({ entry, translated: byId.get(`item-${index}`) || '' }));
    return {
      valid: results.filter(result => result.translated && !hasUntranslatedVietnamese(result.translated)),
      invalid: results.filter(result => !result.translated || hasUntranslatedVietnamese(result.translated)).map(result => result.entry)
    };
  }

  async function requestBatchAdaptive(batch, depth = 0) {
    const first = await requestBatch(batch, depth > 0 || batch.length === 1);
    if (!first.invalid.length) return { results: first.valid, failed: [] };

    // Keep every valid translation. Only retry the entries that Gemini left in
    // Vietnamese; one stubborn item must never abort the rest of the page.
    if (first.invalid.length === 1) {
      const retry = await requestBatch(first.invalid, true);
      return { results: [...first.valid, ...retry.valid], failed: retry.invalid };
    }

    const middle = Math.ceil(first.invalid.length / 2);
    const left = await requestBatchAdaptive(first.invalid.slice(0, middle), depth + 1);
    const right = await requestBatchAdaptive(first.invalid.slice(middle), depth + 1);
    return {
      results: [...first.valid, ...left.results, ...right.results],
      failed: [...left.failed, ...right.failed]
    };
  }

  async function translateEnglish() {
    if (isTranslating) {
      rerunRequested = true;
      return;
    }

    const thisRun = ++runId;
    const entries = createEntries(collectNodes());
    const pending = [];

    entries.forEach(entry => {
      const cached = cache[entry.key];
      if (cached && sameMathTokens(cached, entry.fragments.length) && !hasUntranslatedVietnamese(cached)) {
        entry.nodes.forEach(node => applyTranslated(node, cached, entry.fragments));
      } else {
        pending.push(entry);
      }
    });

    if (!pending.length) {
      const status = document.getElementById('vmoTranslationStatus');
      if (status) status.style.display = 'none';
      return;
    }
    isTranslating = true;
    rerunRequested = false;
    showStatus('Translating mathematical content into English…');

    try {
      const failed = [];
      for (const batch of makeBatches(pending)) {
        const outcome = await requestBatchAdaptive(batch);
        const results = outcome.results;
        failed.push(...outcome.failed);
        results.forEach(({ entry, translated }) => {
          if (!translated || !sameMathTokens(translated, entry.fragments.length) || hasUntranslatedVietnamese(translated)) return;
          cache[entry.key] = translated;
          cacheDirty = true;
          if (thisRun === runId && window.currentLang === 'en') {
            entry.nodes.forEach(node => applyTranslated(node, translated, entry.fragments));
          }
        });
      }
      saveCache();
      if (failed.length) {
        console.warn('[i18n] Entries still awaiting strict English translation:', failed.length);
        if (thisRun === runId && window.currentLang === 'en') {
          showStatus(`${failed.length} English passage(s) could not be translated. Please retry.`, true);
        }
      } else if (thisRun === runId && window.currentLang === 'en') {
        showStatus('English mathematical translation is ready.');
      }
    } catch (error) {
      console.error('[i18n] Full-content translation failed:', error);
      if (thisRun === runId && window.currentLang === 'en') {
        showStatus('Some English content could not be translated. Please try again.', true);
      }
    } finally {
      isTranslating = false;
      if (rerunRequested && window.currentLang === 'en') {
        rerunRequested = false;
        scheduleRefresh();
      }
    }
  }

  function apply(lang) {
    if (lang === 'vi') restoreVietnamese();
    else if (lang === 'en') translateEnglish();
  }

  function scheduleRefresh() {
    if (window.currentLang !== 'en') return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => translateEnglish(), 180);
  }

  function startObserver() {
    if (!document.body || window.__vmoI18nObserver) return;
    window.__vmoI18nObserver = new MutationObserver(mutations => {
      if (window.currentLang !== 'en') return;
      const relevant = mutations.some(mutation => {
        if (mutation.type !== 'childList' || !mutation.addedNodes.length) return false;
        const target = mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target.parentElement;
        if (target?.closest?.('[data-no-i18n], #vmoTranslationStatus')) return false;
        return [...mutation.addedNodes].some(added => {
          const element = added.nodeType === Node.ELEMENT_NODE ? added : added.parentElement;
          return !element?.closest?.('[data-no-i18n], #vmoTranslationStatus');
        });
      });
      if (relevant) scheduleRefresh();
    });
    window.__vmoI18nObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.VMOContentI18n = { apply, refresh: scheduleRefresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver);
  else startObserver();
})();
