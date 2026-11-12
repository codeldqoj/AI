import { resolveUniversityCourse, UNIVERSITY_MAX_DAYS, UNIVERSITY_MAX_QUESTIONS } from '../lib/university-catalog.js';
import { getDb } from '../lib/db.js';
import { allows } from '../lib/education-access.js';
import { getSession } from '../lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from '../lib/ai.js';
import { generateOpenAIJson } from '../lib/openai.js';

const OCR_ATTEMPT_TIMEOUT_MS = 40_000;
const OCR_TOTAL_TIMEOUT_MS = 48_000;
const OCR_OPENAI_TIMEOUT_MS = 60_000;
const OCR_MAX_OUTPUT_TOKENS = 24_000;

function ocrModels() {
  return [
    process.env.GEMINI_OCR_MODEL,
    'gemini-3.5-flash-lite'
  ];
}

const schema = {
  type: 'object',
  properties: {
    province: { type: 'string' },
    examTitle: { type: 'string' },
    examDate: { type: 'string' },
    duration: { type: 'number' },
    dayNumber: { type: 'number' },
    confidence: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionNumber: { type: 'number' },
          title: { type: 'string' },
          topic: { type: 'string' },
          maxScore: { type: 'number' },
          content: { type: 'string' }
        },
        required: ['questionNumber', 'title', 'topic', 'maxScore', 'content']
      }
    }
  },
  required: ['province', 'examTitle', 'examDate', 'duration', 'dayNumber', 'confidence', 'questions'],
  additionalProperties: false
};
schema.properties.questions.items.additionalProperties = false;

