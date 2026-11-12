let client;
const calls = new Map();

function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function normalizeMathOutput(value) {
  if (typeof value === 'string') {
    return value
      .replace(/\\begin\{(?:itemize|enumerate)\}/g, '\n')
      .replace(/\\end\{(?:itemize|enumerate)\}/g, '\n')
      .replace(/\\item\s*/g, '\n- ')
      .replace(/\\textbf\{([^{}]*)\}/g, '**$1**');
  }
  if (Array.isArray(value)) return value.map(normalizeMathOutput);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeMathOutput(item)]));
  }
  return value;
}

export function checkRateLimit(username, limit = 12, windowMs = 60_000) {
  const key = String(username || 'anonymous');
  const now = Date.now();
  const recent = (calls.get(key) || []).filter(time => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  calls.set(key, recent);
  return true;
}

export function text(value, max = 50_000) {
  return String(value ?? '').trim().slice(0, max);
}

export function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body); } catch { return null; }
}

export async function generateJson({
  contents,
  schema,
  systemInstruction,
  temperature = 0.15,
  models = ['gemini-3.5-flash-lite'],
  timeoutMs = 22_000,
  totalTimeoutMs,
  maxOutputTokens,
  thinkingLevel
}) {
  if (!process.env.GEMINI_API_KEY && typeof process.loadEnvFile === 'function') {
    try {
      const fs = await import('node:fs');
      if (fs.existsSync('.env')) process.loadEnvFile('.env');
      else if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
    } catch {}
  }
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY chưa được cấu hình trên Vercel');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  if (!client) {
    const { GoogleGenAI } = await import('@google/genai');
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // Dùng model hiện hành hỗ trợ ảnh và structured JSON. Có thể ghi đè model
  // qua tham số `models` ở từng chức năng khi cần.
  const requestedModels = Array.isArray(models) && models.length
    ? models.map(value => text(value, 80)).filter(Boolean)
    : ['gemini-3.5-flash-lite'];
  const modelList = [...new Set(requestedModels)].slice(0, 3);
  const requestTimeout = Math.max(5_000, Math.min(160_000, Number(timeoutMs) || 22_000));
  const totalTimeout = Number.isFinite(Number(totalTimeoutMs))
    ? Math.max(5_000, Math.min(290_000, Number(totalTimeoutMs)))
    : null;
  const startedAt = Date.now();
  const outputTokenLimit = Number.isFinite(Number(maxOutputTokens))
    ? Math.max(2_000, Math.min(64_000, Number(maxOutputTokens)))
    : null;
  const normalizedThinkingLevel = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'].includes(String(thinkingLevel || '').toUpperCase())
    ? String(thinkingLevel).toUpperCase()
    : '';
  let lastError;
  for (const model of modelList) {
    let timer;
    try {
      const remainingMs = totalTimeout ? totalTimeout - (Date.now() - startedAt) : requestTimeout;
      if (remainingMs <= 0) {
        const error = new Error('AI_TIMEOUT');
        error.code = 'AI_TIMEOUT';
        throw error;
      }
      const attemptTimeout = Math.min(requestTimeout, remainingMs);
      const response = await Promise.race([
        client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            temperature,
            ...(outputTokenLimit ? { maxOutputTokens: outputTokenLimit } : {}),
            ...(normalizedThinkingLevel
              ? { thinkingConfig: { thinkingLevel: normalizedThinkingLevel } }
              : {})
          }
        }),
        new Promise((_, reject) => { timer = setTimeout(() => {
          const error = new Error('AI_TIMEOUT');
          error.code = 'AI_TIMEOUT';
          reject(error);
        }, attemptTimeout); })
      ]);
      const data = parseJson(response?.text);
      if (data) return { data: normalizeMathOutput(data), model };
      const finishReason = String(response?.candidates?.[0]?.finishReason || 'UNKNOWN');
      lastError = new Error(`AI_INVALID_JSON:${finishReason}`);
      lastError.code = finishReason === 'RECITATION' ? 'AI_RECITATION' : 'AI_INVALID_JSON';
      lastError.finishReason = finishReason;
      console.error('[Gemini JSON]', { model, finishReason,
        outputTokens: response?.usageMetadata?.candidatesTokenCount,
        thinkingTokens: response?.usageMetadata?.thoughtsTokenCount });
    } catch (error) {
      // RECITATION là quyết định chặn đầu ra, thử lại cùng nhà cung cấp/model
      // khác thường chỉ lặp lại kết quả và làm cạn ngân sách Vercel.
      if (error?.code === 'AI_RECITATION') throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Không nhận được phản hồi AI');
}

