import { allows } from '../lib/education-access.js';
import { MATH_SUPPORT_TOPICS } from '../lib/math-support-topics.js';
import { normalizeStandaloneMath } from '../lib/ocr-normalization.js';
import { getSession } from '../lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from '../lib/ai.js';
import { generateOpenAIJson } from '../lib/openai.js';

const OCR_GEMINI_TIMEOUT_MS = 45_000;
const OCR_OPENAI_TIMEOUT_MS = 60_000;

const schema = {
  type: 'object',
  properties: { latexText: { type: 'string' }, summary: { type: 'string' }, confidence: { type: 'string' } },
  required: ['latexText', 'summary', 'confidence']
};

// Gemini đôi khi trả một dòng TeX thuần (ví dụ \\boxed{...}) không có
// delimiter. Chuẩn hóa ở API để mọi client đều nhận được MathJax hợp lệ.
function normalizeOcrLatex(value) {
  let text = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!text) return text;
  text = text.replace(/\\\$/g, '$');
  // Một số phản hồi OCR mã hóa xuống dòng thành hai ký tự "\\n".
  text = text.replace(/\\n(?!(?:e)(?:\s|$|[,.;:]))(?=[A-Za-z\\])/g, '\n');
  text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
    .replace(/(?<!\$\$|\\\[)\s*(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})\s*(?!\$\$|\\\])/g, (_, block) => `\n$$\n${block}\n$$\n`);
  const mathParts = [];
  text = text.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?:\\.|[^$])+\$)/g, match => {
    mathParts.push(match);
    return `\uE000${mathParts.length - 1}\uE001`;
  });
  // Văn bản OCR như \\text{Giải.} phải nằm ngoài LaTeX math.
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
  const lines = text.split(/\r?\n/);
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^\$\$|^\$|^\\\[|^\\\(/.test(trimmed)) return line;
    // Các dòng chỉ chứa một biểu thức TeX phải là display math.
    if (/^\\(?:boxed|fbox|frac|sqrt|sum|prod|lim|left|right|text)\b/.test(trimmed)) {
      return `$$\n${trimmed}\n$$`;
    }
    return line;
  }).join('\n');
}

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const session = await getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!allows(session, 'shared')) return res.status(403).json({ success: false, error: 'Tài khoản chưa được cấp quyền cấp học' });
  if (!checkRateLimit(session.username, 8)) return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu quá nhanh' });
  const body = parseBody(req);
  const image = text(body?.image || body?.solutionImage, 4_000_000);
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ success: false, error: 'Thiếu ảnh JPEG, PNG hoặc WEBP dạng base64' });
  const standalone = body?.purpose === 'standalone_problem';
  const ocrSchema = standalone ? { ...schema, properties: { ...schema.properties, topic: { type: 'string', enum: [...MATH_SUPPORT_TOPICS, ''] } }, required: [...schema.required, 'topic'] } : schema;
  const topicPrompt = ` Phân loại chuyên đề chính của ĐỀ BÀI dựa trên nội dung, không chỉ dựa vào từ khóa, và trả topic đúng một nhãn: ${MATH_SUPPORT_TOPICS.join('; ')}. Dãy số thực, hội tụ, giới hạn thuộc Dãy số và Giới hạn dãy số; dãy số nguyên với chia hết, đồng dư, số nguyên tố thuộc Số học và dãy số. Bài xác định hàm thỏa đẳng thức với mọi biến thuộc Phương trình hàm; bài nghiên cứu nghiệm, hệ số của đa thức thuộc Đa thức. Hình học tam giác, đường tròn thuộc Hình học phẳng; đếm, đồ thị, tô màu, trò chơi thuộc Tổ hợp. Nếu ảnh không rõ hoặc bài không thuộc bảy nhóm trên, trả topic rỗng để người dùng chọn; Bài chứng minh bất đẳng thức, tìm giá trị lớn nhất/nhỏ nhất của biểu thức đại số, AM-GM, Cauchy–Schwarz, Jensen thuộc Bất đẳng thức; không nhầm với Đa thức chỉ vì có số mũ hoặc biểu thức đa thức.`;
  const prompt = `Đọc chính xác toàn bộ bài toán/bài giải viết tay trong ảnh. Trả về latexText để hiển thị trực tiếp bằng MathJax.
Quy tắc bắt buộc: công thức nội dòng phải đặt trong $...$; công thức riêng dòng phải đặt trong $$...$$; không được để \\boxed, \\frac, chỉ số, số mũ hoặc lệnh LaTeX trần ngoài delimiter; không dùng align/align* (dùng aligned); dùng \\le, \\ge, \\in, \\ne, \\to; chữ tiếng Việt nằm ngoài công thức hoặc trong \\text{...}. Giữ nguyên nội dung nhìn thấy, không tự suy diễn. Trả summary ngắn và confidence.${standalone ? ' Đây là ảnh một đề bài riêng lẻ, không giải bài toán. Văn bản tiếng Việt đặt ngoài công thức. Dùng ký tự xuống dòng thật giữa các đoạn; không dùng lệnh LaTeX xuống dòng trong văn bản, không thêm gạch đầu dòng ngoài ảnh. Mỗi công thức phải có cặp delimiter cân bằng: $...$ hoặc $$...$$.' + topicPrompt : ''}`;
  try {
    const contents = { parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: prompt }] };
    let result;
    let source = 'gemini';
    try {
      result = await generateJson({
        contents, schema: ocrSchema, timeoutMs: OCR_GEMINI_TIMEOUT_MS, totalTimeoutMs: OCR_GEMINI_TIMEOUT_MS,
        models: [process.env.GEMINI_OCR_MODEL || 'gemini-3.5-flash-lite'],
        systemInstruction: 'Bạn là chuyên gia OCR công thức toán tiếng Việt.'
      });
    } catch (geminiError) {
      console.warn('[Math support OCR Gemini fallback]', { code: geminiError?.code || 'UNKNOWN' });
      result = await generateOpenAIJson({
        input: prompt, imageDataUrl: image, schema: ocrSchema,
        model: process.env.OPENAI_OCR_MODEL || process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra',
        timeoutMs: OCR_OPENAI_TIMEOUT_MS, maxOutputTokens: 8_000, reasoningEffort: 'low',
        systemInstruction: 'Bạn là chuyên gia OCR công thức toán tiếng Việt. Chỉ chép nội dung nhìn thấy, không giải hoặc tự suy diễn.'
      });
      source = 'openai-fallback';
    }
    const data = { ...result.data, latexText: normalizeOcrLatex(standalone ? normalizeStandaloneMath(result.data?.latexText) : result.data?.latexText) };
    if (standalone) data.topic = MATH_SUPPORT_TOPICS.includes(data.topic) ? data.topic : '';
    return res.status(200).json({ success: true, source, model: result.model, data });
  } catch (error) { return handleAiError(res, error); }
}
