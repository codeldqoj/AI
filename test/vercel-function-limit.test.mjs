import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiDirectory = fileURLToPath(new URL('../api/', import.meta.url));

async function countJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(entries.map(entry => {
    const child = `${directory}/${entry.name}`;
    return entry.isDirectory() ? countJavaScriptFiles(child) : Number(entry.isFile() && entry.name.endsWith('.js'));
  }));
  return counts.reduce((sum, count) => sum + count, 0);
}

const count = await countJavaScriptFiles(apiDirectory);
assert.ok(count <= 12, `Vercel Hobby chỉ cho phép 12 Serverless Functions; thư mục api hiện có ${count} file JavaScript.`);
const projectRoot = new URL('../', import.meta.url);
const vercelConfig = JSON.parse(await readFile(new URL('vercel.json', projectRoot), 'utf8'));
assert.equal(vercelConfig.framework, null,
  'Use Vercel Other preset so protected internal rewrites are handled by Vercel routing, not backend framework routing');
assert.equal(vercelConfig.outputDirectory, 'public',
  'Publish only the explicit static frontend assets instead of exposing the repository root');
assert.ok(vercelConfig.rewrites?.some(rule =>
  rule.source === '/' && rule.destination === '/api/data?resource=app_shell'),
'The home page must be rewritten to the authenticated app-shell API');
assert.ok(vercelConfig.rewrites?.some(rule =>
  rule.source === '/assets/(.*)' && rule.destination === '/api/data?resource=protected_asset&file=$1'),
'Assets must stay behind the authenticated protected-asset API');
assert.ok(vercelConfig.functions?.['api/ai-ocr-exam.js']?.maxDuration >= 120,
  'OCR đề thi cần đủ thời gian xử lý ảnh và sinh JSON nhiều câu');
assert.ok(vercelConfig.functions?.['api/ai-ocr-math.js']?.maxDuration >= 120,
  'OCR Hỗ trợ giải toán cần đủ ngân sách cho Gemini và OCR dự phòng');
const examOcrSource = await readFile(new URL('api/ai-ocr-exam.js', projectRoot), 'utf8');
const mathOcrSource = await readFile(new URL('api/ai-ocr-math.js', projectRoot), 'utf8');
const dataServiceSource = await readFile(new URL('vmo_data_service.js', projectRoot), 'utf8');
const databaseUiSource = await readFile(new URL('vmo_db_ui.js', projectRoot), 'utf8');
const aiSource = await readFile(new URL('lib/ai.js', projectRoot), 'utf8');
const openAiSource = await readFile(new URL('lib/openai.js', projectRoot), 'utf8');
assert.match(examOcrSource, /const OCR_ATTEMPT_TIMEOUT_MS = 40_000/,
  'Mỗi lần thử OCR phải có đủ thời gian nhưng vẫn chừa ngân sách cho fallback');
assert.match(examOcrSource, /const OCR_TOTAL_TIMEOUT_MS = 48_000/,
  'Tổng thời gian OCR phải nằm dưới maxDuration của Vercel');
assert.match(examOcrSource, /process\.env\.GEMINI_OCR_MODEL,[\s\S]*'gemini-3\.5-flash-lite'/,
  'OCR phải giữ model chuyên dụng và model Flash Lite ổn định của TST');
assert.match(examOcrSource, /totalTimeoutMs: OCR_TOTAL_TIMEOUT_MS/,
  'OCR phải áp dụng ngân sách thời gian tổng khi thử nhiều model');
assert.doesNotMatch(examOcrSource, /thinkingLevel:/,
  'OCR không được ép thinkingLevel vì model TST ổn định không hỗ trợ đồng nhất');
assert.match(examOcrSource, /generateOpenAIJson\([\s\S]*imageDataUrl: image/,
  'OCR phải chuyển sang vision fallback khi Gemini chặn RECITATION');
assert.match(aiSource, /finishReason === 'RECITATION' \? 'AI_RECITATION'/,
  'Gemini RECITATION phải được phân loại riêng, không giả dạng lỗi JSON');
assert.match(openAiSource, /type: 'input_image',[\s\S]*image_url:/,
  'OpenAI fallback phải nhận ảnh gốc thay vì chỉ nhận prompt văn bản');
assert.match(examOcrSource, /\['tst', 'regional', 'vmo', 'olympic', 'olympic30', 'duyenhai', 'admission', 'university'\]\.includes\(body\?\.destination\)/,
  'TST, VMO, IMO–Olympic và Đà Nẵng–Quảng Nam phải cùng hỗ trợ tối đa bốn ngày thi');
assert.match(databaseUiSource, /document\.getElementById\('docDestination'\)\?\.value \|\| 'tst'/,
  'Frontend phải gửi đúng kho đích khi OCR đề Đà Nẵng–Quảng Nam');
assert.match(mathOcrSource, /OCR_GEMINI_TIMEOUT_MS = 45_000/);
assert.match(mathOcrSource, /OCR_OPENAI_TIMEOUT_MS = 60_000/);
assert.match(mathOcrSource, /generateOpenAIJson\([\s\S]*imageDataUrl: image/,
  'Math-support OCR must fall back to an independent image-capable provider');
assert.match(dataServiceSource, /MATH_OCR_TIMEOUT_MS = 110_000/,
  'The browser must wait for Gemini and the OCR fallback without aborting at the generic API timeout');
console.log(`Vercel function limit: OK (${count}/12)`);
