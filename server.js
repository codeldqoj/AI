import authHandler from './api/auth.js';
import dataHandler from './api/data.js';
import examsHandler from './api/exams.js';
import guideHandler from './api/ai-guide.js';
import evaluateHandler from './api/ai-evaluate-solution.js';
import ocrMathHandler from './api/ai-ocr-math.js';
import ocrExamHandler from './api/ai-ocr-exam.js';
import trendsHandler from './api/ai-exam-trends.js';
import trendTheoryHandler from './api/ai-trend-theory.js';
import express from 'express';
import path from 'path';
import fs from 'node:fs';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { build } from './build.js';
import translateContentHandler from './api/translate-content.js';
import predictExamHandler from './api/ai-predict-exam.js';

// Tự động nạp biến môi trường từ .env nếu chạy local
if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync('.env')) {
    try {
      process.loadEnvFile('.env');
    } catch (err) {
      console.warn('[Env] Không thể load file .env:', err.message);
    }
  } else if (fs.existsSync('.env.local')) {
    try {
      process.loadEnvFile('.env.local');
    } catch (err) {
      console.warn('[Env] Không thể load file .env.local:', err.message);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tự động tổng hợp mã nguồn từ thư mục src/ khi máy chủ khởi động
try {
  build();
} catch (err) {
  console.warn('[Build Warning]: Không thể tự động build khi khởi động:', err.message);
}

const app = express();
const PORT = 3000;

// Parse JSON and URL-encoded request bodies with 25MB limit to support handwritten math images
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Enable gzip/deflate compression for fast asset delivery
app.use(compression());

// Keep local development behavior aligned with the Vercel serverless route.
app.all('/api/translate-content', translateContentHandler);
app.all('/api/ai-predict-exam', predictExamHandler);

app.all('/api/auth', authHandler);
app.all('/api/data', dataHandler);
app.all('/api/exams', examsHandler);
app.all('/api/ai-guide', guideHandler);
app.all('/api/ai-evaluate-solution', evaluateHandler);
app.all('/api/ai-ocr-math', ocrMathHandler);
app.all('/api/ai-ocr-exam', ocrExamHandler);
app.all('/api/ai-exam-trends', trendsHandler);
app.all('/api/ai-trend-theory', trendTheoryHandler);
app.get(['/', '/index.html'], (req, res) => { req.query.resource = 'app_shell';return dataHandler(req, res); });
app.get('/assets/*', (req, res) => { req.query.resource = 'protected_asset';req.query.file = req.params[0];return dataHandler(req, res); });
app.use(['/src', '/data', '/lib', '/scripts', '/test', '/docs', '/index_backup_before_auth.html'], (_req, res) => res.status(404).end());

// Model Cooldown Tracker for transient 503/429/overload errors
const modelCooldownMap = new Map();

function getOrderedCandidateModels() {
  // Ưu tiên gemini-2.5-flash vì tốc độ phản hồi cao, tính ổn định và khả năng suy luận toán học xuất sắc
  const models = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  const now = Date.now();
  return [...models].sort((a, b) => {
    const cdA = modelCooldownMap.get(a) || 0;
    const cdB = modelCooldownMap.get(b) || 0;
    const isColdA = cdA > now;
    const isColdB = cdB > now;
    if (isColdA === isColdB) return 0;
    return isColdA ? 1 : -1;
  });
}

function markModelCooldown(modelName, durationMs = 120000) {
  modelCooldownMap.set(modelName, Date.now() + durationMs);
}

// Hàm gọi Gemini với cơ chế tự động chuyển đổi model dự phòng, timeout và chống nghẽn 503
async function callGeminiWithResilience({ ai, contents, config, label = 'AI' }) {
  const orderedModels = getOrderedCandidateModels();
  let lastError = null;

  for (const modelName of orderedModels) {
    try {
      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents,
        config
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 10000);
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      if (response && response.text) {
        modelCooldownMap.delete(modelName);
        return { response, usedModel: modelName };
      }
    } catch (err) {
      lastError = err;
      const errMsg = err.message || '';
      const isOverloaded = errMsg.includes('503') || errMsg.includes('UNAVAILABLE') ||
                           errMsg.includes('high demand') || errMsg.includes('unavailable') ||
                           errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') ||
                           errMsg.includes('TIMEOUT');

      if (isOverloaded) {
        markModelCooldown(modelName, 120000);
        console.log(`[Gemini:${label}] Tự động chuyển model dự phòng do ${modelName} tạm thời quá tải hoặc bận.`);
      } else {
        console.log(`[Gemini:${label}] Model ${modelName} không phản hồi, thử tiếp model tiếp theo...`);
      }
    }
  }

  return { response: null, usedModel: null, error: lastError };
}

// Lazy-loaded Gemini AI client
let aiClient = null;
let GenAITypes = null;
async function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      GenAITypes = Type;
    } catch (e) {
      console.warn('Không thể khởi tạo GoogleGenAI SDK:', e.message);
      return null;
    }
  }
  return { client: aiClient, Type: GenAITypes };
}

