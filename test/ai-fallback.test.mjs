import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateWithOpenAIFallback } from '../lib/ai.js';
import { generateOpenAIJson } from '../lib/openai.js';

const originalKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;

try {
  process.env.OPENAI_API_KEY = 'test-key-not-a-real-secret';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, headers: options.headers, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'completed', output_text: '{"ok":true}', model: 'mock-model', id: 'mock-id' })
    };
  };

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      questions: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
      }
    },
    required: ['title']
  };
  const result = await generateOpenAIJson({
    input: 'Read this image.',
    imageDataUrl: 'data:image/png;base64,dGVzdA==',
    schema,
    maxOutputTokens: 32_000
  });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.model, 'mock-model');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.Authorization, `Bearer ${process.env.OPENAI_API_KEY}`);
  assert.equal(request.body.max_output_tokens, 32_000);
  const strictSchema = request.body.text.format.schema;
  assert.equal(strictSchema.additionalProperties, false);
  assert.deepEqual(strictSchema.required, ['title', 'questions']);
  assert.equal(strictSchema.properties.questions.items.additionalProperties, false);
  assert.deepEqual(strictSchema.properties.questions.items.required, ['id']);
  assert.equal(schema.additionalProperties, undefined, 'Provider normalization must not mutate shared schemas');
  assert.equal(request.body.input[1].content[1].type, 'input_image');

  const primaryUnavailable = Object.assign(new Error('provider unavailable'), { status: 503 });
  let fallbackCalled = false;
  const recovered = await generateWithOpenAIFallback(
    async () => { throw primaryUnavailable; },
    async () => { fallbackCalled = true; return { data: { recovered: true }, model: 'openai-mock' }; },
    { stage: 'solver' }
  );
  assert.equal(fallbackCalled, true);
  assert.equal(recovered.provider, 'openai');
  assert.equal(recovered.data.recovered, true);

  const primaryResult = await generateWithOpenAIFallback(
    async () => ({ data: { primary: true }, model: 'gemini-mock' }),
    async () => assert.fail('Fallback must not run when the primary succeeds')
  );
  assert.equal(primaryResult.provider, 'google');

  const invalidRequest = Object.assign(new Error('invalid request'), { status: 400 });
  await assert.rejects(
    generateWithOpenAIFallback(async () => { throw invalidRequest; }, async () => assert.fail('Do not retry non-transient errors')),
    error => error === invalidRequest
  );

  const fallbackFailure = Object.assign(new Error('authentication rejected'), { code: 'OPENAI_HTTP_401' });
  await assert.rejects(
    generateWithOpenAIFallback(async () => { throw primaryUnavailable; }, async () => { throw fallbackFailure; }, { stage: 'grader' }),
    error => error === fallbackFailure && error.aiStage === 'grader' && error.cause === primaryUnavailable
  );

  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'redacted' }) });
  await assert.rejects(
    generateOpenAIJson({ input: 'test', schema }),
    error => error.code === 'OPENAI_HTTP_401' && !error.message.includes(process.env.OPENAI_API_KEY)
  );

  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    headers: { get: () => 'req_mock' },
    json: async () => ({ error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } })
  });
  await assert.rejects(
    generateOpenAIJson({ input: 'test', schema }),
    error => error.code === 'OPENAI_HTTP_429' && error.openaiType === 'insufficient_quota'
      && error.openaiCode === 'credit_balance_exhausted' && error.requestId === 'req_mock'
  );

  const [guide, evaluation, prediction, translation] = await Promise.all([
    readFile(new URL('../api/ai-guide.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/ai-evaluate-solution.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/ai-predict-exam.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/translate-content.js', import.meta.url), 'utf8')
  ]);
  assert.match(guide, /generateWithOpenAIFallback/);
  assert.match(guide, /AI GUIDE diagram fallback/);
  assert.match(evaluation, /generateWithOpenAIFallback/);
  assert.match(prediction, /generateWithOpenAIFallback/);
  assert.match(translation, /generateWithOpenAIFallback/);
  console.log('AI fallback routing and OpenAI structured vision request: OK');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
}