export async function generateWithOpenAIFallback(primary, fallback, { stage, onFallback } = {}) {
  try {
    return { ...await primary(), provider: 'google' };
  } catch (primaryError) {
    const code = text(primaryError?.code, 80);
    const status = Number(primaryError?.status);
    const retryable = ['AI_NOT_CONFIGURED', 'AI_TIMEOUT', 'AI_INVALID_JSON', 'AI_RECITATION'].includes(code)
      || status === 429 || status >= 500 || primaryError?.name === 'TypeError';
    if (!retryable) throw primaryError;
    onFallback?.(primaryError);
    try {
      return { ...await fallback(primaryError), provider: 'openai' };
    } catch (fallbackError) {
      if (fallbackError && typeof fallbackError === 'object' && stage) {
        fallbackError.aiStage = stage;
        if (!fallbackError.cause) fallbackError.cause = primaryError;
      }
      throw fallbackError;
    }
  }
}

export function prepare(res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export function handleAiError(res, error) {
  console.error('[AI API]', error);
  const code = text(error?.code, 80);
  const status = code.endsWith('_NOT_CONFIGURED') ? 503
    : code.endsWith('_TIMEOUT') ? 504
      : error?.status === 429 || code.endsWith('_HTTP_429') ? 503 : 502;
  const messages = {
    AI_NOT_CONFIGURED: 'Chưa cấu hình GEMINI_API_KEY cho dịch vụ AI trên Vercel.',
    OPENAI_NOT_CONFIGURED: 'Chưa cấu hình OPENAI_API_KEY cho dịch vụ AI dự phòng trên Vercel.',
    AI_TIMEOUT: 'Gemini xử lý ảnh quá thời gian cho phép. Vui lòng thử ảnh rõ, gọn hơn hoặc thử lại.',
    OPENAI_TIMEOUT: 'Dịch vụ AI dự phòng OpenAI xử lý quá thời gian cho phép. Vui lòng thử lại.',
    AI_RECITATION: 'Gemini không thể đọc ảnh này. Hãy thử ảnh rõ hơn hoặc chụp lại riêng phần đề.',
    OPENAI_INCOMPLETE: 'AI dự phòng OpenAI chưa hoàn tất kết quả. Vui lòng thử yêu cầu ngắn, rõ hơn.',
    OPENAI_INVALID_JSON: 'AI dự phòng OpenAI trả kết quả không hợp lệ. Vui lòng thử lại.',
    OPENAI_HTTP_401: 'Khóa API dự phòng OpenAI không hợp lệ. Quản trị viên cần kiểm tra cấu hình Vercel.',
    OPENAI_HTTP_403: 'Tài khoản OpenAI chưa được cấp quyền cho model đang cấu hình.',
    OPENAI_HTTP_429: 'Dịch vụ OpenAI đang giới hạn tốc độ hoặc đã hết hạn mức API. Kiểm tra trang Usage/Billing của OpenAI hoặc thử lại sau.',
    OPENAI_HTTP_400: 'Model OpenAI từ chối yêu cầu hoặc định dạng kết quả.'
  };
  const errorMessage = code === 'OPENAI_HTTP_429'
    && (error?.openaiType === 'insufficient_quota' || ['insufficient_quota', 'credit_balance_exhausted'].includes(error?.openaiCode))
    ? 'OpenAI API đã hết hạn mức khả dụng. Quản trị viên cần kiểm tra Billing/Usage và giới hạn chi tiêu của Project trên OpenAI.'
    : messages[code] || `Dịch vụ AI gặp lỗi${code ? ` (${code})` : ''}. Vui lòng thử lại; nếu tiếp tục, gửi mã lỗi cho quản trị viên.`;
  return res.status(status).json({ success: false, error: errorMessage, ...(code ? { code } : {}) });
}