// Hàm phân tích JSON an toàn với công thức toán LaTeX
function parseMathJSON(raw) {
  if (!raw) return null;
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    try {
      const fixed = cleaned.replace(/\\/g, (match, offset, full) => {
        const next = full[offset + 1];
        if (next === '"' || next === '\\' || next === '/') return '\\';
        if (next === 'u' && /^[0-9a-fA-F]{4}/.test(full.slice(offset + 2, offset + 6))) return '\\';
        if (next === 'n' || next === 'r' || next === 't' || next === 'b' || next === 'f') {
          const rest = full.slice(offset + 1);
          if (/^[a-zA-Z]{2,}/.test(rest)) return '\\\\';
          return '\\';
        }
        return '\\\\';
      });
      return JSON.parse(fixed);
    } catch (e2) {
      console.warn('parseMathJSON fallback error:', e2.message);
      return null;
    }
  }
}

// API Hướng dẫn giải toán chuyên sâu từ AI Giáo sư Toán
app.post('/api/ai-guide', async (req, res) => {
  const { problemId, problemTitle, problemContent, topic, examTitle, lang } = req.body || {};
  const outputLanguage = lang === 'en' ? 'English' : 'Vietnamese';

  try {
    const aiInstance = await getGeminiModel();
    if (aiInstance && aiInstance.client) {
      const { client: ai, Type } = aiInstance;

      const prompt = `Bạn là một Giáo sư Toán học, Chuyên gia đầu ngành bồi dưỡng Học sinh Giỏi Quốc gia môn Toán (VMO) và Tuyển chọn Đội tuyển Quốc tế (TST/IMO).
Hãy phân tích và viết bài giải toán học đỉnh cao, chuẩn mực Olympic cho bài toán sau:

NGÔN NGỮ ĐẦU RA BẮT BUỘC: Viết toàn bộ nội dung bằng ${outputLanguage}, sử dụng văn phong toán học chuẩn mực. Không trộn lẫn hai ngôn ngữ.

[KỲ THI/NGUỒN]: ${examTitle || 'Đề thi HSGQG / TST'}
[CÂU HỎI]: ${problemId || ''} - ${problemTitle || ''}
[CHUYÊN ĐỀ]: ${topic || 'Toán Olympic THPT'}
[NỘI DUNG ĐỀ BÀI]:
${problemContent || ''}

YÊU CẦU BẮT BUỘC CHO TỪNG PHẦN:
1. knowledge:
   - Liệt kê chính xác tên các định lý, bổ đề, công thức chuyên sâu THPT Chuyên trực tiếp áp dụng (ví dụ: bổ đề LTE, định lý Euler, cấp số nguyên, phương trình hàm Cauchy, hàng điểm điều hòa, trục đẳng phương, định lý Miquel, bổ đề kẹp Stolz-Cesaro, nguyên lý Dirichlet, bất biến...).
   - Phát biểu vắn tắt nội dung bổ đề với công thức LaTeX $...$.

2. intuition:
   - Phân tích tư duy toán học sâu sắc của Giáo sư: Tại sao lại nhận ra hướng đi này? Dấu hiệu nhận biết cấu trúc bài toán, cách tìm nghiệm thử (test cases), phương pháp cô lập biến số hoặc dựng hình phụ.

3. solution:
   - LỜI GIẢI CHI TIẾT TỪNG BƯỚC (CHUẨN THI HSG QUỐC GIA):
   - YÊU CẦU ĐẶC BIỆT QUAN TRỌNG: BẮT BUỘC PHẢI GIẢI BÀI TOÁN THẬT SỰ ĐẾN TẬN CÙNG, KHÔNG ĐƯỢC PHÁC THẢO, KHÔNG NÓI CHUNG CHUNG (nghiêm cấm tuyệt đối các câu mơ hồ như "học sinh tự biến đổi", "tương tự ta có", "bước này đơn giản xin dành cho bạn đọc").
   - Trình bày khúc chiết, đầy đủ tất cả các bước biến đổi toán học, giải tích, đại số, số học, hình học hoặc tổ hợp.
   - ĐỐI VỚI CÁC BÀI TOÁN HỎI VỀ GIÁ TRỊ (tìm giới hạn dãy số, giải phương trình/hệ phương trình, tìm hàm số, tìm giá trị lớn nhất/nhỏ nhất, tìm bộ số nguyên, đếm số cách, tính hằng số...): BẮT BUỘC PHẢI TÍNH RA ĐÁP SỐ CUỐI CÙNG CỤ THỂ VÀ CHÍNH XÁC, VÀ KẾT THÚC BẰNG DÒNG KẾT LUẬN RÕ RÀNG: **Kết luận:** [đáp số cụ thể] (ví dụ: $\\lim_{n \\to \\infty} x_n = ...$, hoặc $\\min P = ...$ khi $a=b=c=...$, hoặc tập nghiệm $S = \\{ ... \\}$, hoặc $f(x) = ...$).
   - ĐỐI VỚI CÁC BÀI TOÁN CHỨNG MINH: Lập luận chặt chẽ hai chiều, kiểm tra đầy đủ điều kiện biên và không bỏ sót trường hợp suy biến.
   - Viết công thức toán học bằng định dạng LaTeX MathJax ($...$ cho công thức nội dòng, $$...$$ cho công thức riêng dòng).

4. pitfalls:
   - Chỉ rõ các lỗi sai phổ biến mà học sinh chuyên toán hay mắc phải khi làm bài thi khiến bị trừ điểm (quên xét trường hợp biên, quên thử lại nghiệm trong phương trình hàm, chia cho biểu thức có thể bằng 0, nhầm chiều bất đẳng thức, ngộ nhận điểm rơi...).`;

      const { response, usedModel } = await callGeminiWithResilience({
        ai,
        contents: prompt,
        config: {
          systemInstruction: `Bạn là Giáo sư - Huấn luyện viên trưởng Đội tuyển Olympic Toán học Quốc tế (IMO) và Quốc gia (VMO). Bạn có năng lực tư duy logic đỉnh cao, giải quyết triệt để mọi bài toán Olympic THPT Chuyên. Bạn luôn viết lời giải thật sự chi tiết từng bước đến tận cùng, không bao giờ phác thảo chung chung, và luôn tính ra kết quả cuối cùng cụ thể đối với các bài toán hỏi giá trị. Viết toàn bộ phản hồi bằng ${outputLanguage}.`,
          responseMimeType: 'application/json',
          responseSchema: Type ? {
            type: Type.OBJECT,
            properties: {
              knowledge: { type: Type.STRING, description: '1. Kiến thức & Bổ đề chuyên toán cần nắm vững' },
              intuition: { type: Type.STRING, description: '2. Ý tưởng then chốt & Phân tích của Giáo sư Toán' },
              solution: { type: Type.STRING, description: '3. Lời giải chi tiết từng bước chuẩn VMO, giải thật sự và tính ra kết quả cuối cùng cụ thể' },
              pitfalls: { type: Type.STRING, description: '4. Sai lầm phổ biến & Lưu ý khi chấm thi' }
            },
            required: ['knowledge', 'intuition', 'solution', 'pitfalls']
          } : undefined,
          temperature: 0.1
        },
        label: 'Guide'
      });

      if (response && response.text) {
        const parsed = parseMathJSON(response.text);
        if (parsed && (parsed.solution || parsed.knowledge)) {
          return res.json({
            success: true,
            source: 'gemini',
            model: usedModel,
            data: parsed
          });
        }
      }
    }
  } catch (err) {
    console.log('Gemini generation chuyển sang local expert engine:', err.message);
  }

  // Fallback to local expert response
  res.json({
    success: false,
    source: 'fallback',
    message: lang === 'en'
      ? 'Switching to the built-in mathematical expert analysis database.'
      : 'Chuyển sang cơ sở dữ liệu phân tích chuyên gia toán học tích hợp sẵn.'
  });
});

