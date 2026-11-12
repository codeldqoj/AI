/**
 * BUILD SYSTEM - VMO ĐÀ NẴNG 2026-2027
 * Biên dịch kiến trúc module phân tán (src/) thành tệp hoàn chỉnh index.html.
 * Giúp mã nguồn cực kỳ dễ quản lý, bảo trì và phát triển nội dung toán học.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function build() {
  const startTime = Date.now();
  const rootDir = __dirname;
  const srcDir = path.join(rootDir, 'src');

  console.log('[Build] Bắt đầu tổng hợp mã nguồn từ thư mục src/...');

  const templatePath = path.join(srcDir, 'template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Không tìm thấy tệp template: ${templatePath}`);
  }

  let html = fs.readFileSync(templatePath, 'utf8');

  const schoolRegistry = fs.readFileSync(path.join(__dirname, 'data/specialized-schools.json'), 'utf8');
  html = html.replace('<!-- INJECT:SPECIALIZED_SCHOOL_REGISTRY -->', `<script id="specialized-school-registry" type="application/json">${schoolRegistry.replace(/</g, '\\u003c')}</script>`);

  // Tạo mã version timestamp động mới cho mỗi lần build để chống triệt để trình duyệt cache script cũ
  const buildVersion = Date.now();
  html = html.replace(/\?v=[a-zA-Z0-9_-]+/g, `?v=${buildVersion}`);

  // Bản đồ các khối module thành phần
  const injections = [
    { tag: '<!-- INJECT:SIDEBAR_DANANG -->', file: 'sidebars/sidebar-danang.html' },
    { tag: '<!-- INJECT:SIDEBAR_MOCK -->', file: 'sidebars/sidebar-mock.html',
      apiShell: '<div id="sidebar-mock" style="display:none"><div class="sidebar-title">Bộ Đề Thi Thử VMO</div><nav class="book-toc" aria-label="Mục lục bộ đề thi thử"></nav></div>' },
    { tag: '<!-- INJECT:SIDEBAR_TST -->', file: 'sidebars/sidebar-tst.html',
      apiShell: '<div id="sidebar-tst" style="display:none"><div class="sidebar-title">Mục Lục Đề TST</div><div class="nav-year-group"><div class="nav-year-title">🏛️ CÁC TỈNH &amp; TRƯỜNG CHUYÊN</div></div></div>' },
    { tag: '<!-- INJECT:SIDEBAR_HISTORY -->', file: 'sidebars/sidebar-history.html',
      apiShell: '<div id="sidebar-history" style="display:none"><div class="sidebar-title">Đề Đà Nẵng – Quảng Nam</div><div class="nav-year-group"><div class="nav-year-title">📘 ĐÀ NẴNG</div></div><div class="nav-year-group"><div class="nav-year-title">📙 QUẢNG NAM</div></div></div>' },
    { tag: '<!-- INJECT:TAB_DANANG -->', file: 'content/tab-danang.html' },
    { tag: '<!-- INJECT:TAB_MOCK -->', file: 'content/tab-mock.html', apiTab: 'tab-mock',
      title: 'BỘ ĐỀ THI THỬ VMO' },
    { tag: '<!-- INJECT:TAB_TST -->', file: 'content/tab-tst.html', apiTab: 'tab-tst',
      title: 'TUYỂN TẬP ĐỀ THI CHỌN ĐỘI TUYỂN HSGQG (TST QUA CÁC NĂM)' },
    { tag: '<!-- INJECT:TAB_VMO -->', file: 'content/tab-tst.html', apiTab: 'tab-vmo', title: 'NGÂN HÀNG ĐỀ VMO' },
    { tag: '<!-- INJECT:TAB_ADMISSION -->', file: 'content/tab-tst.html', apiTab: 'tab-admission', title: 'NGÂN HÀNG ĐỀ THI VÀO LỚP 10 CHUYÊN' },
    { tag: '<!-- INJECT:TAB_OLYMPIC30 -->', file: 'content/tab-tst.html', apiTab: 'tab-olympic30', title: 'NGÂN HÀNG ĐỀ OLYMPIC 30/4 — LỚP 10, LỚP 11' },
    { tag: '<!-- INJECT:TAB_DUYENHAI -->', file: 'content/tab-tst.html', apiTab: 'tab-duyenhai', title: 'NGÂN HÀNG ĐỀ DUYÊN HẢI MIỀN BẮC — LỚP 10, LỚP 11' },
    { tag: '<!-- INJECT:TAB_OLYMPIC -->', file: 'content/tab-tst.html', apiTab: 'tab-olympic', title: 'NGÂN HÀNG ĐỀ IMO–OLYMPIC' },
    { tag: '<!-- INJECT:TAB_SUPPORT -->', file: 'content/tab-support.html' },
    { tag: '<!-- INJECT:TAB_HISTORY -->', file: 'content/tab-history.html', apiTab: 'tab-history',
      title: 'NGÂN HÀNG ĐỀ ĐÀ NẴNG – QUẢNG NAM QUA CÁC NĂM' },
    { tag: '<!-- INJECT:ACCOUNT_MODAL -->', file: 'modals/account-modal.html' },
    { tag: '<!-- INJECT:DATA_HUB_MODAL -->', file: 'modals/data-hub-modal.html' }
  ];

  for (const item of injections) {
    const filePath = path.join(srcDir, item.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Thiếu khối module: ${item.file} tại ${filePath}`);
    }
    const content = item.apiShell || (item.apiTab
      ? `<div class="tab-pane" id="${item.apiTab}"><div class="feed-container"><div class="section-header-box"><h2>${item.title}</h2></div></div></div>`
      : fs.readFileSync(filePath, 'utf8'));
    if (!html.includes(item.tag)) {
      console.warn(`[Build Cảnh báo] Thẻ ${item.tag} không tìm thấy trong template.html`);
    }
    const protectedContent = ['<!-- INJECT:TAB_DANANG -->', '<!-- INJECT:SIDEBAR_DANANG -->'].includes(item.tag)
      ? `<!-- EDUCATION:upper_secondary:START -->${content}<!-- EDUCATION:upper_secondary:END -->` : content;
    html = html.replace(item.tag, protectedContent);
  }

  // Ghi tệp index.html tại thư mục gốc
  const outputPath = path.join(rootDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf8');

  const publicDir = path.join(rootDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  const loginPath = path.join(rootDir, 'login.html');
  const loginHtml = fs.readFileSync(loginPath, 'utf8');
  fs.copyFileSync(loginPath, path.join(publicDir, 'login.html'));

  const publicAssets = new Set();
  for (const page of [html, loginHtml]) {
    for (const tag of page.matchAll(/<(script|link)\b[^>]*>/gi)) {
      const attribute = tag[1].toLowerCase() === 'script' ? 'src' : 'href';
      const reference = tag[0].match(new RegExp(`\\s${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
      if (!reference || reference.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(reference)) continue;
      const relativePath = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
      if (path.dirname(relativePath) !== '.' || !/\.(js|css)$/i.test(relativePath)) continue;
      publicAssets.add(relativePath);
    }
  }

  for (const asset of publicAssets) {
    const sourcePath = path.join(rootDir, asset);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`Không tìm thấy tài nguyên frontend: ${asset}`);
    }
    fs.copyFileSync(sourcePath, path.join(publicDir, asset));
  }

  const elapsed = Date.now() - startTime;
  const stats = fs.statSync(outputPath);
  const sizeKB = (stats.size / 1024).toFixed(1);
  const lineCount = html.split('\n').length;

  console.log(`[Build Thành công] Đã biên dịch index.html (${sizeKB} KB, ${lineCount} dòng) trong ${elapsed}ms.`);
  return { size: stats.size, lines: lineCount, elapsed };
}

// Chạy trực tiếp nếu gọi qua lệnh node build.js
if (process.argv[1] === __filename) {
  try {
    build();
  } catch (err) {
    console.error('[Build Thất bại]:', err.message);
    process.exit(1);
  }
}