function normalizeMath(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\\\$/g, '$')
    .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
    .trim();
}

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const session = await getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!['admin', 'teacher'].includes(session.role)) return res.status(403).json({ success: false, error: 'Chỉ Admin hoặc Giáo viên được OCR đề thi' });
  if (!checkRateLimit(`exam-ocr:${session.username}`, 12)) {
    return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu OCR quá nhanh' });
  }

  const body = parseBody(req);
  if (!allows(session, body?.destination === 'university' ? 'university' : body?.destination === 'admission' ? 'lower_secondary' : 'upper_secondary')) return res.status(403).json({ success: false, error: 'Không có quyền OCR nội dung cấp học này' });
  if (['olympic30', 'duyenhai'].includes(body?.destination) && ![10, 11].includes(Number(body?.grade))) {
    return res.status(400).json({ success: false, error: 'Vui lòng chọn Lớp 10 hoặc Lớp 11' });
  }
  const course = body?.destination === 'university' ? await resolveUniversityCourse(await getDb(),body.courseId) : null;
  if (body?.destination === 'university' && !course) return res.status(400).json({ success: false, error: 'Học phần không hợp lệ' });
  const section = course ? course.sections.find(s=>s.id===body.sectionId) : null;
  if(course && !section) return res.status(400).json({success:false,error:'Chuyên đề con không thuộc học phần đã chọn'});
  const questionLimit=course ? Number(body.questionCount ?? 10) : 10;
  if(!Number.isInteger(questionLimit)||questionLimit<1||questionLimit>UNIVERSITY_MAX_QUESTIONS)return res.status(400).json({success:false,error:'Số câu khai báo phải từ 1–1000'});
  const requestedDay=Number(body.dayNumber ?? 1);
  if(course && (!Number.isInteger(requestedDay)||requestedDay<1||requestedDay>UNIVERSITY_MAX_DAYS))return res.status(400).json({success:false,error:'Ngày thi phải từ 1–999'});
  const image = text(body?.image, 4_000_000);
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ success: false, error: 'Thiếu ảnh JPEG, PNG hoặc WEBP hợp lệ' });

  const context = {
    province: text(body?.province, 120),
    schoolName: body?.destination === 'admission' ? text(body?.schoolName, 200) : '',
    year: text(body?.year, 40) || '2026-2027',
    dayNumber: course ? requestedDay : Math.max(1, Math.min(['tst', 'regional', 'vmo', 'olympic', 'olympic30', 'duyenhai', 'admission', 'university'].includes(body?.destination) ? 4 : 2, Number(body?.dayNumber) || 1))
  };
  const prompt = `Nhận dạng chính xác đề thi Toán bằng ngôn ngữ trong ảnh và tách thành từng câu hỏi.

Ngữ cảnh do quản trị viên cung cấp: ${course ? `Học phần Đại học ${course.code}: ${course.name} (${course.nameVi}). Chuyên đề con: ${section.number}. ${section.title}. Giữ nguyên ngôn ngữ đề và thuật ngữ học phần. ` : ''} tỉnh/thành phố "${context.province}", năm học "${context.year}", ngày thi thứ ${context.dayNumber}.${context.schoolName ? ` Kỳ thi tuyển sinh vào lớp 10 chuyên, trường: ${context.schoolName}.` : ''}${['olympic30', 'duyenhai'].includes(body?.destination) && [10, 11].includes(Number(body?.grade)) ? ` Khối lớp: Lớp ${Number(body.grade)}.` : ''}

Quy tắc bắt buộc:
1. Chỉ chép nội dung nhìn thấy; không giải bài, không bổ sung giả thiết và không suy diễn phần bị khuất.
2. Giữ đúng số câu, các ý a), b), c), điểm số, ký hiệu và điều kiện toán học.
3. Trong trường content: công thức nội dòng đặt trong $...$; công thức riêng dòng đặt trong $$...$$.
4. Không để lệnh LaTeX trần ngoài delimiter. Không dùng align/align*; nếu cần nhiều dòng, dùng $$\\begin{aligned}...\\end{aligned}$$.
5. Dùng LaTeX chuẩn MathJax: \\mathbb, \\frac, \\sqrt, \\le, \\ge, \\ne, \\in, \\to, \\mid.
6. title ngắn gọn dạng "Câu 5"; topic là một trong các mô tả như Đại số, Số học, Hình học, Tổ hợp, Phương trình hàm, Dãy số.
7. examDate dùng định dạng YYYY-MM-DD nếu đọc được, nếu không để chuỗi rỗng. duration là số phút.
8. Đề có tổng số ${questionLimit} câu theo khai báo; chỉ chép những câu nhìn thấy trong ảnh hiện tại, không tạo câu bị thiếu.
9. Trả đúng JSON theo schema, không Markdown và không văn bản ngoài JSON.`;

  try {
    let source = 'gemini';
    let result;
    try {
      // Giữ nguyên đường OCR Gemini đã ổn định ở chức năng TST: ảnh + prompt,
      // structured JSON, temperature 0 và không ép thinkingLevel.
      result = await generateJson({
        contents: {
          parts: [
            { inlineData: { mimeType: match[1], data: match[2] } },
            { text: prompt }
          ]
        },
        schema,
        temperature: 0,
        models: ocrModels(),
        timeoutMs: OCR_ATTEMPT_TIMEOUT_MS,
        totalTimeoutMs: OCR_TOTAL_TIMEOUT_MS,
        maxOutputTokens: OCR_MAX_OUTPUT_TOKENS,
        systemInstruction: 'Bạn là chuyên gia biên tập đề thi Toán, bao gồm Toán Đại học và Olympic. Nhiệm vụ duy nhất là OCR chính xác và tạo LaTeX tương thích MathJax.'
      });
    } catch (geminiError) {
      console.warn('[Exam OCR Gemini fallback]', {
        code: geminiError?.code || 'UNKNOWN', finishReason: geminiError?.finishReason || ''
      });
      result = await generateOpenAIJson({
        input: prompt,
        imageDataUrl: image,
        schema,
        model: process.env.OPENAI_OCR_MODEL || process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra',
        timeoutMs: OCR_OPENAI_TIMEOUT_MS,
        maxOutputTokens: 16_000,
        reasoningEffort: 'low',
        systemInstruction: 'Bạn là chuyên gia OCR đề thi Toán, bao gồm Toán Đại học và Olympic. Chỉ trích xuất trung thực nội dung trong ảnh người dùng cung cấp và trả JSON đúng schema.'
      });
      source = 'openai-fallback';
    }
    const data = result.data || {};
    const rawQuestions=Array.isArray(data.questions)?data.questions:[];
    if(course && rawQuestions.length>questionLimit)return res.status(422).json({success:false,error:'Số câu OCR vượt khai báo. Hãy chỉnh số câu rồi thử lại.'});
    const questions = (course?rawQuestions:rawQuestions.slice(0,10))
      .map((item, index) => ({
        questionNumber: Math.max(1, Number(item?.questionNumber) || index + 1),
        title: text(item?.title, 200) || `Câu ${index + 1}`,
        topic: text(item?.topic, 120) || course?.nameVi || 'Toán Olympic',
        maxScore: Math.max(0, Math.min(20, Number(item?.maxScore) || 0)),
        content: normalizeMath(item?.content)
      }))
      .filter(item => item.content);
    if (!questions.length) return res.status(422).json({ success: false, error: 'Không nhận dạng được câu hỏi nào trong ảnh' });

    return res.status(200).json({
      success: true,
      source,
      model: result.model,
      data: {
        province: text(data.province, 120) || context.province,
        examTitle: text(data.examTitle, 500),
        examDate: text(data.examDate, 20),
        duration: Math.max(1, Math.min(600, Number(data.duration) || 180)),
        dayNumber: course ? requestedDay : Math.max(1, Math.min(['tst', 'regional', 'vmo', 'olympic', 'olympic30', 'duyenhai', 'admission', 'university'].includes(body?.destination) ? 4 : 2, Number(data.dayNumber) || context.dayNumber)),
        confidence: text(data.confidence, 40) || 'unknown',
        questions
      }
    });
  } catch (error) {
    if (error?.code === 'AI_TIMEOUT') {
      console.error('[Exam OCR timeout]', { province: context.province, year: context.year, dayNumber: context.dayNumber });
      return res.status(504).json({ success: false, error: 'OCR đề thi quá thời gian xử lý. Vui lòng thử lại với ảnh rõ hơn hoặc tách thành từng trang.' });
    }
    if (error?.code === 'AI_INVALID_JSON') {
      console.error('[Exam OCR invalid JSON]', { finishReason: error.finishReason });
      return res.status(502).json({ success: false, error: 'Gia sư Toán AI chưa nhận dạng được đầy đủ cấu trúc đề thi. Vui lòng thử lại ảnh này.' });
    }
    return handleAiError(res, error);
  }
}