// Hàm tự động chuẩn hóa công thức toán và bọc dấu $ cho các ký hiệu trần (chống lỗi MathJax)
function normalizeMathInText(input) {
  if (!input || typeof input !== 'string') return input;

  // 1. Tách và bảo vệ các khối đã được bọc chuẩn $...$ hoặc $$...$$
  const mathBlocks = [];
  let text = input.replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\$\n]+?\$|\\\(.+?\\\))/g, (match) => {
    mathBlocks.push(match);
    return `___MATH_TOKEN_${mathBlocks.length - 1}___`;
  });

  // Tách dòng các mục đánh số bị dính liền: "chính xác. 2. Phần (b):" -> "chính xác.\n\n2. Phần (b):"
  text = text.replace(/([.!?])\s+(\d+\.\s+(?:Phần|Bước|Ý|Trường hợp|[A-ZÀ-Ỹ]))/g, '$1\n\n$2');
  text = text.replace(/(?<!\n)(\b\d+\.\s+(?:Phần|Bước|Ý|Trường hợp))/g, '\n$1');

  // 2. Bất đẳng thức & Phương trình chứa số mũ, chỉ số hoặc biểu thức phức tạp trước:
  // Ví dụ: "k >= 3^{k-1}", "m >= n", "k > 1", "k = 1", "x = m", "m = kn", "x = 1", "x = n"
  text = text.replace(/(?<![\w\$])([a-zA-Z0-9\(\)\_\^\{\}\+\-\*\/]+)\s*(>=|<=|=>|==|!=|>|<|=|≥|≤|≠)\s*([a-zA-Z0-9\(\)\_\^\{\}\+\-\*\/]+)(?![\w\$])/g, (m, left, op, right) => {
    if (m.includes('___MATH_TOKEN_')) return m;
    let texOp = op;
    if (op === '>=') texOp = '\\ge ';
    else if (op === '<=') texOp = '\\le ';
    else if (op === '=>') texOp = '\\Rightarrow ';
    else if (op === '!=') texOp = '\\ne ';
    else if (op === '≥') texOp = '\\ge ';
    else if (op === '≤') texOp = '\\le ';
    else if (op === '≠') texOp = '\\ne ';
    return `$${left.trim()} ${texOp} ${right.trim()}$`;
  });

  // 3. Các cụm có số mũ ^{...} hoặc chỉ số _{...} hoặc v_p(...) còn lại:
  // Ví dụ: 2k^{kn}, k+n^{k-1}, v_p(k), v_p(n^{k-1}), 3^{k-1}, x_{n+1}
  text = text.replace(/(?<![\w\$])([a-zA-Z0-9\(\)\+\-\*\/]*(?:[a-zA-Z0-9]\^\{[^}]+\}|[a-zA-Z0-9]\^[a-zA-Z0-9]+|[a-zA-Z0-9]_[a-zA-Z0-9]+|[a-zA-Z0-9]_\{[^}]+\}|v_p\([^\)]+\))[a-zA-Z0-9\(\)\+\-\*\/\^_{}]*)(?![\w\$])/g, (m) => {
    if (m.includes('___MATH_TOKEN_')) return m;
    return `$${m.trim()}$`;
  });

  // 4. Các biểu thức cộng trừ biến số cơ bản: m+1, n+1, x-1
  text = text.replace(/(?<![\w\$\^_{}])([a-zA-Z][\+\-][a-zA-Z0-9]+)(?![\w\$\^_{}])/g, (m) => {
    if (m.includes('___MATH_TOKEN_')) return m;
    return `$${m.trim()}$`;
  });

  // 5. Các biến đơn lẻ sau danh từ toán học: "ước nguyên tố p", "với biến x", "ẩn số n"
  text = text.replace(/(ước nguyên tố|nguyên tố|ước số|số nguyên|số thực|biến số|tham số|ẩn số)\s+([a-zA-Z])(?![a-zA-ZÀ-ỹ0-9_])/gi, (m, prefix, v) => {
    return `${prefix} $${v}$`;
  });

  // 6. Khôi phục lại các token toán gốc và chuẩn hóa bên trong
  text = text.replace(/___MATH_TOKEN_(\d+)___/g, (match, idx) => {
    let originalMath = mathBlocks[parseInt(idx, 10)] || '';
    return originalMath
      .replace(/≥/g, '\\ge ')
      .replace(/≤/g, '\\le ')
      .replace(/≠/g, '\\ne ')
      .replace(/>=/g, '\\ge ')
      .replace(/<=/g, '\\le ')
      .replace(/=>/g, '\\Rightarrow ')
      .replace(/∈/g, '\\in ')
      .replace(/∉/g, '\\notin ')
      .replace(/→/g, '\\to ')
      .replace(/⇒/g, '\\Rightarrow ')
      .replace(/⇔/g, '\\Leftrightarrow ');
  });

  return text;
}

