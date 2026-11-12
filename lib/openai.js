import { text } from './ai.js';

function outputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function parseJson(value) {
  const raw = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function strictSchema(schema) {
  const result = structuredClone(schema);
  const normalize = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object' || node.properties) {
      node.additionalProperties = false;
      node.required = Object.keys(node.properties || {});
      Object.values(node.properties || {}).forEach(normalize);
    }
    if (node.type === 'array') normalize(node.items);
    for (const key of ['anyOf', 'allOf', 'oneOf']) {
      if (Array.isArray(node[key])) node[key].forEach(normalize);
    }
  };
  normalize(result);
  return result;
}

export async function generateOpenAIJson({
  input,
  imageDataUrl,
  imageDataUrls,
  schema,
  systemInstruction,
  model = process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra',
  timeoutMs = 160_000,
  maxOutputTokens = 12_000,
  reasoningEffort = 'low'
}) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY chưa được cấu hình trên Vercel');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5_000, Math.min(160_000, Number(timeoutMs) || 160_000)));
  let response;
  try {
    const images = [...(Array.isArray(imageDataUrls)?imageDataUrls:[]),...(imageDataUrl?[imageDataUrl]:[])].slice(0,8);
    const userContent = images.length
      ? [
          { type: 'input_text', text: text(input, 180_000) },
          ...images.map(url=>({ type: 'input_image', image_url: text(url, 4_000_000), detail: 'high' }))
        ]
      : text(input, 180_000);
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: text(model, 80),
        input: [
          { role: 'system', content: text(systemInstruction, 20_000) },
          { role: 'user', content: userContent }
        ],
        reasoning: { effort: reasoningEffort },
        max_output_tokens: Math.max(2_000, Math.min(64_000, Number(maxOutputTokens) || 8_000)),
        text: {
          format: {
            type: 'json_schema',
            name: 'vmo_solution_verification',
            strict: true,
            schema: strictSchema(schema)
          }
        }
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('OPENAI_TIMEOUT');
      timeout.code = 'OPENAI_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`OPENAI_HTTP_${response.status}`);
    error.code = `OPENAI_HTTP_${response.status}`;
    error.status = response.status;
    error.openaiType = text(payload?.error?.type, 80);
    error.openaiCode = text(payload?.error?.code, 80);
    error.requestId = text(response.headers?.get?.('x-request-id'), 120);
    console.error('[OpenAI response error]', {
      status: response.status,
      type: error.openaiType,
      code: error.openaiCode,
      requestId: error.requestId
    });
    throw error;
  }
  if (payload?.status === 'incomplete') {
    const error = new Error('OPENAI_INCOMPLETE');
    error.code = 'OPENAI_INCOMPLETE';
    error.reason = String(payload.incomplete_details?.reason || 'unknown');
    console.error('[OpenAI incomplete]', { model: text(model, 80), reason: error.reason,
      outputTokens: payload.usage?.output_tokens, reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens });
    throw error;
  }
  const data = parseJson(outputText(payload));
  if (!data) {
    const error = new Error('OPENAI_INVALID_JSON');
    error.code = 'OPENAI_INVALID_JSON';
    throw error;
  }
  return { data, model: payload.model || text(model, 80), responseId: payload.id || '' };
}