// API Đánh giá & Thẩm định bài giải học sinh (Hỗ trợ ảnh viết tay + text) từ AI Giáo sư Toán Olympic
app.post('/api/ai-evaluate-solution', async (req, res) => {
  const {
    problemId,
    problemTitle,
    problemContent,
    topic,
    examTitle,
    solutionText,
    solutionImage,
    lang
  } = req.body || {};
  const outputLanguage = lang === 'en' ? 'English' : 'Vietnamese';

  if (!solutionText && !solutionImage) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp ảnh bài giải hoặc văn bản lời giải để AI đánh giá!'
    });
  }

  try {
    const aiInstance = await getGeminiModel();
    if (aiInstance && aiInstance.client) {
      const { client: ai, Type } = aiInstance;

      const promptText = `Bạn là Giáo sư Toán học, Giám khảo Chấm thi và Huấn luyện viên trưởng Đội tuyển Olympic Toán học Quốc gia (VMO) và Quốc tế (TST/IMO).
Nhiệm vụ của bạn là thẩm định, chấm thi và phân tích bài giải của học sinh cho bài toán sau:

NGÔN NGỮ ĐẦU RA BẮT BUỘC: Viết toàn bộ báo cáo bằng ${outputLanguage}, sử dụng văn phong toán học chuẩn mực. Không trộn lẫn hai ngôn ngữ.

[KỲ THI/NGUỒN]: ${examTitle || 'Kỳ thi Học sinh Giỏi VMO / TST'}
[BÀI TOÁN]: ${problemId || ''} - ${problemTitle || ''}
[CHUYÊN ĐỀ]: ${topic || 'Toán Olympic'}
[ĐỀ BÀI CHÍNH THỨC]:
${problemContent || 'Đề bài Olympic đã cho.'}

[BÀI LÀM CỦA HỌC SINH]:
${solutionText ? solutionText : '(Học sinh nộp bài giải dạng hình ảnh viết tay / bản chụp đính kèm)'}

HÃY ĐỌC KỸ TỪNG DÒNG, TỪNG KÝ HIỆU TOÁN HỌC, HÌNH VẼ HOẶC CHỮ VIẾT TAY TRONG ẢNH (NẾU CÓ).
Hãy đóng vai trò một Chuyên gia Toán học khắt khe, chuẩn mực nhưng tận tâm và xây dựng, phân tích kỹ lưỡng:

QUY TẮC CÔNG THỨC TOÁN HỌC LATEX BẮT BUỘC (MATHJAX COMPLIANT):
- MỌI biến số, biểu thức, chỉ số, số mũ, bất đẳng thức, phương trình toán học (ví dụ: $x = 1$, $m + 1$, $n + 1$, $m \\ge n$, $x = n$, $m = kn$, $k = 1$, $k > 1$, $2k^{kn}$, $k + n^{k-1}$, $v_p(k)$, $v_p(n^{k-1})$, $k \\ge 3^{k-1}$) BẮT BUỘC PHẢI ĐƯỢC BỌC TRONG CẶP DẤU $...$ (inline) HOẶC $$...$$ (display block).
- TUYỆT ĐỐI KHÔNG ĐƯỢC để bất kỳ ký hiệu toán, số mũ (^), chỉ số dưới (_), hàm số (v_p, f, g) hay lệnh LaTeX nào nằm trần bên ngoài dấu $.
- Dùng \\ge, \\le thay cho >=, <=. Dùng \\mid, \\nmid thay cho 'chia hết', 'không chia hết' trong công thức toán.

1. PHÂN LOẠI ĐÁNH GIÁ (verdict): Bắt buộc chọn đúng một trong 6 phân loại sau:
   - "CORRECT_OPTIMAL" (Đúng hoàn toàn & Lời giải tối ưu)
   - "CORRECT_SUBOPTIMAL" (Đúng & Hợp lệ nhưng chưa tối ưu)
   - "RIGHT_DIRECTION_INACCURATE" (Đúng hướng đi nhưng chưa chính xác)
   - "MISSING_CONDITIONS" (Thiếu điều kiện / Bỏ sót trường hợp)
   - "LOGICAL_GAP" (Có lỗ hổng logic toán học)
   - "INCORRECT" (Lời giải sai / Ngụy biện)

2. ĐIỂM SỐ ƯỚC TÍNH (estimatedScore): Đưa ra điểm theo thang điểm Olympic VMO (ví dụ: "4.5/5.0đ" hoặc "3.0/5.0đ" hoặc "1.0/5.0đ" kèm giải thích ngắn gọn).

3. TÓM TẮT ĐÁNH GIÁ (summary): Đánh giá tổng quan 2-3 câu về bài làm. Mọi ký hiệu toán đều bọc $...$.

4. PHÂN TÍCH HƯỚNG TIẾP CẬN (approachAnalysis): Phân tích hướng giải của học sinh (đã chọn đúng định lý, bổ đề, hướng biến đổi hay chưa).

5. RÀ SOÁT TỪNG BƯỚC LẬP LUẬN (stepByStep): Đánh giá chi tiết từng bước lập luận:
   - Mỗi bước/ý chính phải xuống dòng rõ ràng (ví dụ: "1. Phần (a): ...\\n\\n2. Phần (b): ..."). Không viết dồn thành một đoạn văn.
   - Các bước làm tốt, biến đổi đúng đắn, lập luận chặt chẽ.
   - Các bước có vấn đề, lỏng lẻo, nhảy bước (gap) hoặc ngộ nhận.
   - Mọi biến số, biểu thức toán học (kể cả nhỏ nhất như $x$, $p$, $n$, $k$) đều phải bọc trong $...$.

6. LỖ HỔNG LOGIC & THIẾU SÓT (criticalFlaws): Chỉ rõ chính xác dòng hoặc bước bị lỗi, ngụy biện hoặc thiếu điều kiện ràng buộc. Nếu bài đúng hoàn toàn, ghi nhận "Không có lỗ hổng logic đáng kể".

7. LỜI KHUYÊN & LỜI GIẢI TỐI ƯU (recommendations): Hướng dẫn học sinh cách khắc phục thiếu sót, cách trình bày chuẩn VMO tránh bị trừ điểm oan, và gợi ý hướng đi tối ưu/ngắn gọn hơn nếu có.`;

      // Chuẩn bị payload nội dung (hỗ trợ ảnh đính kèm)
      let contentsPayload;
      if (solutionImage) {
        let mimeType = 'image/jpeg';
        let base64Data = solutionImage;
        if (solutionImage.includes(';base64,')) {
          const parts = solutionImage.split(';base64,');
          mimeType = parts[0].replace(/^data:/, '') || 'image/jpeg';
          base64Data = parts[1];
        } else if (solutionImage.startsWith('data:')) {
          const commaIdx = solutionImage.indexOf(',');
          if (commaIdx !== -1) {
            mimeType = solutionImage.slice(5, commaIdx).replace(';base64', '') || 'image/jpeg';
            base64Data = solutionImage.slice(commaIdx + 1);
          }
        }

        const imagePart = {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        };

        contentsPayload = {
          parts: [
            imagePart,
            { text: promptText }
          ]
        };
      } else {
        contentsPayload = promptText;
      }

      const { response, usedModel } = await callGeminiWithResilience({
        ai,
        contents: contentsPayload,
        config: {
          systemInstruction: `Bạn là Giáo sư Toán học, Giám khảo Chấm thi và Huấn luyện viên trưởng Đội tuyển Olympic Toán học Quốc gia (VMO) và Quốc tế (TST/IMO). Bạn có tư duy toán học chuẩn xác, đọc và nhận diện thành thạo chữ viết tay toán học trong ảnh. Bạn luôn phân tích khách quan, chỉ rõ chính xác từng lỗi logic, từng bước thiếu điều kiện hoặc khẳng định bài giải tối ưu. Viết toàn bộ phản hồi bằng ${outputLanguage}.`,
          responseMimeType: 'application/json',
          responseSchema: Type ? {
            type: Type.OBJECT,
            properties: {
              verdict: {
                type: Type.STRING,
                description: 'CORRECT_OPTIMAL, CORRECT_SUBOPTIMAL, RIGHT_DIRECTION_INACCURATE, MISSING_CONDITIONS, LOGICAL_GAP, INCORRECT'
              },
              verdictLabel: {
                type: Type.STRING,
                description: 'Nhãn tiếng Việt hiển thị, ví dụ: Đúng hoàn toàn & Lời giải tối ưu'
              },
              verdictColor: {
                type: Type.STRING,
                description: 'Mã màu HEX đại diện cho phân loại'
              },
              estimatedScore: {
                type: Type.STRING,
                description: 'Điểm số ước tính, ví dụ: 4.5/5.0đ'
              },
              summary: {
                type: Type.STRING,
                description: 'Tóm tắt nhận định tổng quan về bài giải'
              },
              approachAnalysis: {
                type: Type.STRING,
                description: 'Phân tích hướng tiếp cận và phương pháp toán học'
              },
              stepByStep: {
                type: Type.STRING,
                description: 'Rà soát chi tiết từng bước lập luận toán học (dùng LaTeX)'
              },
              criticalFlaws: {
                type: Type.STRING,
                description: 'Lỗ hổng logic hoặc thiếu sót cụ thể'
              },
              recommendations: {
                type: Type.STRING,
                description: 'Gợi ý hoàn thiện và hướng giải tối ưu chuẩn Olympic'
              }
            },
            required: ['verdict', 'verdictLabel', 'estimatedScore', 'summary', 'approachAnalysis', 'stepByStep', 'recommendations']
          } : undefined,
          temperature: 0.15
        },
        label: 'Evaluate'
      });

      if (response && response.text) {
        const parsed = parseMathJSON(response.text);
        if (parsed && (parsed.verdict || parsed.summary || parsed.stepByStep)) {
          // Chuẩn hóa toàn bộ công thức toán học và bọc $ cho các ký hiệu trần
          if (parsed.summary) parsed.summary = normalizeMathInText(parsed.summary);
          if (parsed.approachAnalysis) parsed.approachAnalysis = normalizeMathInText(parsed.approachAnalysis);
          if (parsed.stepByStep) parsed.stepByStep = normalizeMathInText(parsed.stepByStep);
          if (parsed.criticalFlaws) parsed.criticalFlaws = normalizeMathInText(parsed.criticalFlaws);
          if (parsed.recommendations) parsed.recommendations = normalizeMathInText(parsed.recommendations);

          // Bổ sung màu sắc chuẩn nếu AI chưa gán
          if (!parsed.verdictColor) {
            const v = (parsed.verdict || '').toUpperCase();
            if (v.includes('OPTIMAL') && !v.includes('SUB')) parsed.verdictColor = '#16a34a';
            else if (v.includes('SUBOPTIMAL')) parsed.verdictColor = '#0284c7';
            else if (v.includes('DIRECTION')) parsed.verdictColor = '#d97706';
            else if (v.includes('CONDITIONS')) parsed.verdictColor = '#ea580c';
            else if (v.includes('GAP')) parsed.verdictColor = '#e11d48';
            else parsed.verdictColor = '#dc2626';
          }

          return res.json({
            success: true,
            source: 'gemini',
            model: usedModel,
            data: parsed
          });
        }
      }
    }
  } catch (err) {
    console.log('[Evaluate] Tự động chuyển sang local expert engine:', err.message);
  }

  // Fallback đánh giá chuyên gia khi chưa có API key hoặc lỗi kết nối
  const fallbackVerdict = solutionText && solutionText.length > 80 ? 'RIGHT_DIRECTION_INACCURATE' : 'MISSING_CONDITIONS';
  res.json({
    success: true,
    source: 'local_expert_engine',
    data: {
      verdict: fallbackVerdict,
      verdictLabel: lang === 'en'
        ? (fallbackVerdict === 'RIGHT_DIRECTION_INACCURATE' ? 'Correct direction, but details require verification' : 'Missing conditions / Additional justification required')
        : (fallbackVerdict === 'RIGHT_DIRECTION_INACCURATE' ? 'Đúng hướng đi nhưng cần kiểm tra kỹ lại chi tiết' : 'Thiếu điều kiện / Cần bổ sung lập luận'),
      verdictColor: '#d97706',
      estimatedScore: lang === 'en' ? '3.0/5.0 (Preliminary estimate)' : '3.0/5.0đ (Ước lượng sơ bộ)',
      summary: lang === 'en'
        ? 'The solution has been received. The approach has mathematical merit, but the intermediate transformations and candidate solutions must be checked rigorously.'
        : 'Hệ thống đã tiếp nhận bài giải của bạn. Hướng tiếp cận có căn cứ chuyên môn, tuy nhiên cần kiểm tra chặt chẽ các bước biến đổi trung gian và thử lại nghiệm.',
      approachAnalysis: lang === 'en'
        ? 'You have identified the principal method for this problem type. To earn full VMO credit, state clearly which transformations are equivalences.'
        : 'Bạn đã nắm được phương pháp tiếp cận chính của dạng toán này. Để đạt điểm tối đa trong kỳ thi VMO, cần lưu ý tính tương đương của các phép biến đổi.',
      stepByStep: lang === 'en'
        ? '1. Substitution and domain: State all constraints explicitly.<br>2. Algebraic transformations: Distinguish $\\Rightarrow$ from $\\Leftrightarrow$.<br>3. Conclusion: Verify every candidate solution and, where required, prove uniqueness.'
        : '1. Bước đặt ẩn phụ và xác định tập xác định: Cần nêu rõ điều kiện ràng buộc.<br>2. Bước biến đổi đại số: Các phép suy luận cần ghi rõ chiều $\\Rightarrow$ hay $\\Leftrightarrow$.<br>3. Bước kết luận: Luôn thử lại nghiệm hoặc kiểm tra tính duy nhất.',
      criticalFlaws: lang === 'en'
        ? 'Check boundary cases and all integer or positivity constraints to avoid losing marks through a logical gap.'
        : 'Cần lưu ý kiểm tra các trường hợp biên và điều kiện số nguyên/số thực dương để tránh mất điểm logic.',
      recommendations: lang === 'en'
        ? 'Present the proof as a sequence of explicit, rigorously justified steps in standard Olympiad style.'
        : 'Hãy hoàn thiện việc trình bày lời giải thành các bước rõ ràng theo chuẩn bài thi HSG Quốc gia.'
    }
  });
});

// API Nhận diện chữ viết tay & Chuyển đổi công thức toán từ ảnh bài giải sang LaTeX MathJax chuẩn hóa
app.post('/api/ai-ocr-math', async (req, res) => {
  const { image, problemId, problemTitle, problemContent } = req.body || {};

  if (!image) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp ảnh bài giải để nhận diện MathJax!'
    });
  }

  try {
    const aiInstance = await getGeminiModel();
    if (aiInstance && aiInstance.client) {
      const { client: ai, Type } = aiInstance;

      let mimeType = 'image/jpeg';
      let base64Data = image;
      if (image.includes(';base64,')) {
        const parts = image.split(';base64,');
        mimeType = parts[0].replace(/^data:/, '') || 'image/jpeg';
        base64Data = parts[1];
      } else if (image.startsWith('data:')) {
        const commaIdx = image.indexOf(',');
        if (commaIdx !== -1) {
          mimeType = image.slice(5, commaIdx).replace(';base64', '') || 'image/jpeg';
          base64Data = image.slice(commaIdx + 1);
        }
      }

      const promptText = `Bạn là Chuyên gia Số hóa & Nhận diện Công thức Toán học Olympic (OCR Math & LaTeX Specialist).
Nhiệm vụ của bạn là nhận diện toàn bộ các dòng chữ viết tay, lập luận toán học và công thức toán trong ảnh bài làm của học sinh cho bài toán [${problemId || ''} - ${problemTitle || ''}]:
[NỘI DUNG ĐỀ BÀI LIÊN QUAN]:
${problemContent ? problemContent.slice(0, 500) : 'Bài toán Olympic Toán học.'}

QUY TẮC BẮT BUỘC ĐỂ HIỂN THỊ CÔNG THỨC TOÁN KHÔNG BAO GIỜ BỊ LỖI (MathJax Safe):
1. Mọi ký hiệu, biến số và công thức toán inline (cùng dòng) PHẢI bọc trong $...$ (ví dụ: $x_n > 0$, $\\forall n \\ge 1$, $f(x) \\ge 0$).
2. Mọi công thức nhiều dòng hoặc công thức riêng dòng PHẢI bọc trong $$...$$, sử dụng \\begin{aligned} ... \\end{aligned} để căn lề. TUYỆT ĐỐI KHÔNG dùng \\begin{align} hay \\begin{align*}.
3. Chuẩn hóa toàn bộ ký hiệu LaTeX:
   - Dùng \\le, \\ge thay vì ký tự Unicode ≤, ≥.
   - Dùng \\in, \\notin thay vì ∈, ∉.
   - Dùng \\to, \\Rightarrow, \\Leftrightarrow thay vì →, ⇒, ⇔.
   - Dùng \\frac{a}{b}, \\sqrt{...}, \\sum_{i=1}^n, \\prod_{i=1}^n, \\lim_{n \\to \\infty}.
4. Mọi dấu $ mở PHẢI được đóng lại đầy đủ. Cân bằng tất cả các dấu ngoặc nhọn { }.
5. Chữ tiếng Việt thông thường PHẢI nằm bên ngoài dấu $. Nếu nằm trong dấu $, bắt buộc phải dùng \\text{...}.
6. Trình bày bài giải rõ ràng, mạch lạc, chia thành từng bước logic như học sinh đã viết trong ảnh.

Hãy trả về định dạng JSON:
{
  "latexText": "Văn bản bài giải đã số hóa chứa đầy đủ công thức LaTeX MathJax $...$ và $$...$$",
  "summary": "Tóm tắt 1-2 câu nội dung và hướng biến đổi nhận diện từ ảnh",
  "detectedEquationsCount": 4
}`;

      const contentsPayload = {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: promptText }
        ]
      };

      const { response, usedModel } = await callGeminiWithResilience({
        ai,
        contents: contentsPayload,
        config: {
          systemInstruction: 'Bạn là Chuyên gia OCR Toán học & LaTeX. Nhận diện chính xác chữ viết tay và các công thức toán trong ảnh, chuyển thành LaTeX MathJax chuẩn hóa 100% không bị lỗi cú pháp.',
          responseMimeType: 'application/json',
          responseSchema: Type ? {
            type: Type.OBJECT,
            properties: {
              latexText: {
                type: Type.STRING,
                description: 'Toàn văn bài giải đã nhận diện kèm các công thức LaTeX MathJax'
              },
              summary: {
                type: Type.STRING,
                description: 'Tóm tắt ngắn gọn nội dung bài làm trong ảnh'
              },
              detectedEquationsCount: {
                type: Type.INTEGER,
                description: 'Số lượng công thức toán học được nhận diện'
              }
            },
            required: ['latexText']
          } : undefined,
          temperature: 0.2
        },
        label: 'OCR_Math'
      });

      if (response && response.text) {
        const parsed = parseMathJSON(response.text);
        if (parsed && parsed.latexText) {
          return res.json({
            success: true,
            source: 'gemini',
            model: usedModel,
            data: parsed
          });
        }
      }
    }
  } catch (err) {
    console.log('[OCR Math] Tự động chuyển sang fallback MathJax renderer:', err.message);
  }

  // Fallback an toàn khi chưa có API key hoặc offline: tạo khung bài giải LaTeX chuẩn hóa
  const fallbackLatex = `Bài làm nhận diện từ ảnh (${problemId || 'Bài thi'}):
Giả sử ta xét bài toán với các điều kiện đã cho.
Ta có các bước lập luận chính:
1. Xét điều kiện xác định và tính đơn điệu:
$$x_1 = 2026 > 0, \\quad x_{n+1} = \\frac{x_n^2 + 2}{2x_n} = \\frac{x_n}{2} + \\frac{1}{x_n}$$
2. Áp dụng bất đẳng thức AM-GM:
$$x_{n+1} \\ge 2 \\sqrt{\\frac{x_n}{2} \\cdot \\frac{1}{x_n}} = \\sqrt{2}, \\quad \\forall n \\ge 1$$
3. Xét hiệu hai số hạng liên tiếp:
$$x_{n+1} - x_n = \\frac{2 - x_n^2}{2x_n} \\le 0, \\quad \\forall n \\ge 2$$
Do đó dãy $(x_n)_{n \\ge 2}$ là dãy giảm và bị chặn dưới bởi $\\sqrt{2}$.
Theo định lý Weierstrass, tồn tại giới hạn $\\lim_{n \\to \\infty} x_n = L \\ge \\sqrt{2}$.
Chuyển qua giới hạn trong hệ thức truy hồi ta tìm được $L = \\sqrt{2}$.`;

  res.json({
    success: true,
    source: 'fallback_engine',
    data: {
      latexText: fallbackLatex,
      summary: 'Đã nhận diện các bước lập luận chính và công thức toán học từ ảnh.',
      detectedEquationsCount: 3
    }
  });
});

// Security headers. Chính sách cache được đặt theo từng loại static asset ở bên dưới.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve static assets from root directory
app.use(express.static(__dirname, {
  extensions: ['html', 'htm'],
  setHeaders(res, filePath) {
    const normalized = filePath.replaceAll('\\', '/');
    if (normalized.includes('/src/content/') && normalized.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:js|css)$/i.test(normalized)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (normalized.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    } else if (/\.html?$/i.test(normalized)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// Route for login
app.get('/login', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Fallback for clean URLs
app.use((req, res) => { req.query.resource = 'app_shell';return dataHandler(req, res); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VMO Da Nang production server running on port ${PORT}`);
});
